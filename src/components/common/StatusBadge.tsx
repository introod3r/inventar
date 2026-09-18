import { Badge } from "@/components/ui/badge";
import { ASSET_STATUS_LABEL, type AssetStatus } from "@/lib/status";

export { ASSET_STATUS_LABEL };

const LABEL = ASSET_STATUS_LABEL;



const VARIANT: Record<AssetStatus, string> = {
  available: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-success/15 dark:text-success dark:border-success/30",
  reserved: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-info/15 dark:text-info dark:border-info/30",
  at_event: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-primary/15 dark:text-primary dark:border-primary/30",
  in_transit: "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40",
  returned: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-muted dark:text-muted-foreground dark:border-border",
  damaged: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-destructive/15 dark:text-destructive dark:border-destructive/30",
  in_service: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-warning/20 dark:text-warning-foreground dark:border-warning/40",
  written_off: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-muted dark:text-muted-foreground dark:border-border line-through",
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return (
    <Badge variant="outline" className={`font-medium ${VARIANT[status]}`}>
      {LABEL[status]}
    </Badge>
  );
}
