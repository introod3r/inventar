/**
 * InfoSys ERP Integration Types & DTOs
 * Visual FoxPro / .NET 4.0 InfoSys API Server
 */

export type InfosysModuleId = "OS" | "FIN_KD" | "ROB" | "PRO_SERVIS" | "IMP_TXT";

export interface InfosysModuleInfo {
  id: InfosysModuleId;
  name: string;
  code: string;
  category: string;
  description: string;
  inventarMapping: string;
  defaultEnabled: boolean;
}

export const INFOSYS_MODULES: InfosysModuleInfo[] = [
  {
    id: "OS",
    name: "Osnovna sredstva",
    code: "OS",
    category: "Robno knjigovodstvo",
    description: "Inventarski brojevi, nabavna i sadašnja knjigovodstvena vrednost, stope amortizacije",
    inventarMapping: "Katalog Opreme (assets)",
    defaultEnabled: true,
  },
  {
    id: "FIN_KD",
    name: "Kupci i dobavljači",
    code: "FIN_KD",
    category: "Finansijsko knjigovodstvo",
    description: "Šifarnik poslovnih partnera, PIB, Matični broj, adresa sedišta i kontakti",
    inventarMapping: "Baza Klijenata (clients)",
    defaultEnabled: true,
  },
  {
    id: "ROB",
    name: "Robno i magacinsko",
    code: "ROB / X-STOCK_B",
    category: "Robno i mobilne aplikacije",
    description: "Prenos reversa i otpremnica zadužene opreme za događaje",
    inventarMapping: "Izdavanje i Reversi (checkouts)",
    defaultEnabled: true,
  },
  {
    id: "PRO_SERVIS",
    name: "Servis i popravke",
    code: "PRO_SERVIS",
    category: "Proizvodnja i servis",
    description: "Troškovi servisiranja opreme i popravki u finansijskom knjigovodstvu",
    inventarMapping: "Servis i Popravke (service_records)",
    defaultEnabled: false,
  },
  {
    id: "IMP_TXT",
    name: "CSV / TXT Razmena",
    code: "IMP_TXT",
    category: "Specifične delatnosti",
    description: "Formatirani uvoz i izvoz datoteka bez direktne internet veze sa serverom",
    inventarMapping: "Offline Fajl Generator",
    defaultEnabled: true,
  },
];

export const INFOSYS_MODULE_DESCRIPTORS = INFOSYS_MODULES;

export interface InfosysConfig {
  enabled: boolean;
  serverUrl: string;       // e.g. "https://api.firma.rs:8080" or "http://192.168.1.50:8080"
  apiKey: string;          // API key or Bearer token generated for Inventar
  databaseId: string;      // InfoSys database ID or company code, e.g. "INFOSYS_2026" or "01"
  activeModules: InfosysModuleId[];
  autoSync: boolean;
  autoSyncIntervalHours: number;
  lastSyncAt: string | null;
  lastSyncStatus: "idle" | "success" | "error" | "syncing";
  lastSyncMessage?: string;
  isMockMode: boolean;     // Simulates response when real server is offline/local
}

export interface InfosysConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  serverVersion?: string;
  connectedDatabase?: string;
  availableModules?: string[];
  testedAt: string;
}

/** DTO returned by InfoSys API Server for Modul OS (Osnovna Sredstva) */
export interface InfosysAssetDto {
  inventarskiBroj: string;        // Map to code
  naziv: string;                  // Map to name
  fabrickiBroj?: string | null;   // Map to serial_number
  nabavnaVrednost: number;        // Map to purchase_value
  sadasnjaVrednost: number;       // Map to current_value
  stopaAmortizacije?: number;     // Map to depreciation_rate
  datumNabavke?: string;          // Map to purchase_date (YYYY-MM-DD)
  status?: string;                // "AKTIVNO" | "RASHODOVANO"
  grupaKonta?: string;            // e.g. "0230"
  lokacijaNaziv?: string;         // e.g. "Glavni magacin"
}

/** DTO returned by InfoSys API Server for Modul FIN_KD (Kupci i Dobavljači) */
export interface InfosysClientDto {
  sifraPartnera: string;          // InfoSys partner ID
  naziv: string;                  // Company name
  pib: string;                    // Tax ID
  maticniBroj?: string | null;    // Registration number
  adresa?: string | null;         // Street address
  mesto?: string | null;          // City
  postanskiBroj?: string | null;  // Postal code
  telefon?: string | null;        // Phone
  email?: string | null;          // Email
  tekuciRacun?: string | null;    // Bank account
  kontaktOsoba?: string | null;   // Contact person
}

/** DTO sent to InfoSys API Server for Modul ROB / X-STOCK (Revers / Otpremnica) */
export interface InfosysReversItemDto {
  sifraOpreme: string;
  nazivOpreme: string;
  serijskiBroj?: string | null;
  kolicina: number;
  jedinicaMere?: string;
}

export interface InfosysReversDto {
  brojReversa: string;
  datumIzdavanja: string;
  predvidjeniDatumPovrata?: string | null;
  partnerPib?: string | null;
  partnerNaziv: string;
  preuzimalacIme: string;
  preuzimalacKontakt?: string | null;
  napomena?: string | null;
  stavke: InfosysReversItemDto[];
}

export interface InfosysSyncLogItem {
  id: string;
  timestamp: string;
  module: InfosysModuleId;
  direction: "INBOUND" | "OUTBOUND" | "TEST";
  title: string;
  status: "success" | "warning" | "error";
  details: string;
  itemsCount?: number;
}
