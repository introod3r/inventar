import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";

type AssetStatus = Database["public"]["Enums"]["asset_status"];

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

const LABEL = ASSET_STATUS_LABEL;


const VARIANT: Record<AssetStatus, string> = {
  available: "bg-success/15 text-success border-success/30",
  reserved: "bg-info/15 text-info border-info/30",
  at_event: "bg-primary/15 text-primary border-primary/30",
  in_transit: "bg-warning/20 text-warning-foreground border-warning/40",
  returned: "bg-muted text-muted-foreground border-border",
  damaged: "bg-destructive/15 text-destructive border-destructive/30",
  in_service: "bg-warning/20 text-warning-foreground border-warning/40",
  written_off: "bg-muted text-muted-foreground border-border line-through",
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <Badge variant="outline" className={`font-medium ${VARIANT[status]}`}>
      {LABEL[status]}
    </Badge>
  );
}
