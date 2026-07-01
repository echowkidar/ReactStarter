/**
 * AMU Scanner Helper — Standalone Executable
 * Bridges browser WebSocket (ws://localhost:8765) to Windows WIA scanners.
 */

const { WebSocketServer } = require('ws');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── SELF-INSTALLATION LOGIC ───
const isExe = process.pkg || process.execPath.endsWith('.exe');
const exePath = process.execPath;
const appDataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'AMU-ScannerHelper');
const targetExePath = path.join(appDataDir, 'AMU_Scanner_Helper.exe');
const startupDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const shortcutVbs = path.join(startupDir, 'AMU_Scanner_Helper.vbs');

if (isExe && exePath.toLowerCase() !== targetExePath.toLowerCase()) {
  console.log("Installing AMU Scanner Helper...");
  try {
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
    // Copy the exe to AppData
    fs.copyFileSync(exePath, targetExePath);
    console.log("Copied to", targetExePath);

    // Create a VBScript in Startup folder to launch it completely silently
    const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run chr(34) & "${targetExePath}" & Chr(34), 0, False\n`;
    fs.writeFileSync(shortcutVbs, vbsContent);
    console.log("Added to Startup folder.");

    // Launch the installed version
    const { spawn } = require('child_process');
    const child = spawn(targetExePath, [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    
    // Alert user
    exec(`powershell -Command "[Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('AMU Scanner Helper installed successfully! It will now run in the background and auto-start with Windows.', 'Setup Complete', 0, 64)"`);

    process.exit(0);
  } catch (err) {
    console.error("Install failed:", err);
    exec(`powershell -Command "[Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('Installation failed: ${err.message}', 'Error', 0, 16)"`);
    process.exit(1);
  }
}

// ─── MAIN WEBSOCKET SERVER ───
const PORT = 8765;
let wss;

try {
  wss = new WebSocketServer({ port: PORT });
  console.log(`[AMU Scanner Helper] WebSocket server listening on ws://localhost:${PORT}`);
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use. Helper might already be running.`);
    process.exit(0);
  } else {
    throw err;
  }
}

// PowerShell script to list WIA devices
const LIST_SCANNERS_PS = `
Add-Type -AssemblyName System.Runtime.InteropServices
try {
  $wia = New-Object -ComObject WIA.DeviceManager
  $devices = $wia.DeviceInfos
  $list = @()
  for ($i = 1; $i -le $devices.Count; $i++) {
    $d = $devices.Item($i)
    # Removed Type check to allow all WIA devices (including MFPs that might report as Type 2/3)
    $list += [PSCustomObject]@{
      id   = $d.DeviceID
      name = $d.Properties.Item("Name").Value
    }
  }
  if ($list.Count -eq 0) {
    Write-Output '[]'
  } else {
    $list | ConvertTo-Json -Compress
  }
} catch {
  $list = @()
  $list += [PSCustomObject]@{
    id = "error"
    name = "Error: " + $_.Exception.Message
  }
  $list | ConvertTo-Json -Compress
}
`;

// PowerShell script to scan from a specific device
function buildScanPS(deviceId, outputPath) {
  return `
Add-Type -AssemblyName System.Runtime.InteropServices
try {
  $wia = New-Object -ComObject WIA.DeviceManager
  $devices = $wia.DeviceInfos
  $device = $null
  for ($i = 1; $i -le $devices.Count; $i++) {
    if ($devices.Item($i).DeviceID -eq '${deviceId}') {
      $device = $devices.Item($i).Connect()
      break
    }
  }
  if ($device -eq $null) { Write-Error "Device not found"; exit 1 }
  $item = $device.Items.Item(1)
  
  # Removed property overrides as they cause "The parameter is incorrect" on many models
  
  $imgFile = New-Object -ComObject WIA.ImageFile
  $imgTransfer = New-Object -ComObject WIA.ImageProcess
  $imgTransfer.Filters.Add($imgTransfer.FilterInfos.Item("Convert").FilterID)
  $imgTransfer.Filters.Item(1).Properties.Item("FormatID").Value = "{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}" # PNG
  
  $scanned = $device.Items.Item(1).Transfer()
  $image = $imgTransfer.Apply($scanned)
  $image.SaveFile('${outputPath.replace(/\\/g, '\\\\')}')
  Write-Output "OK"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;
}

wss.on('connection', (ws) => {
  console.log('[AMU Scanner Helper] Browser connected');

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.action === 'list-scanners') {
      console.log('[AMU Scanner Helper] Listing WIA scanners...');
      try {
        const tmpPsList = path.join(os.tmpdir(), `amu-list-${Date.now()}.ps1`);
        fs.writeFileSync(tmpPsList, LIST_SCANNERS_PS, 'utf8');

        const result = execSync(
          `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tmpPsList}"`,
          { timeout: 15000, encoding: 'utf8', windowsHide: true }
        ).trim();

        try { fs.unlinkSync(tmpPsList); } catch {}

        let scanners = [];
        try { scanners = JSON.parse(result); } catch {}
        if (!Array.isArray(scanners)) scanners = [];

        if (scanners.length > 0) scanners[0].isDefault = true;
        ws.send(JSON.stringify({ type: 'scanners', scanners }));
      } catch (err) {
        console.error('[AMU Scanner Helper] Error listing scanners:', err.message);
        ws.send(JSON.stringify({ type: 'scanners', scanners: [] }));
      }

    } else if (msg.action === 'scan') {
      const scannerId = msg.scannerId;
      console.log(`[AMU Scanner Helper] Scanning from device: ${scannerId}`);

      const tmpFile = path.join(os.tmpdir(), `amu-scan-${Date.now()}.png`);
      const psScript = buildScanPS(scannerId, tmpFile);

      const tmpPs = path.join(os.tmpdir(), `amu-scan-${Date.now()}.ps1`);
      fs.writeFileSync(tmpPs, psScript, 'utf8');

      exec(
        `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tmpPs}"`,
        { timeout: 60000, windowsHide: true },
        (err, stdout, stderr) => {
          try { fs.unlinkSync(tmpPs); } catch {}

          if (err) {
            console.error('[AMU Scanner Helper] Scan error:', stderr || err.message);
            ws.send(JSON.stringify({ type: 'error', message: stderr || err.message }));
            return;
          }

          try {
            const imgData = fs.readFileSync(tmpFile);
            const base64 = imgData.toString('base64');
            try { fs.unlinkSync(tmpFile); } catch {}
            console.log(`[AMU Scanner Helper] Scan complete, size: ${imgData.length} bytes`);
            ws.send(JSON.stringify({ type: 'scan-result', data: base64, format: 'png' }));
          } catch (readErr) {
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to read scanned file' }));
          }
        }
      );
    }
  });

  ws.on('close', () => console.log('[AMU Scanner Helper] Browser disconnected'));
  ws.on('error', (err) => console.error('[AMU Scanner Helper] WS error:', err.message));
});

// Keep process alive silently
process.on('uncaughtException', (err) => {
  console.error('[AMU Scanner Helper] Uncaught error:', err.message);
});
