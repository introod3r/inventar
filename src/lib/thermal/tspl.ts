/**
 * TSPL (TSC Printer Language) Command Generator for Thermal Label Printers.
 * Supports standard thermal labels (50x30mm, 58x40mm, 60x40mm, 40x25mm, 80x50mm).
 * Compatible with TSC, Xprinter, Gprinter, Rongta, HPRT, and Zebra-TSPL compatible printers.
 */

import { THERMAL_LABEL_DIMENSIONS, type ThermalLabelSize } from "./types";
import { sanitizeTextForPrinter } from "./escpos";

export interface TsplLabelItem {
  code: string;
  name: string;
  serialNumber?: string | null;
  companyName?: string;
  category?: string | null;
}

export interface TsplOptions {
  size?: ThermalLabelSize;
  codeType?: "qr" | "barcode" | "both";
  gapMm?: number;
  speed?: number; // 2 to 5
  density?: number; // 1 to 15
}

export class TsplBuilder {
  private commands: string[] = [];
  private widthMm: number;
  private heightMm: number;
  private gapMm: number;

  constructor(size: ThermalLabelSize = "50x30", gapMm: number = 2) {
    const dim = THERMAL_LABEL_DIMENSIONS[size] || THERMAL_LABEL_DIMENSIONS["50x30"];
    this.widthMm = dim.widthMm;
    this.heightMm = dim.heightMm;
    this.gapMm = gapMm;

    this.setup();
  }

  private setup() {
    this.commands.push(`SIZE ${this.widthMm} mm, ${this.heightMm} mm`);
    this.commands.push(`GAP ${this.gapMm} mm, 0 mm`);
    this.commands.push(`DIRECTION 1`);
    this.commands.push(`CLS`);
  }

  /**
   * Set print density (0-15) and speed (2-5 ips)
   */
  setDarkness(density: number = 10, speed: number = 3): this {
    this.commands.push(`DENSITY ${Math.max(1, Math.min(15, density))}`);
    this.commands.push(`SPEED ${Math.max(2, Math.min(5, speed))}`);
    return this;
  }

  /**
   * Add text element
   * Font options: "1" (8x12), "2" (12x20), "3" (16x24), "4" (24x32), "TST24.BF2"
   */
  text(
    x: number,
    y: number,
    text: string,
    font: string = "2",
    xScale: number = 1,
    yScale: number = 1
  ): this {
    const clean = sanitizeTextForPrinter(text).replace(/"/g, "'");
    this.commands.push(`TEXT ${x},${y},"${font}",0,${xScale},${yScale},"${clean}"`);
    return this;
  }

  /**
   * Add QR code element
   * ECC: L, M, Q, H
   * cellWidth: 1 to 10 (typical 3-6)
   */
  qr(x: number, y: number, content: string, cellWidth: number = 4): this {
    const clean = content.trim();
    // TSPL format: QRCODE x,y,ECC,cell_width,mode,rotation,"data"
    this.commands.push(`QRCODE ${x},${y},M,${cellWidth},A,0,"${clean}"`);
    return this;
  }

  /**
   * Add Code128 1D Barcode
   */
  barcode128(
    x: number,
    y: number,
    content: string,
    height: number = 40,
    readable: boolean = true
  ): this {
    const clean = content.trim();
    // TSPL format: BARCODE x,y,"code_type",height,human_readable,rotation,narrow,wide,"data"
    this.commands.push(
      `BARCODE ${x},${y},"128",${height},${readable ? 1 : 0},0,2,2,"${clean}"`
    );
    return this;
  }

  /**
   * Finalize and print copies
   */
  print(copies: number = 1): this {
    this.commands.push(`PRINT ${copies},1`);
    return this;
  }

  /** Get raw TSPL string */
  getString(): string {
    return this.commands.join("\r\n") + "\r\n";
  }

  /** Get encoded Uint8Array bytes */
  getBytes(): Uint8Array {
    const str = this.getString();
    const encoder = new TextEncoder();
    return encoder.encode(str);
  }
}

/**
 * Builds TSPL commands for a batch of asset labels
 */
export function buildTsplLabels(
  items: TsplLabelItem[],
  options: TsplOptions = {}
): Uint8Array {
  const {
    size = "50x30",
    codeType = "qr",
    gapMm = 2,
    density = 10,
    speed = 3,
  } = options;

  let allCommands = "";

  for (const item of items) {
    const builder = new TsplBuilder(size, gapMm);
    builder.setDarkness(density, speed);

    const dim = THERMAL_LABEL_DIMENSIONS[size];
    const company = (item.companyName || "INVENTAR").toUpperCase();

    if (codeType === "barcode") {
      // 1D Barcode layout
      builder.text(16, 12, company, "1", 1, 1);
      builder.text(16, 28, item.name.slice(0, 24), "2", 1, 1);
      builder.barcode128(16, 55, item.code, dim.heightMm > 35 ? 55 : 40, true);
      if (item.serialNumber) {
        builder.text(16, dim.heightMm > 35 ? 120 : 105, `S/N: ${item.serialNumber}`, "1", 1, 1);
      }
    } else if (codeType === "both") {
      // QR + Barcode hybrid layout (best for 60x40 or 80x50)
      builder.text(16, 12, company, "1", 1, 1);
      builder.text(16, 28, item.code, "3", 1, 1);
      builder.text(16, 58, item.name.slice(0, 20), "1", 1, 1);
      builder.qr(dim.widthMm > 60 ? 280 : 180, 16, item.code, 4);
      builder.barcode128(16, 85, item.code, 35, true);
    } else {
      // Default: QR layout with metadata
      // Left: QR Code, Right: Company, Code, Name, S/N
      const qrCellSize = dim.heightMm >= 40 ? 5 : 4;
      builder.qr(16, 16, item.code, qrCellSize);

      const textX = dim.heightMm >= 40 ? 140 : 120;
      builder.text(textX, 16, company, "1", 1, 1);
      builder.text(textX, 32, item.code, "3", 1, 1);
      builder.text(textX, 64, item.name.slice(0, 22), "2", 1, 1);
      if (item.serialNumber) {
        builder.text(textX, 90, `S/N: ${item.serialNumber}`, "1", 1, 1);
      }
    }

    builder.print(1);
    allCommands += builder.getString();
  }

  return new TextEncoder().encode(allCommands);
}
