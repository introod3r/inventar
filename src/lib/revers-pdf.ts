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

import { getStoredCompanySettings, type CompanySettings } from "@/features/company/use-company-settings";

const fmt = (iso?: string | null) => (iso ? sanitize(new Date(iso).toLocaleString("sr-RS")) : "-");

export async function generateReversPdf(d: ReversData, customCompany?: CompanySettings): Promise<Blob> {
  const company = customCompany || getStoredCompanySettings();
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4: 595 x 842 pt
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.08, 0.08, 0.1);
  const muted = rgb(0.42, 0.45, 0.5);
  const lineCol = rgb(0.82, 0.85, 0.9);
  let y = 805;

  // 1. Company Memorandum Header
  page.drawText(sanitize(company.name.toUpperCase()), { x: 40, y, size: 12, font: bold, color: ink });
  y -= 13;

  const memoDetails = [
    company.pib ? `PIB: ${company.pib}` : null,
    company.mb ? `MB: ${company.mb}` : null,
    company.bank_account ? `Racun: ${company.bank_account}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  if (memoDetails) {
    page.drawText(sanitize(memoDetails), { x: 40, y, size: 8, font, color: muted });
    y -= 11;
  }

  const memoContact = [
    company.address ? `${company.address}, ${company.city || ""}` : null,
    company.phone ? `Tel: ${company.phone}` : null,
    company.email ? `Email: ${company.email}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  if (memoContact) {
    page.drawText(sanitize(memoContact), { x: 40, y, size: 8, font, color: muted });
    y -= 14;
  }

  // Divider below company header
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1, color: lineCol });
  y -= 22;

  // 2. Document Title
  const titleText = sanitize(company.revers_title || "REVERS - ZADUZENJE OPREME");
  page.drawText(titleText, { x: 40, y, size: 16, font: bold, color: ink });
  y -= 15;
  page.drawText(`Broj reversa / ID: ${company.revers_prefix}-${d.checkoutId.slice(0, 8).toUpperCase()}`, {
    x: 40,
    y,
    size: 8.5,
    font,
    color: muted,
  });
  y -= 20;

  const row = (label: string, value: string) => {
    page.drawText(sanitize(label), { x: 40, y, size: 8.5, font, color: muted });
    page.drawText(sanitize(value || "-"), { x: 170, y, size: 10, font: bold, color: ink });
    y -= 17;
  };

  // 3. Equipment Section
  page.drawText("Zaduzene stavke opreme:", { x: 40, y, size: 8.5, font: bold, color: muted });
  y -= 13;
  for (const a of d.assets) {
    const sn = a.serial_number ? ` (S/N: ${a.serial_number})` : "";
    page.drawText(sanitize(`• ${a.name} [${a.code}]${sn}`), { x: 45, y, size: 9.5, font: bold, color: ink });
    y -= 13;
  }
  y -= 8;

  // 4. Checkout Details
  row("Dogadjaj:", d.event?.name ?? "-");
  if (d.client) row("Klijent:", d.client.name);
  row("Zaduzeno na lice:", d.checkedOutToName ?? "-");
  row("Datum izdavanja:", fmt(d.checkedOutAt));
  row("Ocekivani povrat:", fmt(d.expectedReturnAt));
  row("Stanje pri izdavanju:", d.conditionOut ?? "Ispravno");
  if (d.returnedAt) row("Datum povrata:", fmt(d.returnedAt));
  if (d.conditionIn) row("Stanje pri povratu:", d.conditionIn ?? "-");
  if (d.issuedByName) row("Opremu izdao:", d.issuedByName);

  if (d.notes) {
    page.drawText("Napomene:", { x: 40, y, size: 8.5, font, color: muted });
    y -= 12;
    const lines = sanitize(d.notes).match(/.{1,85}/g) ?? [];
    for (const ln of lines) {
      page.drawText(ln, { x: 40, y, size: 9, font, color: ink });
      y -= 12;
    }
  }

  // 5. Legal Disclaimer Box (Terms & Liability Clause)
  y = Math.min(y, 250);
  const disclaimerText = sanitize(
    company.revers_disclaimer ||
      "Preuzimalac svojim potpisom garantuje da je navedenu opremu primio u ispravnom stanju, te preuzima punu materijalnu i krivicnu odgovornost za svako ostecenje ili gubitak opreme do momenta razduzivanja."
  );

  page.drawRectangle({
    x: 40,
    y: y - 48,
    width: 515,
    height: 48,
    borderColor: lineCol,
    borderWidth: 0.8,
    color: rgb(0.97, 0.98, 0.99),
  });

  page.drawText("IZJAVA O ODGOVORNOSTI I PRIJEMU OPREME:", {
    x: 48,
    y: y - 12,
    size: 7.5,
    font: bold,
    color: ink,
  });

  const disclaimerLines = disclaimerText.match(/.{1,95}/g) ?? [];
  let discY = y - 23;
  for (const dline of disclaimerLines.slice(0, 3)) {
    page.drawText(dline, { x: 48, y: discY, size: 7.5, font, color: muted });
    discY -= 10;
  }
  y -= 62;

  // 6. Signature Boxes
  const sigW = 240;
  const sigH = 80;
  const drawSigBox = async (x: number, label: string, path?: string | null) => {
    page.drawRectangle({
      x,
      y: y - sigH,
      width: sigW,
      height: sigH,
      borderColor: muted,
      borderWidth: 0.6,
    });
    page.drawText(sanitize(label), { x, y: y - sigH - 12, size: 8.5, font: bold, color: ink });

    const bytes = await loadSignaturePng(path);
    if (bytes) {
      try {
        const img = await pdf.embedPng(bytes);
        const dims = img.scaleToFit(sigW - 14, sigH - 14);
        page.drawImage(img, {
          x: x + (sigW - dims.width) / 2,
          y: y - sigH + (sigH - dims.height) / 2,
          width: dims.width,
          height: dims.height,
        });
      } catch {
        /* noop */
      }
    }
  };

  await drawSigBox(40, "Potpis preuzimaoca (izdavanje opreme)", d.signatureOutPath);
  await drawSigBox(315, "Potpis primaoca (razduzivanje opreme)", d.signatureInPath);

  // Footer stamp
  page.drawText(
    sanitize(
      `Dokument generisan: ${new Date().toLocaleString("sr-RS")} | Softver: ${company.short_name} Inventar`
    ),
    { x: 40, y: 25, size: 7.5, font, color: muted }
  );

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
