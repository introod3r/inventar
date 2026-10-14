import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { AssetStatusBadge, ASSET_STATUS_LABEL } from "@/components/common/StatusBadge";
import type { AssetStatus } from "@/lib/status";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: {
    id: string;
    name: string;
    code: string;
    status: AssetStatus;
    current_location_id?: string | null;
  } | null;
  onSuccess?: (newStatus: AssetStatus, newLocationId?: string | null) => void;
};

const ALL_STATUSES: { value: AssetStatus; label: string }[] = [
  { value: "available", label: ASSET_STATUS_LABEL.available },
  { value: "returned", label: ASSET_STATUS_LABEL.returned },
  { value: "in_transit", label: ASSET_STATUS_LABEL.in_transit },
  { value: "at_event", label: ASSET_STATUS_LABEL.at_event },
  { value: "reserved", label: ASSET_STATUS_LABEL.reserved },
  { value: "damaged", label: ASSET_STATUS_LABEL.damaged },
  { value: "in_service", label: ASSET_STATUS_LABEL.in_service },
  { value: "written_off", label: ASSET_STATUS_LABEL.written_off },
];

export function QuickStatusModal({ open, onOpenChange, asset, onSuccess }: Props) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AssetStatus>("available");
  const [locationId, setLocationId] = useState<string>("keep");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (asset) {
      setStatus(asset.status);
      setLocationId("keep");
      setNote("");
    }
  }, [asset, open]);

  // Fetch locations for optional movement
  const { data: locations } = useQuery({
    queryKey: ["locations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!asset) return;
      const updates: { status: AssetStatus; current_location_id?: string | null } = {
        status,
      };

      if (locationId !== "keep") {
        updates.current_location_id = locationId === "none" ? null : locationId;
      }

      const { error } = await supabase
        .from("assets")
        .update(updates)
        .eq("id", asset.id);

      if (error) throw error;

      // Also if a note is provided, update asset_status_history note if applicable
      if (note.trim()) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("asset_status_history").insert({
          asset_id: asset.id,
          from_status: asset.status,
          to_status: status,
          note: note.trim(),
          changed_by: user?.id ?? null,
        });
      }

      return updates;
    },
    onSuccess: (res) => {
      toast.success(`Status ažuriran: ${ASSET_STATUS_LABEL[status]}`);
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset", asset?.id] });
      if (res && onSuccess) {
        onSuccess(
          res.status,
          res.current_location_id !== undefined ? res.current_location_id : asset?.current_location_id
        );
      }
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error((e as Error).message || "Greška pri ažuriranju statusa.");
    },
    onSettled: () => setBusy(false),
  });

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" /> Promena statusa
          </DialogTitle>
          <DialogDescription>
            {asset.name} (<span className="font-mono">{asset.code}</span>)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm">
            <span className="text-muted-foreground font-medium">Trenutni status:</span>
            <AssetStatusBadge status={asset.status} />
          </div>

          <div className="space-y-1.5">
            <Label>Novi status *</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AssetStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Izaberi status" />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Premesti na lokaciju (opciono)</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Zadrži trenutnu lokaciju" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">— Zadrži postojeću lokaciju —</SelectItem>
                <SelectItem value="none">— Ukloni lokaciju —</SelectItem>
                {locations?.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Napomena (opciono)</Label>
            <Textarea
              placeholder="Razlog promene, pregled stanja, oštećenja..."
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          <Button
            onClick={() => {
              setBusy(true);
              updateMutation.mutate();
            }}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sačuvaj izmenu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
