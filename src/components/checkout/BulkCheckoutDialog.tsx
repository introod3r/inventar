import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, FileText, Trash2 } from "lucide-react";
import { generateReversPdf, downloadBlob } from "@/lib/revers-pdf";
import type { CartItem } from "@/features/cart/use-scan-cart";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: CartItem[];
  onRemoveItem?: (id: string) => void;
  onDone?: () => void;
};

async function uploadSignature(blob: Blob, checkoutId: string) {
  const path = `${checkoutId}/out-${Date.now()}.png`;
  const { error } = await supabase.storage.from("signatures").upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) throw error;
  return path;
}

export function BulkCheckoutDialog({ open, onOpenChange, items, onRemoveItem, onDone }: Props) {
  const qc = useQueryClient();
  const sigRef = useRef<SignaturePadHandle>(null);
  const [eventId, setEventId] = useState<string>("none");
  const [recipient, setRecipient] = useState("");
  const [expected, setExpected] = useState("");
  const [conditionOut, setConditionOut] = useState("OK");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setEventId("none"); setRecipient(""); setExpected(""); setConditionOut("OK"); setNotes("");
    }
  }, [open]);

  const { data: events } = useQuery({
    queryKey: ["events-active"],
    queryFn: async () => (await supabase.from("events").select("id,name,start_at,status").in("status", ["confirmed", "in_progress", "draft"]).order("start_at", { ascending: true }).limit(50)).data ?? [],
    enabled: open,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!items.length) throw new Error("Korpa je prazna.");
      if (!recipient.trim()) throw new Error("Unesi ime osobe koja preuzima.");
      if (sigRef.current?.isEmpty()) throw new Error("Potpis je obavezan.");
      const blob = await sigRef.current!.toBlob();
      if (!blob) throw new Error("Greška pri preuzimanju potpisa.");

      const { data: { user } } = await supabase.auth.getUser();
      const newStatus = eventId !== "none" ? "at_event" : "in_transit";

      const created: { id: string; signaturePath: string; asset: CartItem }[] = [];
      for (const it of items) {
        const { data: ck, error } = await supabase.from("checkouts").insert({
          asset_id: it.id,
          event_id: eventId === "none" ? null : eventId,
          checked_out_to_name: recipient.trim(),
          checked_out_by: user?.id ?? null,
          expected_return_at: expected ? new Date(expected).toISOString() : null,
          condition_out: conditionOut,
          notes: notes || null,
        }).select("id").single();
        if (error) throw error;

        const path = await uploadSignature(blob, ck.id);
        await supabase.from("checkouts").update({ signature_path: path }).eq("id", ck.id);
        await supabase.from("assets").update({ status: newStatus }).eq("id", it.id);
        if (eventId !== "none") {
          await supabase.from("event_assets").update({ status: "picked" }).eq("event_id", eventId).eq("asset_id", it.id);
        }
        created.push({ id: ck.id, signaturePath: path, asset: it });
      }
      return created;
    },
    onSuccess: async (created) => {
      toast.success(`Zaduženo ${created.length} stavki`);
      qc.invalidateQueries({ queryKey: ["checkouts"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event-assets"] });
      const ev = events?.find((e) => e.id === eventId) ?? null;
      for (const c of created) {
        try {
          const pdf = await generateReversPdf({
            checkoutId: c.id,
            assets: [c.asset],
            event: ev ? { name: ev.name } : null,
            checkedOutToName: recipient,
            checkedOutAt: new Date().toISOString(),
            expectedReturnAt: expected || null,
            conditionOut,
            notes: notes || null,
            signatureOutPath: c.signaturePath,
          });
          downloadBlob(pdf, `revers-${c.asset.code}-${c.id.slice(0, 8)}.pdf`);
        } catch (e) {
          toast.error(`PDF (${c.asset.code}): ${(e as Error).message}`);
        }
      }
      onDone?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setBusy(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zaduži korpu ({items.length})</DialogTitle>
          <DialogDescription>Jedan potpis i jedna osoba primaju sve stavke iz korpe.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">Korpa je prazna.</div>
            ) : (
              items.map((it) => (
                <div key={it.id} className="flex items-center gap-2 p-2 px-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{it.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{it.code}</div>
                  </div>
                  {onRemoveItem && (
                    <Button size="icon" variant="ghost" onClick={() => onRemoveItem(it.id)} aria-label="Ukloni">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Događaj (opciono)</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Bez događaja —</SelectItem>
                  {events?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Očekivani povrat</Label>
              <Input type="datetime-local" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Preuzima (ime i prezime) *</Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="npr. Marko Marković" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Stanje opreme pri izdavanju</Label>
              <Input value={conditionOut} onChange={(e) => setConditionOut(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Napomene</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <SignaturePad ref={sigRef} label="Potpis primaoca (jedan za sve) *" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Otkaži</Button>
          <Button onClick={() => { setBusy(true); submit.mutate(); }} disabled={busy || items.length === 0}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Zaduži {items.length} {items.length === 1 ? "stavku" : "stavki"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
