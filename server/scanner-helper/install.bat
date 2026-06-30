@echo off
setlocal EnableDelayedExpansion
title AMU Scanner Helper - Setup

echo.
echo  ============================================================
echo   AMU Scanner Helper — Setup Wizard
echo   Aligarh Muslim University - Salary Section
echo  ============================================================
echo.

:: Check for Administrator rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [!] This installer needs Administrator privileges.
    echo      Right-click the file and select "Run as administrator"
    pause
    exit /b 1
)

:: Check Node.js
echo  [1/4] Checking Node.js installation...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo  [!] Node.js not found. Downloading Node.js installer...
    echo.
    :: Download Node.js LTS installer
    powershell -NoProfile -Command ^
      "Write-Host '  Downloading Node.js LTS...'; " ^
      "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.15.0/node-v20.15.0-x64.msi' -OutFile '$env:TEMP\node-install.msi'; " ^
      "Write-Host '  Installing Node.js...'; " ^
      "Start-Process msiexec.exe -ArgumentList '/i',$env:TEMP\node-install.msi,'/quiet','/norestart' -Wait; " ^
      "Write-Host '  Node.js installed successfully.'"
    
    :: Refresh PATH
    for /f "tokens=2 delims==" %%a in ('set PATH') do set PATH=%%a
    set "PATH=%PATH%;C:\Program Files\nodejs"
    
    where node >nul 2>&1
    if %errorLevel% neq 0 (
        echo  [!] Node.js installation failed. Please install manually from:
        echo      https://nodejs.org/en/download/
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODEVER=%%v
    echo  [OK] Node.js found: !NODEVER!
)

:: Create install directory
echo.
echo  [2/4] Creating installation directory...
set "INSTALL_DIR=%ProgramFiles%\AMU\ScannerHelper"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo  [OK] Directory: %INSTALL_DIR%

:: Copy helper files
echo.
echo  [3/4] Copying scanner helper files...
copy /Y "%~dp0amu-scanner-helper.js" "%INSTALL_DIR%\amu-scanner-helper.js" >nul
echo  [OK] Helper script copied.

:: Create package.json
echo {"name":"amu-scanner-helper","version":"1.0.0","description":"AMU LPC Scanner Helper","main":"amu-scanner-helper.js","dependencies":{"ws":"^8.0.0"}} > "%INSTALL_DIR%\package.json"

:: Install dependencies
echo.
echo  Installing npm dependencies (ws module)...
cd /d "%INSTALL_DIR%"
call npm install --quiet >nul 2>&1
if %errorLevel% neq 0 (
    echo  [!] npm install failed. Trying with node_modules...
    call npm install ws >nul 2>&1
)
echo  [OK] Dependencies installed.

:: Create startup batch file
echo @echo off > "%INSTALL_DIR%\start-helper.bat"
echo title AMU Scanner Helper >> "%INSTALL_DIR%\start-helper.bat"
echo echo Starting AMU Scanner Helper on port 8765... >> "%INSTALL_DIR%\start-helper.bat"
echo cd /d "%INSTALL_DIR%" >> "%INSTALL_DIR%\start-helper.bat"
echo node amu-scanner-helper.js >> "%INSTALL_DIR%\start-helper.bat"
echo pause >> "%INSTALL_DIR%\start-helper.bat"

:: Create desktop shortcut
echo.
echo  [4/4] Creating shortcuts...
powershell -NoProfile -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; " ^
  "$Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\AMU Scanner Helper.lnk'); " ^
  "$Shortcut.TargetPath = '%INSTALL_DIR%\start-helper.bat'; " ^
  "$Shortcut.WorkingDirectory = '%INSTALL_DIR%'; " ^
  "$Shortcut.Description = 'AMU LPC Scanner Helper'; " ^
  "$Shortcut.Save()"

:: Add to startup (optional — auto-start with Windows)
copy /Y "%INSTALL_DIR%\start-helper.bat" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AMU-Scanner-Helper.bat" >nul 2>&1
echo  [OK] Added to Windows startup (auto-starts with login).

:: Start immediately
echo.
echo  ============================================================
echo   Setup Complete!
echo  ============================================================
echo.
echo   The scanner helper will now start automatically.
echo   A shortcut has been added to your Desktop.
echo.
echo   After this window closes, go back to the AMU system
echo   and click "SCAN LPC" — your scanner should be detected.
echo.
echo   Press any key to start the helper now...
pause >nul

start "" "%INSTALL_DIR%\start-helper.bat"
exit /b 0
