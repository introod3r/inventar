import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  Receipt,
  FileText,
} from "lucide-react";
import { generateReversPdf, downloadBlob } from "@/lib/revers-pdf";
import { formatDateTime } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

type OpenCheckout = {
  id: string;
  asset_id: string;
  checked_out_to_name: string | null;
  checked_out_at: string;
  expected_return_at: string | null;
  condition_out: string | null;
  notes: string | null;
  signature_path: string | null;
  event_id: string | null;
  assets: { id: string; code: string; name: string; serial_number: string | null } | null;
  events: { name: string } | null;
};

type ItemState = {
  condition: "OK" | "damaged" | "missing";
  note: string;
};

const STEPS = ["Izbor", "Stanje", "Potpis"] as const;

async function uploadSignature(blob: Blob, checkoutId: string) {
  const path = `${checkoutId}/in-${Date.now()}.png`;
  const { error } = await supabase.storage
    .from("signatures")
    .upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) throw error;
  return path;
}

export function ReturnWizard({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const sigRef = useRef<SignaturePadHandle>(null);
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setSearch("");
      setSelectedIds(new Set());
      setStates({});
    }
  }, [open]);

  const { data: openCheckouts } = useQuery({
    queryKey: ["open-checkouts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("checkouts")
        .select(
          "id,asset_id,checked_out_to_name,checked_out_at,expected_return_at,condition_out,notes,signature_path,event_id,assets:asset_id(id,code,name,serial_number),events:event_id(name)",
        )
        .is("returned_at", null)
        .order("checked_out_at", { ascending: false })
        .limit(200);
      return (data ?? []) as unknown as OpenCheckout[];
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return openCheckouts ?? [];
    return (openCheckouts ?? []).filter((c) => {
      const hay = `${c.assets?.name ?? ""} ${c.assets?.code ?? ""} ${c.assets?.serial_number ?? ""} ${c.checked_out_to_name ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [openCheckouts, search]);

  const selectedItems = useMemo(
    () => (openCheckouts ?? []).filter((c) => selectedIds.has(c.id)),
    [openCheckouts, selectedIds],
  );

  const toggle = (id: string) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setStates((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: { condition: "OK", note: "" } };
    });
  };

  const updateState = (id: string, patch: Partial<ItemState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const canNext = useMemo(() => {
    if (step === 0) return selectedIds.size > 0;
    return true;
  }, [step, selectedIds]);

  const finalize = async () => {
    if (sigRef.current?.isEmpty()) {
      toast.error("Potpis je obavezan.");
      return;
    }
    const blob = await sigRef.current!.toBlob();
    if (!blob) {
      toast.error("Greška sa potpisom.");
      return;
    }
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      for (const c of selectedItems) {
        const st = states[c.id] ?? { condition: "OK", note: "" };
        const path = await uploadSignature(blob, c.id);
        const conditionIn =
          st.condition === "OK"
            ? st.note
              ? `OK · ${st.note}`
              : "OK"
            : st.condition === "damaged"
              ? `Oštećeno${st.note ? ` · ${st.note}` : ""}`
              : `Nedostaje${st.note ? ` · ${st.note}` : ""}`;

        const { error } = await supabase
          .from("checkouts")
          .update({
            returned_at: new Date().toISOString(),
            return_received_by: user?.id ?? null,
            return_signature_path: path,
            condition_in: conditionIn,
          })
          .eq("id", c.id);
        if (error) throw error;

        const newStatus =
          st.condition === "damaged"
            ? "damaged"
            : st.condition === "missing"
              ? "written_off"
              : "available";
        if (c.asset_id) {
          await supabase.from("assets").update({ status: newStatus }).eq("id", c.asset_id);
          if (c.event_id) {
            const eaStatus = st.condition === "missing" ? "missing" : "returned";
            await supabase.from("event_assets").update({ status: eaStatus }).eq("event_id", c.event_id).eq("asset_id", c.asset_id);
          }
        }

        if (c.assets) {
          try {
            const pdf = await generateReversPdf({
              checkoutId: c.id,
              assets: [c.assets],
              event: c.events,
              checkedOutToName: c.checked_out_to_name,
              checkedOutAt: c.checked_out_at,
              expectedReturnAt: c.expected_return_at,
              returnedAt: new Date().toISOString(),
              conditionOut: c.condition_out,
              conditionIn,
              notes: c.notes,
              signatureOutPath: c.signature_path,
              signatureInPath: path,
            });
            downloadBlob(pdf, `revers-${c.assets.code}-${c.id.slice(0, 8)}-povrat.pdf`);
          } catch (e) {
            console.error(e);
          }
        }
      }

      toast.success(`Razduženo ${selectedItems.length} stavki`);
      qc.invalidateQueries({ queryKey: ["checkouts"] });
      qc.invalidateQueries({ queryKey: ["open-checkouts"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wizard: povratak opreme</DialogTitle>
          <DialogDescription>
            Korak {step + 1} od {STEPS.length} · {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`h-7 w-7 rounded-full grid place-items-center text-xs font-medium ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary/20 text-primary border border-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-xs ${i === step ? "font-medium" : "text-muted-foreground"} hidden sm:inline`}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="grid gap-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pretraži po opremi, primaocu, šifri…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="border rounded-md max-h-96 overflow-y-auto divide-y">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Receipt className="h-6 w-6 mx-auto mb-2" />
                  Nema otvorenih reversa
                </div>
              ) : (
                filtered.map((c) => {
                  const isSel = selectedIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-accent/40 ${isSel ? "bg-accent/30" : ""}`}
                    >
                      <Checkbox checked={isSel} onCheckedChange={() => toggle(c.id)} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {c.assets?.name ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.assets?.code} · {c.checked_out_to_name ?? "—"}
                          {c.events?.name && ` · ${c.events.name}`} ·{" "}
                          {formatDateTime(c.checked_out_at)}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3 py-2">
            <div className="text-sm text-muted-foreground">
              Označi stanje pri vraćanju za svaku stavku:
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {selectedItems.map((c) => {
                const st = states[c.id] ?? { condition: "OK", note: "" };
                return (
                  <div key={c.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {c.assets?.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.assets?.code}
                        </div>
                      </div>
                      <Select
                        value={st.condition}
                        onValueChange={(v) =>
                          updateState(c.id, { condition: v as ItemState["condition"] })
                        }
                      >
                        <SelectTrigger className="w-35">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OK">U redu</SelectItem>
                          <SelectItem value="damaged">Oštećeno</SelectItem>
                          <SelectItem value="missing">Nedostaje</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {st.condition !== "OK" && (
                      <Input
                        placeholder="Opis (obavezno za oštećeno/nedostaje)"
                        value={st.note}
                        onChange={(e) => updateState(c.id, { note: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stavki za razduženje:</span>
                <span className="font-medium">{selectedItems.length}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedItems.map((c) => {
                  const st = states[c.id] ?? { condition: "OK", note: "" };
                  return (
                    <Badge
                      key={c.id}
                      variant={st.condition === "OK" ? "outline" : "destructive"}
                    >
                      {c.assets?.code} ·{" "}
                      {st.condition === "OK"
                        ? "OK"
                        : st.condition === "damaged"
                          ? "Oštećeno"
                          : "Nedostaje"}
                    </Badge>
                  );
                })}
              </div>
            </div>
            <Label>Potpis primaoca/zaduženog *</Label>
            <SignaturePad ref={sigRef} label="Potpis pri povratu *" />
          </div>
        )}

        <DialogFooter className="flex-row justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || busy}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Nazad
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Dalje <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finalize} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Razduži i generiši PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
