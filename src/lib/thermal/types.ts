/**
 * Thermal Printer Engine Types & Constants
 * Supports both ESC/POS (receipt/slip) and TSPL (label) thermal printers.
 */

export type ThermalRollWidth = 58 | 80;

export type ThermalLabelSize = "50x30" | "58x40" | "60x40" | "40x25" | "80x50";

export interface LabelDimension {
  id: ThermalLabelSize;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
}

export const THERMAL_LABEL_DIMENSIONS: Record<ThermalLabelSize, LabelDimension> = {
  "50x30": {
    id: "50x30",
    name: "50 × 30 mm",
    widthMm: 50,
    heightMm: 30,
    description: "Industrijski standard za opremu i magacin",
  },
  "58x40": {
    id: "58x40",
    name: "58 × 40 mm",
    widthMm: 58,
    heightMm: 40,
    description: "Standardna artikl nalepnica",
  },
  "60x40": {
    id: "60x40",
    name: "60 × 40 mm",
    widthMm: 60,
    heightMm: 40,
    description: "Koferi, rek ormani i zvučnički kabineti",
  },
  "40x25": {
    id: "40x25",
    name: "40 × 25 mm",
    widthMm: 40,
    heightMm: 25,
    description: "Kompaktna etiketa za kablove i mikrofone",
  },
  "80x50": {
    id: "80x50",
    name: "80 × 50 mm",
    widthMm: 80,
    heightMm: 50,
    description: "Velika detaljna etiketa sa opisom i logotipom",
  },
};

export type ThermalConnectionMode = "browser" | "serial" | "bluetooth";

export interface ThermalReceiptItem {
  code: string;
  name: string;
  serialNumber?: string | null;
  category?: string | null;
}

export interface ThermalReceiptData {
  reversCode: string;
  eventName?: string | null;
  clientName?: string | null;
  checkedOutTo: string;
  checkedOutAt: string;
  expectedReturnAt?: string | null;
  conditionOut?: string | null;
  notes?: string | null;
  items: ThermalReceiptItem[];
  signatureDataUrl?: string | null;
  company: {
    name: string;
    pib?: string;
    mb?: string;
    phone?: string;
    address?: string;
    city?: string;
    disclaimer?: string;
  };
}

export interface ThermalPrintResult {
  success: boolean;
  message?: string;
  bytesSent?: number;
}
