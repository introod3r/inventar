/**
 * ESC/POS Command Encoder for 58mm & 80mm Thermal Receipt Printers.
 * Implements standard ESC/POS protocol commands for text, tables, barcodes,
 * QR codes, 1-bit raster bitmaps (signatures), and paper cutting.
 */

import type { ThermalReceiptData, ThermalRollWidth } from "./types";

export class EscPosBuilder {
  private buffer: number[] = [];
  private rollWidth: ThermalRollWidth;

  constructor(rollWidth: ThermalRollWidth = 80) {
    this.rollWidth = rollWidth;
    this.init();
  }

  /**
   * Total character columns per line (Font A standard):
   * 58mm -> 32 columns
   * 80mm -> 48 columns
   */
  get maxColumns(): number {
    return this.rollWidth === 58 ? 32 : 48;
  }

  /** ESC @ - Initialize printer */
  init(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  /** ESC a - Set alignment: 'left' | 'center' | 'right' */
  align(alignment: "left" | "center" | "right"): this {
    const val = alignment === "center" ? 1 : alignment === "right" ? 2 : 0;
    this.buffer.push(0x1b, 0x61, val);
    return this;
  }

  /** ESC E - Bold text */
  bold(enable: boolean = true): this {
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0);
    return this;
  }

  /** ESC - - Underline text */
  underline(enable: boolean = true): this {
    this.buffer.push(0x1b, 0x2d, enable ? 1 : 0);
    return this;
  }

  /** GS B - Inverted colors (white on black) */
  invert(enable: boolean = true): this {
    this.buffer.push(0x1d, 0x42, enable ? 1 : 0);
    return this;
  }

  /** GS ! - Character size: normal, double-height, double-width, quad */
  size(mode: "normal" | "double-height" | "double-width" | "quad"): this {
    let val = 0x00;
    if (mode === "double-height") val = 0x01;
    else if (mode === "double-width") val = 0x10;
    else if (mode === "quad") val = 0x11;
    this.buffer.push(0x1d, 0x21, val);
    return this;
  }

  /** Write plain text with Latin/Serbian character cleanup */
  text(str: string): this {
    const sanitized = sanitizeTextForPrinter(str);
    for (let i = 0; i < sanitized.length; i++) {
      this.buffer.push(sanitized.charCodeAt(i) & 0xff);
    }
    return this;
  }

  /** Write text and append LF (line feed) */
  textLine(str: string = ""): this {
    this.text(str);
    this.buffer.push(0x0a);
    return this;
  }

  /** Line feed N times */
  feed(lines: number = 1): this {
    this.buffer.push(0x1b, 0x64, Math.max(1, lines));
    return this;
  }

  /** Print horizontal separator line */
  separator(char: string = "-"): this {
    const line = char.repeat(this.maxColumns).slice(0, this.maxColumns);
    this.textLine(line);
    return this;
  }

  /** Double horizontal line */
  doubleSeparator(): this {
    return this.separator("=");
  }

  /**
   * Two-column row (Left aligned item, Right aligned value)
   * Example: "Zaduženo na:                Marko Marković"
   */
  row(left: string, right: string): this {
    const cleanLeft = sanitizeTextForPrinter(left);
    const cleanRight = sanitizeTextForPrinter(right);
    const maxCols = this.maxColumns;

    const spacesNeeded = maxCols - (cleanLeft.length + cleanRight.length);
    if (spacesNeeded >= 1) {
      this.textLine(cleanLeft + " ".repeat(spacesNeeded) + cleanRight);
    } else {
      // If combined length is too long, wrap left and place right on next or truncate
      this.textLine(cleanLeft);
      this.align("right").textLine(cleanRight).align("left");
    }
    return this;
  }

  /**
   * Three-column row (e.g., Code, Name, Serial/Status)
   */
  tableRow(col1: string, col2: string, col3: string = ""): this {
    const max = this.maxColumns;
    // For 58mm: 9 | 15 | 8 cols
    // For 80mm: 12 | 24 | 12 cols
    const w1 = this.rollWidth === 58 ? 9 : 12;
    const w3 = col3 ? (this.rollWidth === 58 ? 7 : 12) : 0;
    const w2 = max - w1 - w3;

    const p1 = padRight(sanitizeTextForPrinter(col1), w1);
    const p2 = padRight(sanitizeTextForPrinter(col2), w2);
    const p3 = col3 ? padLeft(sanitizeTextForPrinter(col3), w3) : "";

    this.textLine(p1 + p2 + p3);
    return this;
  }

  /** Native ESC/POS QR Code */
  qr(data: string, moduleSize: number = 6): this {
    const clean = data.trim();
    const len = clean.length + 3;
    const pL = len & 0xff;
    const pH = (len >> 8) & 0xff;

    // 1. Model: 2
    this.buffer.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // 2. Module size (1 - 16)
    const mSize = Math.max(1, Math.min(16, moduleSize));
    this.buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, mSize);
    // 3. Error correction level (49 = L, 50 = M, 51 = Q, 52 = H)
    this.buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
    // 4. Store data
    this.buffer.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
    for (let i = 0; i < clean.length; i++) {
      this.buffer.push(clean.charCodeAt(i) & 0xff);
    }
    // 5. Print QR
    this.buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    return this;
  }

  /** Native 1D Barcode (Code128) */
  barcode128(data: string, height: number = 60): this {
    const clean = data.trim();
    // Set barcode height
    this.buffer.push(0x1d, 0x68, Math.max(20, Math.min(255, height)));
    // Set barcode width (2 or 3)
    this.buffer.push(0x1d, 0x77, this.rollWidth === 58 ? 2 : 2);
    // Set HRI characters print position (2 = below barcode)
    this.buffer.push(0x1d, 0x48, 0x02);
    // Print Code128: GS k 73 (len) {B (data)
    const payload = `{B${clean}`;
    this.buffer.push(0x1d, 0x6b, 73, payload.length);
    for (let i = 0; i < payload.length; i++) {
      this.buffer.push(payload.charCodeAt(i) & 0xff);
    }
    return this;
  }

  /** Paper Cut (GS V 66 0 - Feed and partial cut) */
  cut(fullCut: boolean = false): this {
    this.feed(3);
    if (fullCut) {
      this.buffer.push(0x1d, 0x56, 0x00);
    } else {
      this.buffer.push(0x1d, 0x56, 0x42, 0x00);
    }
    return this;
  }

  /** Get complete raw byte buffer */
  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Format string with space padding to fixed width
 */
function padRight(str: string, length: number): string {
  if (str.length > length) {
    return str.slice(0, length - 1) + " ";
  }
  return str + " ".repeat(length - str.length);
}

function padLeft(str: string, length: number): string {
  if (str.length > length) {
    return str.slice(0, length);
  }
  return " ".repeat(length - str.length) + str;
}

/**
 * Clean Serbian/Central European diacritics into printer-safe characters
 * Prevents garbage characters on legacy ESC/POS firmware while keeping full legibility.
 */
export function sanitizeTextForPrinter(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/č/g, "c")
    .replace(/Č/g, "C")
    .replace(/ć/g, "c")
    .replace(/Ć/g, "C")
    .replace(/ž/g, "z")
    .replace(/Ž/g, "Z")
    .replace(/š/g, "s")
    .replace(/Š/g, "S")
    .replace(/đ/g, "dj")
    .replace(/Đ/g, "Dj");
}

/**
 * Builds a complete ESC/POS receipt slip from receipt data
 */
export function buildThermalReceiptEscPos(
  data: ThermalReceiptData,
  rollWidth: ThermalRollWidth = 80
): Uint8Array {
  const p = new EscPosBuilder(rollWidth);

  // 1. Header & Company Memo
  p.align("center")
    .bold(true)
    .size("double-height")
    .textLine(data.company.name.toUpperCase())
    .size("normal")
    .bold(false);

  if (data.company.address || data.company.city) {
    const loc = [data.company.address, data.company.city].filter(Boolean).join(", ");
    p.textLine(loc);
  }
  if (data.company.pib || data.company.mb) {
    const ids = [data.company.pib ? `PIB:${data.company.pib}` : "", data.company.mb ? `MB:${data.company.mb}` : ""].filter(Boolean).join(" | ");
    p.textLine(ids);
  }
  if (data.company.phone) {
    p.textLine(`Tel: ${data.company.phone}`);
  }

  p.doubleSeparator();

  // 2. Revers Identification & QR Code
  p.align("center")
    .bold(true)
    .size("double-height")
    .textLine(`REVERS: ${data.reversCode}`)
    .size("normal")
    .bold(false)
    .feed(1);

  // QR Code for instant check-in / return scan
  p.qr(data.reversCode, rollWidth === 58 ? 5 : 7)
    .feed(1)
    .textLine("* Skeniraj za brzi povrat *")
    .feed(1);

  p.separator();

  // 3. Metadata
  p.align("left");
  if (data.eventName) {
    p.row("Dogadjaj:", data.eventName);
  }
  if (data.clientName) {
    p.row("Klijent:", data.clientName);
  }
  p.row("Preuzima:", data.checkedOutTo);
  p.row("Izdato:", data.checkedOutAt);
  if (data.expectedReturnAt) {
    p.row("Rok povrata:", data.expectedReturnAt);
  }
  if (data.conditionOut) {
    p.row("Stanje opreme:", data.conditionOut);
  }
  if (data.notes) {
    p.textLine(`Napomena: ${data.notes}`);
  }

  p.doubleSeparator();

  // 4. Equipment Table
  p.bold(true);
  if (rollWidth === 80) {
    p.tableRow("SIFRA", "NAZIV OPREME", "S/N");
  } else {
    p.tableRow("SIFRA", "OPREMA", "KOM");
  }
  p.bold(false);
  p.separator();

  data.items.forEach((item, index) => {
    const idxStr = `${index + 1}. `;
    const nameWithIdx = idxStr + item.name;
    if (rollWidth === 80) {
      p.tableRow(item.code, nameWithIdx, item.serialNumber || "-");
    } else {
      p.tableRow(item.code, nameWithIdx, "1");
    }
  });

  p.separator();
  p.align("right").bold(true).textLine(`UKUPNO STAVKI: ${data.items.length}`).bold(false);
  p.doubleSeparator();

  // 5. Legal Disclaimer
  p.align("left");
  const disclaimer = data.company.disclaimer || "Preuzimalac potpisom garantuje preuzimanje navedene opreme u ispravnom stanju i materijalnu odgovornost.";
  p.textLine(disclaimer);
  p.feed(2);

  // 6. Signature Line
  p.align("center")
    .textLine("........................................")
    .textLine(`Potpis preuzimaoca: ${data.checkedOutTo}`)
    .feed(2);

  // 7. Footer timestamp & Cut
  p.align("center")
    .textLine(`Generisano: ${new Date().toLocaleString("sr-RS")}`)
    .textLine("--- INVENTAR SISTEM ---")
    .cut();

  return p.getBytes();
}

/**
 * Builds a test slip for thermal printer calibration
 */
export function buildTestSlipEscPos(
  companyName: string = "INVENTAR TEST",
  rollWidth: ThermalRollWidth = 80
): Uint8Array {
  const p = new EscPosBuilder(rollWidth);

  p.align("center")
    .bold(true)
    .size("double-height")
    .textLine("*** TEST SLIP ***")
    .size("normal")
    .bold(false)
    .textLine(companyName.toUpperCase())
    .textLine(`Sirina rolne: ${rollWidth} mm (${p.maxColumns} karaktera)`)
    .doubleSeparator();

  p.align("left")
    .textLine("1. Provera karaktera (A-Z, 0-9):")
    .textLine("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    .textLine("abcdefghijklmnopqrstuvwxyz 0123456789")
    .separator();

  p.textLine("2. Provera stilova:")
    .bold(true).textLine("BOLD TEKST (POBOLJSAN KONTRAST)").bold(false)
    .underline(true).textLine("Podvucen tekst").underline(false)
    .invert(true).textLine(" INVERTOVAN TEKST ").invert(false)
    .separator();

  p.align("center")
    .textLine("3. Provera QR koda:")
    .qr("https://inventar.test/ok", rollWidth === 58 ? 5 : 6)
    .feed(1)
    .textLine("4. Provera 1D Barkoda (Code128):")
    .barcode128("TEST-12345", 50)
    .feed(1);

  p.separator()
    .align("center")
    .textLine("TEST USPESNO ZAVRSEN")
    .textLine(new Date().toLocaleString("sr-RS"))
    .cut();

  return p.getBytes();
}
