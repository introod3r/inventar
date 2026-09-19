/**
 * Universal Zero-Install Browser Printing for Thermal Printers
 * Works across all browsers and operating systems (iOS Safari, Android Chrome, Windows, macOS, Linux)
 * using zero-margin @page rules and crisp monochrome contrast.
 */

import QRCode from "qrcode";
import type { ThermalReceiptData, ThermalRollWidth, ThermalLabelSize } from "./types";
import { THERMAL_LABEL_DIMENSIONS } from "./types";

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]!));
}

/**
 * Prints a POS Revers Slip using universal browser printing
 */
export async function printThermalReceiptViaBrowser(
  data: ThermalReceiptData,
  rollWidth: ThermalRollWidth = 80
): Promise<void> {
  const qrDataUrl = await QRCode.toDataURL(data.reversCode, {
    margin: 1,
    width: rollWidth === 58 ? 160 : 200,
  });

  const widthMm = rollWidth;
  const paddingMm = rollWidth === 58 ? 2 : 3;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Revers_${escapeHtml(data.reversCode)}</title>
  <style>
    @page {
      size: ${widthMm}mm auto;
      margin: 0;
    }
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: ${paddingMm}mm;
      width: ${widthMm}mm;
      font-family: 'Courier New', Courier, Monaco, monospace;
      font-size: ${rollWidth === 58 ? "9pt" : "10pt"};
      line-height: 1.25;
      color: #000000;
      background: #ffffff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .font-large { font-size: ${rollWidth === 58 ? "11pt" : "13pt"}; }
    .font-small { font-size: 8pt; }
    .font-mono { font-family: monospace; }
    
    .divider {
      border-top: 1px dashed #000000;
      margin: 3mm 0;
    }
    .double-divider {
      border-top: 2px solid #000000;
      margin: 3mm 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 1mm;
      font-size: ${rollWidth === 58 ? "8.5pt" : "9.5pt"};
    }
    .meta-label {
      font-weight: bold;
      white-space: nowrap;
      margin-right: 2mm;
    }
    .meta-val {
      text-align: right;
      word-break: break-word;
    }
    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 2mm 0;
    }
    .qr-container img {
      width: ${rollWidth === 58 ? "36mm" : "44mm"};
      height: ${rollWidth === 58 ? "36mm" : "44mm"};
      image-rendering: pixelated;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 2mm 0;
      font-size: ${rollWidth === 58 ? "8pt" : "9pt"};
    }
    .items-table th {
      text-align: left;
      border-bottom: 1px dashed #000000;
      padding-bottom: 1mm;
      font-weight: bold;
    }
    .items-table td {
      padding: 1.5mm 0;
      vertical-align: top;
    }
    .signature-box {
      margin-top: 5mm;
      text-align: center;
    }
    .signature-img {
      max-height: 24mm;
      max-width: 80%;
      margin: 2mm auto;
      display: block;
      image-rendering: crisp-edges;
    }
    .signature-line {
      border-bottom: 1px dotted #000000;
      margin: 4mm auto 1.5mm;
      width: 80%;
    }
    .disclaimer {
      font-size: 7.5pt;
      line-height: 1.2;
      text-align: justify;
      margin: 3mm 0;
    }
    .cut-guide {
      text-align: center;
      font-size: 8pt;
      margin-top: 5mm;
      padding-bottom: 3mm;
      border-top: 1px dashed #999999;
      padding-top: 2mm;
    }
  </style>
</head>
<body>
  <!-- Header / Company Memo -->
  <div class="text-center">
    <div class="font-bold font-large">${escapeHtml(data.company.name.toUpperCase())}</div>
    ${data.company.address || data.company.city ? `<div class="font-small">${escapeHtml([data.company.address, data.company.city].filter(Boolean).join(", "))}</div>` : ""}
    ${data.company.pib || data.company.mb ? `<div class="font-small">${escapeHtml([data.company.pib ? `PIB: ${data.company.pib}` : "", data.company.mb ? `MB: ${data.company.mb}` : ""].filter(Boolean).join(" | "))}</div>` : ""}
    ${data.company.phone ? `<div class="font-small">Tel: ${escapeHtml(data.company.phone)}</div>` : ""}
  </div>

  <div class="double-divider"></div>

  <!-- Revers Title & QR -->
  <div class="text-center">
    <div class="font-bold font-large">REVERS: ${escapeHtml(data.reversCode)}</div>
    <div class="qr-container">
      <img src="${qrDataUrl}" alt="QR Revers" />
      <div class="font-small font-mono">* Skeniraj za brzi povrat *</div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Metadata -->
  <div>
    ${data.eventName ? `
    <div class="meta-row">
      <span class="meta-label">Događaj:</span>
      <span class="meta-val font-bold">${escapeHtml(data.eventName)}</span>
    </div>` : ""}
    ${data.clientName ? `
    <div class="meta-row">
      <span class="meta-label">Klijent:</span>
      <span class="meta-val">${escapeHtml(data.clientName)}</span>
    </div>` : ""}
    <div class="meta-row">
      <span class="meta-label">Preuzima:</span>
      <span class="meta-val font-bold">${escapeHtml(data.checkedOutTo)}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Datum:</span>
      <span class="meta-val">${escapeHtml(data.checkedOutAt)}</span>
    </div>
    ${data.expectedReturnAt ? `
    <div class="meta-row">
      <span class="meta-label">Rok povrata:</span>
      <span class="meta-val font-bold">${escapeHtml(data.expectedReturnAt)}</span>
    </div>` : ""}
    ${data.conditionOut ? `
    <div class="meta-row">
      <span class="meta-label">Stanje:</span>
      <span class="meta-val">${escapeHtml(data.conditionOut)}</span>
    </div>` : ""}
    ${data.notes ? `
    <div class="meta-row">
      <span class="meta-label">Napomena:</span>
      <span class="meta-val">${escapeHtml(data.notes)}</span>
    </div>` : ""}
  </div>

  <div class="double-divider"></div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 32%;">ŠIFRA</th>
        <th>NAZIV I S/N</th>
      </tr>
    </thead>
    <tbody>
      ${data.items
        .map(
          (it, idx) => `
        <tr>
          <td class="font-mono font-bold">${escapeHtml(it.code)}</td>
          <td>
            <div>${idx + 1}. ${escapeHtml(it.name)}</div>
            ${it.serialNumber ? `<div class="font-small font-mono">S/N: ${escapeHtml(it.serialNumber)}</div>` : ""}
          </td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div class="divider"></div>
  <div class="text-right font-bold">
    UKUPNO STAVKI: ${data.items.length}
  </div>
  <div class="double-divider"></div>

  <!-- Disclaimer -->
  <div class="disclaimer">
    ${escapeHtml(
      data.company.disclaimer ||
        "Preuzimalac svojim potpisom garantuje da je navedenu opremu primio u ispravnom stanju i preuzima materijalnu odgovornost do zvaničnog razduživanja."
    )}
  </div>

  <!-- Signature Box -->
  <div class="signature-box">
    ${
      data.signatureDataUrl
        ? `<img src="${data.signatureDataUrl}" class="signature-img" alt="Digitalni potpis" />`
        : `<div class="signature-line"></div>`
    }
    <div class="font-small">Potpis preuzimaoca: <strong>${escapeHtml(data.checkedOutTo)}</strong></div>
  </div>

  <!-- Footer -->
  <div class="cut-guide">
    <div class="font-small font-mono">Generisano: ${new Date().toLocaleString("sr-RS")}</div>
    <div class="font-small font-bold">--- INVENTAR SISTEM ---</div>
    <div style="margin-top: 2mm; font-size: 7pt; color: #666;">- - - - - - - - [ MESTO ZA CEPANJE ] - - - - - - - -</div>
  </div>

  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 500);
    };
  </script>
</body>
</html>`;

  openPrintWindow(html, `Revers-${data.reversCode}`);
}

/**
 * Print thermal labels via browser print window
 */
export async function printThermalLabelsViaBrowser(
  items: Array<{ code: string; name: string; serialNumber?: string | null; companyName?: string }>,
  size: ThermalLabelSize = "50x30",
  _codeType: "qr" | "barcode" | "both" = "qr"
): Promise<void> {
  const dim = THERMAL_LABEL_DIMENSIONS[size] || THERMAL_LABEL_DIMENSIONS["50x30"];
  const qrDataUrls = await Promise.all(
    items.map((it) => QRCode.toDataURL(it.code, { margin: 1, width: 220 }))
  );

  const labelsHtml = items
    .map((it, idx) => {
      const qrUrl = qrDataUrls[idx];
      const company = escapeHtml(it.companyName || "INVENTAR");

      return `
      <div class="label">
        <div class="label-inner">
          <div class="qr-col">
            <img src="${qrUrl}" alt="${escapeHtml(it.code)}" />
          </div>
          <div class="info-col">
            <div class="company">${company}</div>
            <div class="code">${escapeHtml(it.code)}</div>
            <div class="name">${escapeHtml(it.name)}</div>
            ${it.serialNumber ? `<div class="sn">S/N: ${escapeHtml(it.serialNumber)}</div>` : ""}
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Nalepnice (${items.length})</title>
  <style>
    @page {
      size: ${dim.widthMm}mm ${dim.heightMm}mm;
      margin: 0;
    }
    *, *:before, *:after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif;
    }
    .label {
      width: ${dim.widthMm}mm;
      height: ${dim.heightMm}mm;
      padding: 2mm;
      box-sizing: border-box;
      page-break-after: always;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .label-inner {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 2mm;
    }
    .qr-col {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-col img {
      width: ${dim.heightMm - 5}mm;
      height: ${dim.heightMm - 5}mm;
      image-rendering: pixelated;
    }
    .info-col {
      flex: 1;
      min-width: 0;
      line-height: 1.2;
    }
    .company {
      font-size: 6.5pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #333333;
    }
    .code {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${dim.heightMm > 35 ? "10pt" : "8.5pt"};
      font-weight: bold;
      color: #000000;
      margin: 1px 0;
    }
    .name {
      font-size: ${dim.heightMm > 35 ? "8pt" : "7pt"};
      font-weight: 600;
      color: #111111;
      word-break: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .sn {
      font-family: monospace;
      font-size: 6.5pt;
      color: #444444;
      margin-top: 1px;
    }
  </style>
</head>
<body>
  ${labelsHtml}
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 500);
    };
  </script>
</body>
</html>`;

  openPrintWindow(html, `Nalepnice_${items.length}`);
}

function openPrintWindow(html: string, _title: string) {
  const w = window.open("", "_blank", "width=700,height=900");
  if (!w) {
    // Popup was blocked, use hidden iframe fallback
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 60000);
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();
}
