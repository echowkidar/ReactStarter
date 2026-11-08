// Printable dak registers and slips. Each opens a print-ready window
// (A4 landscape for registers) that the browser prints or saves as PDF.

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmtDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
};

function openPrint(title: string, body: string, landscape = true) {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) {
    alert("Please allow pop-ups for this site to print.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
  body { font-family: "Times New Roman", serif; font-size: 11pt; color: #000; }
  h1 { font-size: 15pt; text-align: center; margin: 0; }
  h2 { font-size: 12pt; text-align: center; margin: 2px 0 10px; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 4px 5px; vertical-align: top; font-size: 9.5pt; }
  th { background: #eee; }
  .muted { color: #555; font-size: 9pt; }
  .cancelled td { text-decoration: line-through; color: #777; }
  .sign { height: 34px; }
  .slip { border: 1.5px solid #000; padding: 14px 18px; max-width: 520px; margin: 0 auto 24px; }
  .slip table td { border: none; padding: 3px 4px; font-size: 11pt; }
  .noprint { margin: 10px 0; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Print</button></div>
${body}
<script>setTimeout(function(){ window.print(); }, 300);</script>
</body></html>`);
  w.document.close();
}

const header = (department: string, title: string, from: string, to: string) =>
  `<h1>ALIGARH MUSLIM UNIVERSITY — ${esc(department)}</h1><h2>${esc(title)} · ${fmtDate(from)} to ${fmtDate(to)}</h2>`;

export function printInwardRegister(department: string, data: { from: string; to: string; rows: any[] }) {
  const rows = data.rows.map((r, i) => `<tr class="${r.cancelled ? "cancelled" : ""}">
    <td>${i + 1}</td><td>${esc(r.rNo)}</td><td>${esc(r.receivedOn)}</td><td>${esc(r.from)}</td>
    <td>${esc(r.letterNo || "")}<div class="muted">${esc(r.letterDate || "")}</div></td>
    <td>${esc(r.subject)}<div class="muted">${esc(r.type)}</div></td><td>${esc(r.markedTo || "")}</td>
    <td>${esc(r.disposal || r.status)}${r.fileNo ? `<div class="muted">File: ${esc(r.fileNo)}</div>` : ""}${r.disposedOn ? `<div class="muted">${esc(r.disposedOn)}</div>` : ""}</td></tr>`).join("");
  openPrint("Inward Register", `${header(department, "Inward (Receipt) Register", data.from, data.to)}
    <table><tr><th>S.No.</th><th>R.No.</th><th>Received on</th><th>From</th><th>Letter No. / Date</th><th>Subject</th><th>Marked to</th><th>Disposal</th></tr>${rows || `<tr><td colspan="8">No entries</td></tr>`}</table>`);
}

export function printDespatchRegister(department: string, data: { from: string; to: string; rows: any[] }) {
  const rows = data.rows.map((r, i) => `<tr class="${r.cancelled ? "cancelled" : ""}">
    <td>${i + 1}</td><td>${esc(r.outwardNo)}</td><td>${esc(r.date)}</td><td>${esc(r.to)}</td>
    <td>${esc(r.subject)}<div class="muted">${esc(r.type)}</div></td><td>${esc(r.modeLabel)}${r.trackingNo ? `<div class="muted">${esc(r.trackingNo)}</div>` : ""}</td>
    <td style="text-align:right">${r.postage ? esc(Number(r.postage).toFixed(2)) : ""}</td></tr>`).join("");
  const total = data.rows.filter((r) => !r.cancelled).reduce((s, r) => s + (Number(r.postage) || 0), 0);
  openPrint("Despatch Register", `${header(department, "Despatch (Outward) Register", data.from, data.to)}
    <table><tr><th>S.No.</th><th>Outward No.</th><th>Date</th><th>To</th><th>Subject</th><th>Mode</th><th>Postage (Rs.)</th></tr>${rows || `<tr><td colspan="7">No entries</td></tr>`}
    <tr><td colspan="6" style="text-align:right"><b>Total postage</b></td><td style="text-align:right"><b>${total.toFixed(2)}</b></td></tr></table>`);
}

export function printPeonBook(department: string, data: { from: string; to: string; rows: any[] }) {
  const rows = data.rows.filter((r) => !r.cancelled).map((r, i) => `<tr>
    <td>${i + 1}</td><td>${esc(r.outwardNo)}</td><td>${esc(r.date)}</td><td>${esc(r.to)}</td><td>${esc(r.subject)}</td>
    <td class="sign"></td><td class="sign"></td></tr>`).join("");
  openPrint("Peon Book", `${header(department, "Peon Book (Delivery by hand)", data.from, data.to)}
    <table><tr><th>S.No.</th><th>Outward No.</th><th>Date</th><th>Delivered to</th><th>Subject</th><th>Received by (name &amp; signature)</th><th>Date &amp; time</th></tr>${rows || `<tr><td colspan="7">No entries</td></tr>`}</table>`);
}

/** Acknowledgement slip given at the counter when physical dak is received */
export function printAcknowledgementSlip(department: string, d: {
  inwardNumber?: string | null; receivedAt?: string | null; senderName: string; subject: string;
  dispatchNumber?: string | null; dispatchDate?: string | null; documentType?: string; receivedBy?: string;
}) {
  const when = d.receivedAt ? new Date(d.receivedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "";
  const slip = (copy: string) => `<div class="slip">
    <div style="text-align:center"><b>ALIGARH MUSLIM UNIVERSITY</b><br/>${esc(department)}<br/><u>ACKNOWLEDGEMENT OF RECEIPT</u> <span class="muted">(${copy})</span></div>
    <table style="margin-top:10px">
      <tr><td><b>R.No.</b></td><td>${esc(d.inwardNumber || "-")}</td></tr>
      <tr><td><b>Received on</b></td><td>${esc(when)}</td></tr>
      <tr><td><b>From</b></td><td>${esc(d.senderName)}</td></tr>
      <tr><td><b>Letter No. / Date</b></td><td>${esc(d.dispatchNumber || "-")} ${d.dispatchDate ? `/ ${esc(fmtDate(d.dispatchDate))}` : ""}</td></tr>
      <tr><td><b>Subject</b></td><td>${esc(d.subject)}</td></tr>
      <tr><td><b>Type</b></td><td>${esc(d.documentType || "")}</td></tr>
    </table>
    <div style="margin-top:34px;text-align:right">${esc(d.receivedBy || "Receiving clerk")}<br/><span class="muted">Signature &amp; seal</span></div>
  </div>`;
  openPrint("Acknowledgement", slip("Sender's copy") + slip("Office copy"), false);
}
