import type { Database } from "@/integrations/supabase/types";

export type AssetStatus = Database["public"]["Enums"]["asset_status"];

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  available: "Dostupno",
  reserved: "Rezervisano",
  at_event: "Na događaju",
  in_transit: "U transportu",
  returned: "Vraćeno",
  damaged: "Oštećeno",
  in_service: "Na servisu",
  written_off: "Rashodovano",
};
