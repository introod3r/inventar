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
import { Loader2, FileText } from "lucide-react";
import { generateReversPdf, downloadBlob } from "@/lib/revers-pdf";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: { id: string; code: string; name: string; serial_number?: string | null };
  onDone?: () => void;
};

async function uploadSignature(blob: Blob, checkoutId: string, kind: "out" | "in") {
  const path = `${checkoutId}/${kind}-${Date.now()}.png`;
  const { error } = await supabase.storage.from("signatures").upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) throw error;
  return path;
}

export function CheckoutDialog({ open, onOpenChange, asset, onDone }: Props) {
  const qc = useQueryClient();
  const sigRef = useRef<SignaturePadHandle>(null);
  const [eventId, setEventId] = useState<string>("none");
  const [recipient, setRecipient] = useState("");
  const [expected, setExpected] = useState("");
  const [conditionOut, setConditionOut] = useState("OK");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setEventId("none"); setRecipient(""); setExpected(""); setConditionOut("OK"); setNotes(""); } }, [open]);

  const { data: events } = useQuery({
    queryKey: ["events-active"],
    queryFn: async () => (await supabase.from("events").select("id,name,start_at,status").in("status", ["confirmed", "in_progress", "draft"]).order("start_at", { ascending: true }).limit(50)).data ?? [],
    enabled: open,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!recipient.trim()) throw new Error("Unesi ime osobe koja preuzima.");
      if (sigRef.current?.isEmpty()) throw new Error("Potpis je obavezan.");
      const blob = await sigRef.current!.toBlob();
      if (!blob) throw new Error("Greška pri preuzimanju potpisa.");

      const { data: { user } } = await supabase.auth.getUser();
      const { data: created, error } = await supabase.from("checkouts").insert({
        asset_id: asset.id,
        event_id: eventId === "none" ? null : eventId,
        checked_out_to_name: recipient.trim(),
        checked_out_by: user?.id ?? null,
        expected_return_at: expected ? new Date(expected).toISOString() : null,
        condition_out: conditionOut,
        notes: notes || null,
      }).select("id").single();
      if (error) throw error;

      const path = await uploadSignature(blob, created.id, "out");
      const { error: upErr } = await supabase.from("checkouts").update({ signature_path: path }).eq("id", created.id);
      if (upErr) throw upErr;

      // status update
      await supabase.from("assets").update({ status: eventId !== "none" ? "at_event" : "in_transit" }).eq("id", asset.id);
      if (eventId !== "none") {
        await supabase.from("event_assets").update({ status: "picked" }).eq("event_id", eventId).eq("asset_id", asset.id);
      }

      return { id: created.id, signaturePath: path };
    },
    onSuccess: async (res) => {
      toast.success("Zaduženje kreirano");
      qc.invalidateQueries({ queryKey: ["checkouts"] });
      qc.invalidateQueries({ queryKey: ["asset", asset.id] });
      qc.invalidateQueries({ queryKey: ["asset-history", asset.id] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event-assets"] });
      onDone?.();
      // generate PDF
      try {
        const ev = events?.find((e) => e.id === eventId) ?? null;
        const pdf = await generateReversPdf({
          checkoutId: res.id,
          assets: [asset],
          event: ev ? { name: ev.name } : null,
          checkedOutToName: recipient,
          checkedOutAt: new Date().toISOString(),
          expectedReturnAt: expected || null,
          conditionOut,
          notes: notes || null,
          signatureOutPath: res.signaturePath,
        });
        downloadBlob(pdf, `revers-${asset.code}-${res.id.slice(0, 8)}.pdf`);
      } catch (e) {
        toast.error("PDF nije generisan: " + (e as Error).message);
      }
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setBusy(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zaduži opremu</DialogTitle>
          <DialogDescription>{asset.name} · {asset.code}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Događaj (opciono)</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger><SelectValue placeholder="Bez događaja" /></SelectTrigger>
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
              <Input value={conditionOut} onChange={(e) => setConditionOut(e.target.value)} placeholder="OK / opis" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Napomene</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <SignaturePad ref={sigRef} label="Potpis primaoca *" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Otkaži</Button>
          <Button onClick={() => { setBusy(true); submit.mutate(); }} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Zaduži i generiši revers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ReturnProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  checkout: { id: string; asset_id: string; checked_out_to_name?: string | null; condition_out?: string | null; checked_out_at: string; expected_return_at?: string | null; notes?: string | null; signature_path?: string | null; event_id?: string | null };
  asset: { id: string; code: string; name: string; serial_number?: string | null };
};

export function ReturnDialog({ open, onOpenChange, checkout, asset }: ReturnProps) {
  const qc = useQueryClient();
  const sigRef = useRef<SignaturePadHandle>(null);
  const [conditionIn, setConditionIn] = useState("OK");
  const [damaged, setDamaged] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      if (sigRef.current?.isEmpty()) throw new Error("Potpis je obavezan.");
      const blob = await sigRef.current!.toBlob();
      if (!blob) throw new Error("Greška sa potpisom.");
      const path = await uploadSignature(blob, checkout.id, "in");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("checkouts").update({
        returned_at: new Date().toISOString(),
        return_received_by: user?.id ?? null,
        return_signature_path: path,
        condition_in: conditionIn,
      }).eq("id", checkout.id);
      if (error) throw error;
      await supabase.from("assets").update({ status: damaged ? "damaged" : "available" }).eq("id", asset.id);
      if (checkout.event_id) {
        await supabase.from("event_assets").update({ status: damaged ? "missing" : "returned" }).eq("event_id", checkout.event_id).eq("asset_id", asset.id);
      }
      return { signaturePath: path };
    },
    onSuccess: async (res) => {
      toast.success("Razduženje sačuvano");
      qc.invalidateQueries({ queryKey: ["checkouts"] });
      qc.invalidateQueries({ queryKey: ["asset", asset.id] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event-assets"] });
      try {
        const pdf = await generateReversPdf({
          checkoutId: checkout.id,
          assets: [asset],
          checkedOutToName: checkout.checked_out_to_name,
          checkedOutAt: checkout.checked_out_at,
          expectedReturnAt: checkout.expected_return_at,
          returnedAt: new Date().toISOString(),
          conditionOut: checkout.condition_out,
          conditionIn,
          notes: checkout.notes,
          signatureOutPath: checkout.signature_path,
          signatureInPath: res.signaturePath,
        });
        downloadBlob(pdf, `revers-${asset.code}-${checkout.id.slice(0, 8)}-povrat.pdf`);
      } catch (e) {
        toast.error("PDF nije generisan: " + (e as Error).message);
      }
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setBusy(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Razduži opremu</DialogTitle>
          <DialogDescription>{asset.name} · {asset.code}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Stanje pri povratu</Label>
            <Input value={conditionIn} onChange={(e) => setConditionIn(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} />
            Oprema je oštećena (postavlja status na <span className="font-medium">damaged</span>)
          </label>
          <SignaturePad ref={sigRef} label="Potpis pri povratu *" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Otkaži</Button>
          <Button onClick={() => { setBusy(true); submit.mutate(); }} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Razduži i generiši PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
