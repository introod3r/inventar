import { supabase } from "@/integrations/supabase/client";

const EXPORT_TABLES = [
  "profiles",
  "user_roles",
  "categories",
  "locations",
  "clients",
  "assets",
  "asset_photos",
  "asset_status_history",
  "events",
  "event_assets",
  "event_team",
  "checkouts",
  "service_records",
  "damage_reports",
  "inventories",
  "inventory_lines",
  "api_keys",
] as const;

export type ExportPayload = {
  version: number;
  exported_at: string;
  tables: Record<string, any[]>;
};

export async function exportBackup(): Promise<ExportPayload> {
  const payload: ExportPayload = {
    version: 1,
    exported_at: new Date().toISOString(),
    tables: {},
  };

  for (const table of EXPORT_TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`Greška pri izvozu ${table}: ${error.message}`);
    payload.tables[table] = data ?? [];
  }
  return payload;
}

export async function importBackup(input: { payload: ExportPayload; mode: "merge" | "replace" }) {
  if (!input?.payload?.tables) throw new Error("Neispravan backup fajl.");

  const results: Record<string, { inserted: number; skipped: number; error?: string }> = {};

  if (input.mode === "replace") {
    for (const table of [...EXPORT_TABLES].reverse()) {
      if (table === "profiles" || table === "user_roles") continue;
      const { error } = await supabase.from(table).delete().not("id", "is", null);
      if (error) results[table] = { inserted: 0, skipped: 0, error: `delete: ${error.message}` };
    }
  }

  for (const table of EXPORT_TABLES) {
    const rows = input.payload.tables[table];
    if (!Array.isArray(rows) || rows.length === 0) {
      results[table] = { inserted: 0, skipped: 0 };
      continue;
    }
    
    // For clients, we cannot list auth.users without admin credentials
    // We will just try to upsert the profiles that exist or fail gracefully
    const toInsert = rows;
    const skipped = rows.length - toInsert.length;
    
    const { error, count } = await supabase
      .from(table)
      .upsert(toInsert as any, { onConflict: table === "user_roles" ? "user_id,role" : "id", count: "exact" });
      
    if (error) {
      results[table] = { inserted: 0, skipped, error: error.message };
    } else {
      results[table] = { inserted: count ?? toInsert.length, skipped };
    }
  }

  return { ok: true, results };
}
