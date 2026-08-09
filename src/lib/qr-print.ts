import QRCode from "qrcode";

export interface QrItem {
  code: string;
  name: string;
  serial?: string | null;
}

/**
 * Open a print window with a grid of QR labels (sheet of stickers).
 * Each label: QR + code + name + (serial). Uses A4 with 3 columns, ~70x50mm cells.
 */
export async function printQrSheet(items: QrItem[]) {
  if (!items.length) return;
  const dataUrls = await Promise.all(
    items.map((i) => QRCode.toDataURL(i.code, { margin: 1, width: 240 })),
  );

  const cells = items
    .map(
      (it, idx) => `
      <div class="cell">
        <img src="${dataUrls[idx]}" alt="${it.code}" />
        <div class="meta">
          <div class="code">${escapeHtml(it.code)}</div>
          <div class="name">${escapeHtml(it.name)}</div>
          ${it.serial ? `<div class="sn">S/N: ${escapeHtml(it.serial)}</div>` : ""}
        </div>
      </div>`,
    )
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>QR nalepnice</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #0f172a; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .cell {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 4mm;
    display: flex;
    align-items: center;
    gap: 3mm;
    page-break-inside: avoid;
    min-height: 30mm;
  }
  .cell img { width: 26mm; height: 26mm; }
  .meta { font-size: 9pt; line-height: 1.25; min-width: 0; }
  .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; }
  .name { margin-top: 2px; word-break: break-word; }
  .sn { color: #64748b; font-size: 8pt; margin-top: 2px; }
</style></head>
<body>
  <div class="grid">${cells}</div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
