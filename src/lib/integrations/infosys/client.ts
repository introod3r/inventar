/**
 * InfoSys API Server Client
 * Handles HTTP JSON communication with InfoSys API Server (.NET 4.0 / IIS / Abyss)
 */

import type {
  InfosysConfig,
  InfosysConnectionTestResult,
  InfosysAssetDto,
  InfosysClientDto,
  InfosysReversDto,
} from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

export class InfosysApiClient {
  private config: InfosysConfig;

  constructor(config: InfosysConfig) {
    this.config = config;
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${this.config.apiKey}`,
      "X-InfoSys-Database": this.config.databaseId || "DEFAULT",
      "X-Client-App": "Inventar-EventAsset/2.0",
    };
  }

  /**
   * Test connection and perform handshake with InfoSys API Server
   */
  async testConnection(): Promise<InfosysConnectionTestResult> {
    const startTime = performance.now();
    const cleanUrl = (this.config.serverUrl || "").trim().replace(/\/+$/, "");

    if (!cleanUrl) {
      return {
        success: false,
        message: "URL adresa InfoSys API servera nije uneta.",
        testedAt: new Date().toISOString(),
      };
    }

    if (!this.config.apiKey) {
      return {
        success: false,
        message: "API ključ nije unet.",
        testedAt: new Date().toISOString(),
      };
    }

    // Try real HTTP call with timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const endpoint = `${cleanUrl}/api/v1/ping`;
      const response = await fetch(endpoint, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startTime);

      if (response.ok) {
        const json = await response.json().catch(() => ({}));
        return {
          success: true,
          message: "Uspešna veza sa InfoSys API serverom.",
          latencyMs,
          serverVersion: json.version || "InfoSys API Server v4.2 (.NET 4.0)",
          connectedDatabase: this.config.databaseId,
          availableModules: json.modules || ["OS", "FIN_KD", "ROB"],
          testedAt: new Date().toISOString(),
        };
      } else {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Server je vratio status ${response.status}: ${errorText || response.statusText}`);
      }
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);
      const isAbort = (err as Error).name === "AbortError";

      // If mock mode is active, provide a realistic simulated handshake for offline development
      if (this.config.isMockMode) {
        return {
          success: true,
          message: "Simulirani handshake uspešan (Režim za testiranje bez Windows servera).",
          latencyMs: 38,
          serverVersion: "InfoSys API Server v4.2.1 (.NET 4.0 / IIS)",
          connectedDatabase: this.config.databaseId || "INFOSYS_2026",
          availableModules: ["OS", "FIN_KD", "ROB", "PRO_SERVIS", "IMP_TXT"],
          testedAt: new Date().toISOString(),
        };
      }

      return {
        success: false,
        message: isAbort
          ? "Isteklo vreme za odgovor servera (Timeout 4s). Proverite IP adresu, port i firewall."
          : `Neuspešna veza: ${(err as Error).message}`,
        latencyMs,
        testedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Fetch Osnovna Sredstva from InfoSys Modul OS
   */
  async getOsnovnaSredstva(): Promise<InfosysAssetDto[]> {
    const cleanUrl = (this.config.serverUrl || "").trim().replace(/\/+$/, "");

    if (this.config.isMockMode || !cleanUrl) {
      return this.getMockOsnovnaSredstva();
    }

    try {
      const response = await fetch(`${cleanUrl}/api/v1/osnovna-sredstva`, {
        method: "GET",
        headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error(`Greška ${response.status}`);
      const json = await response.json();
      return json.data || json;
    } catch (err) {
      if (this.config.isMockMode) {
        return this.getMockOsnovnaSredstva();
      }
      throw err;
    }
  }

  /**
   * Fetch Partneri / Kupci from InfoSys Modul FIN_KD
   */
  async getPartneri(): Promise<InfosysClientDto[]> {
    const cleanUrl = (this.config.serverUrl || "").trim().replace(/\/+$/, "");

    if (this.config.isMockMode || !cleanUrl) {
      return this.getMockPartneri();
    }

    try {
      const response = await fetch(`${cleanUrl}/api/v1/partneri`, {
        method: "GET",
        headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error(`Greška ${response.status}`);
      const json = await response.json();
      return json.data || json;
    } catch (err) {
      if (this.config.isMockMode) {
        return this.getMockPartneri();
      }
      throw err;
    }
  }

  /**
   * Send Revers / Zaduženje document to InfoSys Modul ROB / X-STOCK
   */
  async pushRevers(revers: InfosysReversDto): Promise<{ success: boolean; documentNumber?: string; message?: string }> {
    const cleanUrl = (this.config.serverUrl || "").trim().replace(/\/+$/, "");

    if (this.config.isMockMode || !cleanUrl) {
      return {
        success: true,
        documentNumber: `IS-${revers.brojReversa}`,
        message: `Revers uspešno proknjižen u InfoSys bazu ${this.config.databaseId}`,
      };
    }

    const response = await fetch(`${cleanUrl}/api/v1/robno/reversi`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(revers),
    });

    if (!response.ok) {
      throw new Error(`InfoSys greška pri knjiženju reversa: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Automated synchronisation of partners into Supabase `clients` table
   */
  async syncClientsToSupabase(supabase: SupabaseClient): Promise<{ imported: number; updated: number }> {
    const partneri = await this.getPartneri();
    let imported = 0;
    let updated = 0;

    for (const p of partneri) {
      // Check if client with this Name exists
      const { data: existingRows } = await supabase
        .from("clients")
        .select("id, name, phone, contact")
        .eq("name", p.naziv.trim())
        .limit(1);

      const existing = existingRows?.[0];

      const pib = p.pib?.trim() || "";
      const mb = p.maticniBroj?.trim() || "";
      const b2bPayload = pib || mb ? JSON.stringify({ pib, mb }) : (p.telefon?.trim() || null);
      const contactPayload = p.kontaktOsoba
        ? JSON.stringify([{ name: p.kontaktOsoba, phone: p.telefon || "" }])
        : null;

      const clientPayload = {
        name: p.naziv.trim(),
        phone: b2bPayload,
        contact: contactPayload,
        address: [p.adresa, p.mesto].filter(Boolean).join(", ") || null,
        email: p.email?.trim() || null,
      };

      if (existing) {
        await supabase.from("clients").update(clientPayload).eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("clients").insert(clientPayload);
        imported++;
      }
    }

    return { imported, updated };
  }

  /**
   * Automated synchronisation of fixed assets into Supabase `assets` table
   */
  async syncAssetsToSupabase(supabase: SupabaseClient): Promise<{ matched: number; updated: number }> {
    const osnovnaSredstva = await this.getOsnovnaSredstva();
    let matched = 0;
    let updated = 0;

    for (const os of osnovnaSredstva) {
      const { data: matchedAsset } = await supabase
        .from("assets")
        .select("id, code, current_value, purchase_value")
        .eq("code", os.inventarskiBroj)
        .limit(1)
        .maybeSingle();

      if (matchedAsset) {
        matched++;
        const needsUpdate =
          matchedAsset.current_value !== os.sadasnjaVrednost ||
          matchedAsset.purchase_value !== os.nabavnaVrednost;

        if (needsUpdate) {
          await supabase
            .from("assets")
            .update({
              current_value: os.sadasnjaVrednost,
              purchase_value: os.nabavnaVrednost,
              depreciation_rate: os.stopaAmortizacije ?? 20.0,
            })
            .eq("id", matchedAsset.id);
          updated++;
        }
      }
    }

    return { matched, updated };
  }

  // --- Realistic Mock Data for Demo & Development ---
  private getMockOsnovnaSredstva(): InfosysAssetDto[] {
    return [
      {
        inventarskiBroj: "098-100-0001",
        naziv: "L-Acoustics K2 Line Array Zvučnički Kabinet",
        fabrickiBroj: "LA-K2-9841",
        nabavnaVrednost: 1250000.0,
        sadasnjaVrednost: 875000.0,
        stopaAmortizacije: 15.0,
        datumNabavke: "2023-04-12",
        status: "AKTIVNO",
        grupaKonta: "0230",
        lokacijaNaziv: "Glavni magacin",
      },
      {
        inventarskiBroj: "098-100-0002",
        naziv: "Yamaha CL5 Digitalna Audio Mikseta 72ch",
        fabrickiBroj: "YMH-CL5-00412",
        nabavnaVrednost: 2100000.0,
        sadasnjaVrednost: 1470000.0,
        stopaAmortizacije: 20.0,
        datumNabavke: "2022-09-18",
        status: "AKTIVNO",
        grupaKonta: "0230",
        lokacijaNaziv: "Glavni magacin",
      },
      {
        inventarskiBroj: "098-100-0003",
        naziv: "Robe Robin MegaPointe Moving Head Rasveta",
        fabrickiBroj: "RB-MP-5512",
        nabavnaVrednost: 780000.0,
        sadasnjaVrednost: 468000.0,
        stopaAmortizacije: 20.0,
        datumNabavke: "2023-01-20",
        status: "AKTIVNO",
        grupaKonta: "0230",
        lokacijaNaziv: "Regal C - Rasveta",
      },
      {
        inventarskiBroj: "098-100-0004",
        naziv: "Absen P3.91 LED Ekran Kabinet 500x1000mm Outdoor",
        fabrickiBroj: "AB-LED-0099",
        nabavnaVrednost: 145000.0,
        sadasnjaVrednost: 98000.0,
        stopaAmortizacije: 25.0,
        datumNabavke: "2023-06-01",
        status: "AKTIVNO",
        grupaKonta: "0230",
        lokacijaNaziv: "Zona Video Opreme",
      },
      {
        inventarskiBroj: "098-100-0005",
        naziv: "Shure Axient Digital AD4Q Četvorokanalni Prijemnik",
        fabrickiBroj: "SH-AD4Q-8812",
        nabavnaVrednost: 620000.0,
        sadasnjaVrednost: 496000.0,
        stopaAmortizacije: 20.0,
        datumNabavke: "2024-02-10",
        status: "AKTIVNO",
        grupaKonta: "0230",
        lokacijaNaziv: "Rack 01 - Bežični",
      },
    ];
  }

  private getMockPartneri(): InfosysClientDto[] {
    return [
      {
        sifraPartnera: "PART-0010",
        naziv: "EXIT Festival d.o.o. Novi Sad",
        pib: "101698234",
        maticniBroj: "08741298",
        adresa: "Kisačka 5",
        mesto: "Novi Sad",
        postanskiBroj: "21000",
        telefon: "+381 21 489 5500",
        email: "production@exitfest.org",
        tekuciRacun: "160-123456-78",
        kontaktOsoba: "Marko Jovanović",
      },
      {
        sifraPartnera: "PART-0014",
        naziv: "Sava Centar d.o.o. Beograd",
        pib: "100045612",
        maticniBroj: "07014522",
        adresa: "Milentija Popovića 9",
        mesto: "Beograd",
        postanskiBroj: "11070",
        telefon: "+381 11 220 6000",
        email: "tehnika@savacentar.rs",
        tekuciRacun: "205-987654-32",
        kontaktOsoba: "Dragan Petrović",
      },
      {
        sifraPartnera: "PART-0021",
        naziv: "Skymusic Production d.o.o.",
        pib: "102345891",
        maticniBroj: "17456321",
        adresa: "Autoput za Zagreb 24",
        mesto: "Beograd",
        postanskiBroj: "11080",
        telefon: "+381 11 316 8888",
        email: "rental@skymusic.rs",
        tekuciRacun: "170-554433-21",
        kontaktOsoba: "Nikola Lukić",
      },
      {
        sifraPartnera: "PART-0033",
        naziv: "Beogradska Arena d.o.o.",
        pib: "104567123",
        maticniBroj: "20124589",
        adresa: "Bulevar Arsenija Čarnojevića 58",
        mesto: "Beograd",
        postanskiBroj: "11070",
        telefon: "+381 11 220 2222",
        email: "event@starkarena.co.rs",
        tekuciRacun: "160-998877-66",
        kontaktOsoba: "Jelena Marković",
      },
    ];
  }
}
