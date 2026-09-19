/**
 * InfoSys IMP_TXT CSV / Text File Formatter
 * Generates formatted CSV/TXT files compatible with InfoSys module IMP_TXT
 * (Standard delimiter: semicolon ';', standard headers according to InfoSys documentation)
 */

function escapeSemicolon(val: any): string {
  if (val == null) return "";
  const str = String(val).replace(/;/g, ",");
  return str.trim();
}

/**
 * Generates IMP_TXT file for Osnovna Sredstva (Modul OS)
 * Columns: INV_BROJ;NAZIV;FAB_BROJ;NAB_VREDNOST;SAD_VREDNOST;STOPA_AMORTIZACIJE;DATUM_NABAVKE;STATUS
 */
export function generateInfosysAssetsCsv(assets: Array<{
  code: string;
  name: string;
  serial_number?: string | null;
  purchase_value?: number | null;
  current_value?: number | null;
  depreciation_rate?: number | null;
  purchase_date?: string | null;
  status?: string;
}>): string {
  const header = "INV_BROJ;NAZIV;FAB_BROJ;NAB_VREDNOST;SAD_VREDNOST;STOPA_AMORTIZACIJE;DATUM_NABAVKE;STATUS";
  const rows = assets.map((a) => {
    return [
      escapeSemicolon(a.code),
      escapeSemicolon(a.name),
      escapeSemicolon(a.serial_number || ""),
      (a.purchase_value ?? a.current_value ?? 0).toFixed(2),
      (a.current_value ?? 0).toFixed(2),
      (a.depreciation_rate ?? 20.0).toFixed(2),
      escapeSemicolon(a.purchase_date || new Date().toISOString().slice(0, 10)),
      a.status === "written_off" ? "RASHODOVANO" : "AKTIVNO",
    ].join(";");
  });

  return [header, ...rows].join("\r\n");
}

/**
 * Generates IMP_TXT file for Poslovni Partneri / Kupci (Modul FIN_KD)
 * Columns: SIFRA;NAZIV;PIB;MAT_BROJ;ADRESA;MESTO;TELEFON;EMAIL;TEKUCI_RACUN
 */
export function generateInfosysClientsCsv(clients: Array<{
  id?: string;
  name: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  contact?: string | null;
  pib?: string | null;
  maticni_broj?: string | null;
  city?: string | null;
  bank_account?: string | null;
}>): string {
  const header = "SIFRA;NAZIV;PIB;MAT_BROJ;ADRESA;MESTO;TELEFON;EMAIL;TEKUCI_RACUN";
  const rows = clients.map((c, idx) => {
    let pib = c.pib || "";
    let mb = c.maticni_broj || "";
    const phoneStr = c.phone || "";

    if ((!pib || !mb) && phoneStr && phoneStr.startsWith("{")) {
      try {
        const parsed = JSON.parse(phoneStr);
        if (!pib && parsed.pib) pib = parsed.pib;
        if (!mb && parsed.mb) mb = parsed.mb;
      } catch {
        // ignore
      }
    }

    const code = pib || `PART-${(idx + 1).toString().padStart(4, "0")}`;
    return [
      escapeSemicolon(code),
      escapeSemicolon(c.name),
      escapeSemicolon(pib),
      escapeSemicolon(mb),
      escapeSemicolon(c.address || ""),
      escapeSemicolon(c.city || ""),
      escapeSemicolon(phoneStr.startsWith("{") ? "" : phoneStr),
      escapeSemicolon(c.email || ""),
      escapeSemicolon(c.bank_account || ""),
    ].join(";");
  });

  return [header, ...rows].join("\r\n");
}

/**
 * Triggers a client-side download of generated text/CSV file
 */
export function downloadFile(filename: string, content: string, mimeType = "text/csv;charset=utf-8;") {
  const blob = new Blob(["\uFEFF" + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
