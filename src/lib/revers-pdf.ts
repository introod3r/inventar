import { supabase } from "@/integrations/supabase/client";

export type ReversData = {
  checkoutId: string;
  assets: { code: string; name: string; serial_number?: string | null }[];
  event?: { name: string } | null;
  client?: { name: string } | null;
  checkedOutToName?: string | null;
  checkedOutAt: string;
  expectedReturnAt?: string | null;
  returnedAt?: string | null;
  conditionOut?: string | null;
  conditionIn?: string | null;
  notes?: string | null;
  signatureOutPath?: string | null;
  signatureInPath?: string | null;
  issuedByName?: string | null;
};

async function loadSignaturePng(path: string | null | undefined): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("signatures").download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

// WinAnsi (StandardFonts) ne podržava Č/Ć/Đ/Š/Ž — transliterujemo u ASCII
const TRANSLIT: Record<string, string> = {
  "Č": "C", "č": "c", "Ć": "C", "ć": "c",
  "Đ": "Dj", "đ": "dj", "Š": "S", "š": "s", "Ž": "Z", "ž": "z",
  "—": "-", "–": "-", "„": '"', "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...",
};
const sanitize = (s: string) => s.replace(/[ČčĆćĐđŠšŽž—–„“”‘’…]/g, (c) => TRANSLIT[c] ?? c);

const fmt = (iso?: string | null) => iso ? sanitize(new Date(iso).toLocaleString("sr-RS")) : "-";

export async function generateReversPdf(d: ReversData): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.05, 0.05, 0.07);
  const muted = rgb(0.42, 0.45, 0.5);
  let y = 800;

  page.drawText(sanitize("REVERS - zaduzenje opreme"), { x: 40, y, size: 18, font: bold, color: ink });
  y -= 8;
  page.drawText(`ID: ${d.checkoutId}`, { x: 40, y: y - 14, size: 9, font, color: muted });
  page.drawLine({ start: { x: 40, y: y - 22 }, end: { x: 555, y: y - 22 }, thickness: 0.6, color: muted });
  y -= 44;

  const row = (label: string, value: string) => {
    page.drawText(sanitize(label), { x: 40, y, size: 9, font, color: muted });
    page.drawText(sanitize(value || "-"), { x: 180, y, size: 11, font: bold, color: ink });
    y -= 20;
  };

  page.drawText("Oprema:", { x: 40, y, size: 9, font, color: muted });
  y -= 14;
  for (const a of d.assets) {
    const sn = a.serial_number ? ` (S/N: ${a.serial_number})` : "";
    page.drawText(sanitize(`- ${a.name} [${a.code}]${sn}`), { x: 40, y, size: 10, font: bold, color: ink });
    y -= 14;
  }
  y -= 6;
  row("Dogadjaj:", d.event?.name ?? "-");
  if (d.client) row("Klijent:", d.client.name);
  row("Zaduzeno na:", d.checkedOutToName ?? "-");
  row("Datum izdavanja:", fmt(d.checkedOutAt));
  row("Ocekivani povrat:", fmt(d.expectedReturnAt));
  row("Stanje pri izdavanju:", d.conditionOut ?? "-");
  row("Datum povrata:", fmt(d.returnedAt));
  row("Stanje pri povratu:", d.conditionIn ?? "-");
  if (d.issuedByName) row("Izdao:", d.issuedByName);

  if (d.notes) {
    page.drawText("Napomene:", { x: 40, y, size: 9, font, color: muted });
    y -= 14;
    const lines = sanitize(d.notes).match(/.{1,80}/g) ?? [];
    for (const ln of lines) { page.drawText(ln, { x: 40, y, size: 10, font, color: ink }); y -= 14; }
    y -= 6;
  }

  // Signatures
  y = Math.min(y, 240);
  const sigW = 230, sigH = 90;
  const drawSigBox = async (x: number, label: string, path?: string | null) => {
    page.drawRectangle({ x, y: y - sigH, width: sigW, height: sigH, borderColor: muted, borderWidth: 0.6 });
    page.drawText(sanitize(label), { x, y: y - sigH - 14, size: 9, font, color: muted });
    const bytes = await loadSignaturePng(path);
    if (bytes) {
      try {
        const img = await pdf.embedPng(bytes);
        const dims = img.scaleToFit(sigW - 12, sigH - 12);
        page.drawImage(img, { x: x + (sigW - dims.width) / 2, y: y - sigH + (sigH - dims.height) / 2, width: dims.width, height: dims.height });
      } catch { /* noop */ }
    }
  };
  await drawSigBox(40, "Potpis primaoca (izdavanje)", d.signatureOutPath);
  await drawSigBox(325, "Potpis primaoca (povrat)", d.signatureInPath);

  page.drawText(sanitize(`Generisano: ${new Date().toLocaleString("sr-RS")}`), { x: 40, y: 30, size: 8, font, color: muted });

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
