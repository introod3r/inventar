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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  FileText,
  Search,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Package,
  Camera,
  Keyboard,
} from "lucide-react";
import { generateReversPdf, downloadBlob } from "@/lib/revers-pdf";
import { ASSET_STATUS_LABEL } from "@/components/common/StatusBadge";
import { CameraScanner, type ScanResult } from "@/components/scanner/CameraScanner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillEventId?: string;
  prefillAssets?: AssetRow[];
};

type AssetRow = {
  id: string;
  code: string;
  name: string;
  serial_number: string | null;
  status: string;
};

const STEPS = ["Događaj", "Klijent", "Zaduženje", "Oprema", "Potpis"] as const;

async function uploadSignature(blob: Blob, checkoutId: string) {
  const path = `${checkoutId}/out-${Date.now()}.png`;
  const { error } = await supabase.storage
    .from("signatures")
    .upload(path, blob, { contentType: "image/png", upsert: true });
  if (error) throw error;
  return path;
}

export function CheckoutWizard({ open, onOpenChange, prefillEventId, prefillAssets }: Props) {
  const qc = useQueryClient();
  const sigRef = useRef<SignaturePadHandle>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Step 0: Dogadjaj
  const [eventId, setEventId] = useState<string>("none");
  const [newEventName, setNewEventName] = useState("");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");

  // Step 1: Klijent
  const [clientId, setClientId] = useState<string>("none");
  const [newClientName, setNewClientName] = useState("");

  // Step 2: Zaduzenje
  const [recipient, setRecipient] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [expected, setExpected] = useState("");
  const [conditionOut, setConditionOut] = useState("OK");
  const [notes, setNotes] = useState("");

  // Step 3: Oprema
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Map<string, AssetRow>>(new Map());
  const [scanMode, setScanMode] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setEventId("none");
      setNewEventName("");
      setNewEventStart("");
      setNewEventEnd("");
      setClientId("none");
      setNewClientName("");
      setRecipient("");
      setRecipientPhone("");
      setExpected("");
      setConditionOut("OK");
      setNotes("");
      setSearch("");
      setPicked(new Map());
      setScanMode(false);
    } else {
      if (prefillEventId) {
        setEventId(prefillEventId);
      }
      if (prefillAssets && prefillAssets.length > 0) {
        const m = new Map();
        prefillAssets.forEach(a => m.set(a.id, a));
        setPicked(m);
      }
    }
  }, [open, prefillEventId, prefillAssets]);

  const { data: events } = useQuery({
    queryKey: ["events-active-wizard"],
    queryFn: async () =>
      (
        await supabase
          .from("events")
          .select("id,name,start_at,status,client_id")
          .in("status", ["confirmed", "in_progress", "draft"])
          .order("start_at", { ascending: true })
          .limit(50)
      ).data ?? [],
    enabled: open,
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-wizard"],
    queryFn: async () => (await supabase.from("clients").select("id,name,contact,phone").order("name")).data ?? [],
    enabled: open,
  });

  const clientContacts = useMemo(() => {
    if (clientId === "new" || clientId === "none") return [];
    const client = clients?.find(c => c.id === clientId);
    if (!client) return [];
    
    let parsed: { name: string, phone: string }[] = [];
    if (client.contact) {
      if (client.contact.startsWith('[')) {
        try { parsed = JSON.parse(client.contact); } catch(e) {}
      } else {
        parsed = [{ name: client.contact, phone: client.phone || "" }];
      }
    }
    return parsed;
  }, [clientId, clients]);

  // Automatically pre-select client if an existing event is selected and it has a client_id
  useEffect(() => {
    if (eventId && eventId !== "none" && eventId !== "new") {
      const ev = events?.find(e => e.id === eventId);
      if (ev && ev.client_id) {
        setClientId(ev.client_id);
      }
    }
  }, [eventId, events]);

  const { data: assets } = useQuery({
    queryKey: ["assets-available", search],
    queryFn: async () => {
      let q = supabase
        .from("assets")
        .select("id,code,name,serial_number,status")
        .in("status", ["available", "reserved", "returned"])
        .order("name", { ascending: true })
        .limit(50);
      const term = search.trim();
      if (term) {
        q = q.or(`name.ilike.%${term}%,code.ilike.%${term}%,serial_number.ilike.%${term}%`);
      }
      const { data } = await q;
      return (data ?? []) as AssetRow[];
    },
    enabled: open && step === 3 && !scanMode,
  });

  const togglePick = (a: AssetRow) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(a.id)) next.delete(a.id);
      else next.set(a.id, a);
      return next;
    });
  };

  const handleScan = async (r: ScanResult) => {
    const code = r.code.trim();
    for (const a of picked.values()) {
      if (a.code === code || a.serial_number === code) {
        toast.info("Oprema je već na listi");
        return;
      }
    }
    const { data, error } = await supabase.from("assets")
      .select("id,code,name,serial_number,status")
      .in("status", ["available", "reserved", "returned"])
      .or(`code.eq.${code},serial_number.eq.${code},id.eq.${code}`)
      .maybeSingle();

    if (error || !data) {
      toast.error(`Nepoznata ili nedostupna oprema: ${code}`);
      return;
    }
    
    togglePick(data);
    toast.success(`Dodato: ${data.name}`);
  };

  const canNext = useMemo(() => {
    if (step === 0) {
      if (eventId === "new") return newEventName.trim().length > 0 && newEventStart && newEventEnd;
      return true; // eventId can be "none" or existing
    }
    if (step === 1) {
      if (clientId === "new") return newClientName.trim().length > 0;
      return true; // clientId can be "none" or existing
    }
    if (step === 2) return recipient.trim().length > 1;
    if (step === 3) return picked.size > 0;
    return true;
  }, [step, eventId, newEventName, newEventStart, newEventEnd, clientId, newClientName, recipient, picked]);

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
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Resolve Client
      let finalClientId = clientId === "none" ? null : clientId;
      let finalClientName = clientId === "new" ? newClientName.trim() : (clients?.find(c => c.id === clientId)?.name || null);
      if (clientId === "new") {
        const contactJson = recipient.trim() ? JSON.stringify([{ name: recipient.trim(), phone: recipientPhone.trim() }]) : null;
        const { data: newC, error: errC } = await supabase.from("clients")
          .insert({ 
            name: newClientName.trim(),
            contact: contactJson,
            phone: null
          }).select().single();
        if (errC) throw new Error("Greška pri kreiranju klijenta: " + errC.message);
        finalClientId = newC.id;
      } else if (finalClientId) {
        // Append contact and phone to existing client if not already there
        const { data: extClient } = await supabase.from("clients").select("contact, phone").eq("id", finalClientId).single();
        if (extClient) {
          const recName = recipient.trim();
          const recPhone = recipientPhone.trim();
          
          if (recName) {
            let parsedContacts: { name: string, phone: string }[] = [];
            const contactStr = extClient.contact;
            if (contactStr) {
               if (contactStr.trim().startsWith('[')) {
                 try { parsedContacts = JSON.parse(contactStr); } catch (e) {}
               } else {
                 parsedContacts = [{ name: contactStr, phone: extClient.phone || "" }];
               }
            }
            if (!parsedContacts.some(c => c.name.toLowerCase() === recName.toLowerCase())) {
               parsedContacts.push({ name: recName, phone: recPhone });
               await supabase.from("clients").update({
                 contact: JSON.stringify(parsedContacts)
               }).eq("id", finalClientId);
            }
          }
        }
      }

      // 2. Resolve Event
      let finalEventId = eventId === "none" ? null : eventId;
      let finalEventName = events?.find(e => e.id === eventId)?.name || null;
      if (eventId === "new") {
        const { data: newE, error: errE } = await supabase.from("events")
          .insert({
            name: newEventName.trim(),
            start_at: new Date(newEventStart).toISOString(),
            end_at: new Date(newEventEnd).toISOString(),
            client_id: finalClientId,
            status: "confirmed"
          }).select().single();
        if (errE) throw new Error("Greška pri kreiranju događaja: " + errE.message);
        finalEventId = newE.id;
        finalEventName = newE.name;
      }

      // Grouping identifier
      const commonCheckedOutAt = new Date().toISOString();
      const groupId = Math.random().toString(36).slice(2, 10);
      const path = await uploadSignature(blob, `group-${groupId}`);

      const items = Array.from(picked.values());
      const created: { id: string; asset: AssetRow }[] = [];
      
      for (const a of items) {
        const { data, error } = await supabase
          .from("checkouts")
          .insert({
            asset_id: a.id,
            event_id: finalEventId,
            checked_out_to_name: recipient.trim(),
            checked_out_by: user?.id ?? null,
            checked_out_at: commonCheckedOutAt,
            expected_return_at: expected ? new Date(expected).toISOString() : null,
            condition_out: conditionOut,
            notes: notes || null,
            signature_path: path,
          })
          .select("id")
          .single();
        if (error) throw error;
        created.push({ id: data.id, asset: a });
        
        await supabase
          .from("assets")
          .update({ status: finalEventId ? "at_event" : "in_transit" })
          .eq("id", a.id);
      }

      try {
        const pdf = await generateReversPdf({
          checkoutId: `GRP-${groupId.toUpperCase()}`,
          assets: created.map(c => c.asset),
          event: finalEventName ? { name: finalEventName } : null,
          client: finalClientName ? { name: finalClientName } : null,
          checkedOutToName: recipient,
          checkedOutAt: commonCheckedOutAt,
          expectedReturnAt: expected || null,
          conditionOut,
          notes: notes || null,
          signatureOutPath: path,
        });
        downloadBlob(pdf, `revers-${recipient.trim().replace(/\s+/g, '-')}-${groupId}.pdf`);
      } catch (e) {
        console.error("Greška pri generisanju PDF-a:", e);
      }

      toast.success(`Kreiran revers za ${created.length} stavki`);
      qc.invalidateQueries({ queryKey: ["checkouts"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
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
          <DialogTitle>Izdavanje opreme</DialogTitle>
          <DialogDescription>
            Korak {step + 1} od {STEPS.length} · {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1 sm:gap-2 mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 sm:gap-2 flex-1">
              <div
                className={`h-6 w-6 sm:h-7 sm:w-7 rounded-full grid place-items-center text-[10px] sm:text-xs font-medium shrink-0 ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary/20 text-primary border border-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3 w-3 sm:h-4 sm:w-4" /> : i + 1}
              </div>
              <span
                className={`text-[10px] sm:text-xs ${i === step ? "font-medium" : "text-muted-foreground"} hidden sm:inline truncate`}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border min-w-1" />}
            </div>
          ))}
        </div>

        {/* Step 0: Događaj */}
        {step === 0 && (
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Izaberite događaj</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Izaberite ili kreirajte događaj" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Bez događaja —</SelectItem>
                  <SelectItem value="new" className="font-semibold text-primary">+ Kreiraj novi događaj</SelectItem>
                  {events?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {eventId === "new" && (
              <div className="rounded-md border p-4 bg-muted/30 space-y-4 animate-in fade-in slide-in-from-top-2">
                <h4 className="text-sm font-medium">Novi događaj</h4>
                <div className="space-y-1.5">
                  <Label className="text-xs">Naziv događaja *</Label>
                  <Input value={newEventName} onChange={e => setNewEventName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Početak *</Label>
                    <Input type="datetime-local" value={newEventStart} onChange={e => setNewEventStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kraj *</Label>
                    <Input type="datetime-local" value={newEventEnd} onChange={e => setNewEventEnd(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Klijent */}
        {step === 1 && (
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Izaberite klijenta</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Izaberite ili kreirajte klijenta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Bez klijenta —</SelectItem>
                  <SelectItem value="new" className="font-semibold text-primary">+ Kreiraj novog klijenta</SelectItem>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {clientId === "new" && (
              <div className="rounded-md border p-4 bg-muted/30 space-y-4 animate-in fade-in slide-in-from-top-2">
                <h4 className="text-sm font-medium">Novi klijent</h4>
                <div className="space-y-1.5">
                  <Label className="text-xs">Naziv klijenta *</Label>
                  <Input value={newClientName} onChange={e => setNewClientName(e.target.value)} autoFocus />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Podaci o zaduženju */}
        {step === 2 && (
          <div className="grid gap-4 py-2">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Preuzima (ime i prezime lica) *</Label>
                {clientContacts.length > 0 && (
                  <datalist id="client-contacts-list">
                    {clientContacts.map(c => <option key={c.name} value={c.name} />)}
                  </datalist>
                )}
                <Input
                  list={clientContacts.length > 0 ? "client-contacts-list" : undefined}
                  value={recipient}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRecipient(val);
                    const match = clientContacts.find(c => c.name.toLowerCase() === val.toLowerCase());
                    if (match && match.phone) {
                      setRecipientPhone(match.phone);
                    }
                  }}
                  placeholder="npr. Marko Marković"
                  autoComplete="off"
                />
                {clientContacts.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Izaberite iz padajuće liste ili upišite novog
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Telefon preuzimaoca (opciono)</Label>
                <Input
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="npr. 064/123-4567"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Očekivani datum povrata</Label>
              <Input
                type="datetime-local"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stanje pri izdavanju</Label>
              <Input
                value={conditionOut}
                onChange={(e) => setConditionOut(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Napomena</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 3: izbor opreme */}
        {step === 3 && (
          <div className="grid gap-3 py-2">
            <div className="flex bg-muted p-1 rounded-md mb-2">
              <button
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-sm transition-colors ${!scanMode ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                onClick={() => setScanMode(false)}
              >
                <Keyboard className="h-4 w-4" /> Pretraga
              </button>
              <button
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-sm transition-colors ${scanMode ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50'}`}
                onClick={() => setScanMode(true)}
              >
                <Camera className="h-4 w-4" /> Skener
              </button>
            </div>

            {scanMode ? (
              <div className="border rounded-md overflow-hidden bg-black/5">
                <CameraScanner onScan={handleScan} />
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pretraži opremu po nazivu, šifri, S/N…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}

            {picked.size > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t mt-2">
                <div className="w-full text-xs font-medium text-muted-foreground mb-1">Izabrano ({picked.size}):</div>
                {Array.from(picked.values()).map((a) => (
                  <Badge key={a.id} variant="secondary" className="gap-1">
                    {a.code} · {a.name}
                    <button onClick={() => togglePick(a)} aria-label="Ukloni" className="hover:text-destructive transition-colors ml-1">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {!scanMode && (
              <div className="border rounded-md max-h-60 overflow-y-auto divide-y mt-2">
                {(assets ?? []).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <Package className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    {search ? "Nema rezultata za pretragu" : "Učitavam opremu..."}
                  </div>
                ) : (
                  (assets ?? []).map((a) => {
                    const isSel = picked.has(a.id);
                    return (
                      <label
                        key={a.id}
                        className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-accent/40 ${isSel ? "bg-accent/30" : ""}`}
                      >
                        <Checkbox checked={isSel} onCheckedChange={() => togglePick(a)} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{a.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {a.code}
                            {a.serial_number && ` · S/N: ${a.serial_number}`}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {ASSET_STATUS_LABEL[a.status as keyof typeof ASSET_STATUS_LABEL] ?? a.status}
                        </Badge>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: pregled + potpis */}
        {step === 4 && (
          <div className="grid gap-3 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Lice: </span>
                <span className="font-medium">{recipient} {recipientPhone && `(${recipientPhone})`}</span>
              </div>
              {eventId !== "none" && (
                <div>
                  <span className="text-muted-foreground">Događaj: </span>
                  {eventId === "new" ? newEventName : events?.find((e) => e.id === eventId)?.name}
                </div>
              )}
              {clientId !== "none" && (
                <div>
                  <span className="text-muted-foreground">Klijent: </span>
                  {clientId === "new" ? newClientName : clients?.find((c) => c.id === clientId)?.name}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Broj stavki opreme: </span>
                <span className="font-medium">{picked.size}</span>
              </div>
            </div>
            <SignaturePad ref={sigRef} label="Potpis primaoca *" />
          </div>
        )}

        <DialogFooter className="flex-row justify-between gap-2 border-t pt-4">
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
            <Button onClick={finalize} disabled={busy || !canNext}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Završi i generiši PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
