import QRCode from "qrcode";

export interface QrItem {
  code: string | null | undefined;
  name: string | null | undefined;
  serial?: string | null | undefined;
}

export type QrLayout =
  | "a4_24"
  | "a4_40"
  | "thermal_single"
  | "thermal_50x30"
  | "thermal_58x40"
  | "thermal_60x40"
  | "thermal_40x25"
  | "thermal_80x50";

export interface QrPrintOptions {
  layout?: QrLayout;
  showCode?: boolean;
  showName?: boolean;
  showSerial?: boolean;
  showCompany?: boolean;
  companyName?: string;
  codeType?: "qr" | "barcode" | "both";
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function generateQrDataUrl(text: string | null | undefined): Promise<string> {
  const cleanText = text?.trim() || "BEZ-SIFRE";
  return QRCode.toDataURL(cleanText, { margin: 1, width: 240 });
}

/**
 * Open a print window with custom layout options for QR labels.
 */
export async function printQrSheet(items: QrItem[], options: QrPrintOptions = {}) {
  if (!items.length) return;

  const {
    layout = "a4_24",
    showCode = true,
    showName = true,
    showSerial = true,
    showCompany = false,
    companyName = "INVENTAR",
  } = options;

  const dataUrls = await Promise.all(
    items.map((i) => generateQrDataUrl(i.code)),
  );

  let gridStyle = "";
  let cellStyle = "";
  let pageStyle = "";
  let isThermal = false;
  let thermalWidth = 58;
  let thermalHeight = 40;

  if (layout.startsWith("thermal_")) {
    isThermal = true;
    if (layout === "thermal_50x30") {
      thermalWidth = 50; thermalHeight = 30;
    } else if (layout === "thermal_60x40") {
      thermalWidth = 60; thermalHeight = 40;
    } else if (layout === "thermal_40x25") {
      thermalWidth = 40; thermalHeight = 25;
    } else if (layout === "thermal_80x50") {
      thermalWidth = 80; thermalHeight = 50;
    } else {
      // thermal_single or thermal_58x40
      thermalWidth = 58; thermalHeight = 40;
    }

    pageStyle = `@page { size: ${thermalWidth}mm ${thermalHeight}mm; margin: 0; }`;
    gridStyle = `display: flex; flex-direction: column; gap: 0;`;
    cellStyle = `
      width: ${thermalWidth}mm;
      height: ${thermalHeight}mm;
      padding: ${thermalHeight > 30 ? "2.5mm" : "1.5mm"};
      box-sizing: border-box;
      page-break-after: always;
      display: flex;
      align-items: center;
      gap: 2mm;
      border: none;
      background: #ffffff;
      color: #000000;
    `;
  } else if (layout === "a4_40") {
    pageStyle = `@page { size: A4 portrait; margin: 6mm; }`;
    gridStyle = `display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm;`;
    cellStyle = `
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 2.5mm;
      display: flex;
      align-items: center;
      gap: 2mm;
      page-break-inside: avoid;
      min-height: 24mm;
    `;
  } else {
    // Default: a4_24 (3 columns x 8 rows)
    pageStyle = `@page { size: A4 portrait; margin: 8mm; }`;
    gridStyle = `display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm;`;
    cellStyle = `
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4mm;
      display: flex;
      align-items: center;
      gap: 3mm;
      page-break-inside: avoid;
      min-height: 30mm;
    `;
  }

  const cells = items
    .map(
      (it, idx) => `
      <div class="cell">
        <img src="${dataUrls[idx]}" alt="${escapeHtml(it.code || 'QR')}" />
        <div class="meta">
          ${showCompany ? `<div class="company">${escapeHtml(companyName)}</div>` : ""}
          ${showCode ? `<div class="code">${escapeHtml(it.code || "BEZ-ŠIFRE")}</div>` : ""}
          ${showName ? `<div class="name">${escapeHtml(it.name || "Bez naziva")}</div>` : ""}
          ${showSerial && it.serial ? `<div class="sn">S/N: ${escapeHtml(it.serial)}</div>` : ""}
        </div>
      </div>`,
    )
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>QR Nalepnice (${items.length})</title>
<style>
  ${pageStyle}
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #0f172a; }
  .grid { ${gridStyle} }
  .cell { ${cellStyle} }
  .cell img {
    width: ${isThermal ? `${Math.max(16, thermalHeight - 8)}mm` : layout === "a4_40" ? "20mm" : "26mm"};
    height: ${isThermal ? `${Math.max(16, thermalHeight - 8)}mm` : layout === "a4_40" ? "20mm" : "26mm"};
    flex-shrink: 0;
    ${isThermal ? "image-rendering: pixelated;" : ""}
  }
  .meta {
    font-size: ${isThermal ? (thermalHeight > 30 ? "8pt" : "7pt") : layout === "a4_40" ? "8pt" : "9pt"};
    line-height: 1.2;
    min-width: 0;
    flex: 1;
  }
  .company {
    font-size: ${isThermal ? "6.5pt" : "7pt"};
    font-weight: 700;
    text-transform: uppercase;
    color: ${isThermal ? "#000000" : "#64748b"};
    margin-bottom: 1px;
  }
  .code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-weight: 700;
    color: ${isThermal ? "#000000" : "#0284c7"};
    font-size: ${isThermal ? (thermalHeight > 30 ? "9.5pt" : "8.5pt") : "inherit"};
  }
  .name {
    margin-top: 1px;
    font-weight: 600;
    color: ${isThermal ? "#000000" : "#0f172a"};
    word-break: break-word;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .sn {
    color: ${isThermal ? "#000000" : "#64748b"};
    font-size: ${isThermal ? "6.5pt" : "7.5pt"};
    margin-top: 1px;
    font-family: monospace;
  }
</style></head>
<body>
  <div class="grid">${cells}</div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 400); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
