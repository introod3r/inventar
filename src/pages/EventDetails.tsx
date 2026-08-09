import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";
import { useAuth } from "@/features/auth/use-auth";
import type { Database } from "@/integrations/supabase/types";
import { FileDown, PackageOpen, Camera, Keyboard } from "lucide-react";
import { CheckoutWizard } from "@/components/checkout/CheckoutWizard";
import { exportCsv } from "@/lib/csv";
import { LocationInput } from "@/components/common/LocationInput";
import { LocationMapDisplay } from "@/components/common/LocationMapDisplay";
import { CameraScanner, type ScanResult } from "@/components/scanner/CameraScanner";

type EventStatus = Database["public"]["Enums"]["event_status"];
const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Skica", confirmed: "Potvrđen", in_progress: "U toku", completed: "Završen", cancelled: "Otkazan",
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}




export default function EventDetails() {
  const { eventId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("manage_events");
  const [open, setOpen] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [form, setForm] = useState({ name: "", start_at: "", end_at: "", location_text: "", notes: "", status: "draft" as EventStatus, client_id: "" });



  const { data: event } = useQuery({
    queryKey: ["event", eventId!],
    queryFn: async () => (await supabase
      .from("events")
      .select("*, clients:client_id(name)")
      .eq("id", eventId!)
      .maybeSingle()).data,
  });

  const { data: items } = useQuery({
    queryKey: ["event-assets", eventId!],
    queryFn: async () => (await supabase
      .from("event_assets")
      .select("*, assets:asset_id(id,code,name,status)")
      .eq("event_id", eventId!)).data ?? [],
  });

  const { data: checkouts } = useQuery({
    queryKey: ["event-checkouts", eventId!],
    queryFn: async () => (await supabase
      .from("checkouts")
      .select("*, assets:asset_id(id,code,name,status)")
      .eq("event_id", eventId!)
      .is("returned_at", null)).data ?? [],
  });

  const { data: searchResults } = useQuery({
    queryKey: ["asset-search", search],
    enabled: search.length > 1,
    queryFn: async () => (await supabase
      .from("assets")
      .select("id,code,name,status")
      .or(`name.ilike.%${search}%,code.ilike.%${search}%`)
      .limit(10)).data ?? [],
  });

  const addAsset = useMutation({
    mutationFn: async (assetId: string) => {
      if (!event) return;
      const { error } = await supabase.from("event_assets").insert({
        event_id: eventId!, asset_id: assetId, quantity: 1,
        reserved_from: event.start_at, reserved_to: event.end_at,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oprema rezervisana");
      setSearch("");
      qc.invalidateQueries({ queryKey: ["event-assets", eventId!] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleScan = async (r: ScanResult) => {
    const code = r.code.trim();
    
    // Provera da li je već dodato
    if (items?.find((it: any) => it.assets?.code === code || it.assets?.serial_number === code)) {
      toast.info(`Oprema ${code} je već na spisku.`);
      return;
    }

    const { data: asset, error } = await supabase.from("assets")
      .select("id,name,code,status")
      .in("status", ["available", "returned", "reserved"])
      .or(`code.eq.${code},serial_number.eq.${code}`)
      .maybeSingle();

    if (error || !asset) {
      toast.error(`Oprema nije pronađena ili nije dostupna (${code})`);
      return;
    }

    addAsset.mutate(asset.id);
  };

  const removeAsset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-assets", eventId!] }),
  });

  const saveEvent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("events").update({
        name: form.name.trim(),
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        location_text: form.location_text || null,
        notes: form.notes || null,
        status: form.status,
        client_id: form.client_id || null,
      }).eq("id", eventId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sačuvano");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["event", eventId!] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteEvent = useMutation({
    mutationFn: async () => {
      // Find active checkouts for this event
      const { data: activeCheckouts } = await supabase
        .from("checkouts")
        .select("id, asset_id")
        .eq("event_id", eventId!)
        .is("returned_at", null);
        
      // Find reserved assets
      const { data: eventAssets } = await supabase
        .from("event_assets")
        .select("asset_id")
        .eq("event_id", eventId!);

      const assetIds = new Set<string>();
      const checkoutIds: string[] = [];

      if (activeCheckouts) {
        for (const c of activeCheckouts) {
          assetIds.add(c.asset_id);
          checkoutIds.push(c.id);
        }
      }
      if (eventAssets) {
        for (const ea of eventAssets) {
          assetIds.add(ea.asset_id);
        }
      }

      // 1. Mark checkouts as returned
      if (checkoutIds.length > 0) {
        await supabase.from("checkouts").update({ returned_at: new Date().toISOString() }).in("id", checkoutIds);
      }

      // 2. Return all associated assets to 'available' status
      if (assetIds.size > 0) {
        await supabase.from("assets").update({ status: "available" }).in("id", Array.from(assetIds));
      }

      // 3. Delete the event (cascades to event_assets)
      const { error } = await supabase.from("events").delete().eq("id", eventId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Događaj obrisan");
      qc.invalidateQueries({ queryKey: ["events"] });
      nav("/events");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  useEffect(() => {
    if (event && !editOpen) {
      setForm({
        name: event.name ?? "",
        start_at: toLocalInput(event.start_at),
        end_at: toLocalInput(event.end_at),
        location_text: event.location_text ?? "",
        notes: event.notes ?? "",
        status: event.status,
        client_id: event.client_id ?? "",
      });
    }
  }, [event, editOpen]);

  if (!event) return <PageContainer><div className="p-8">Učitavanje…</div></PageContainer>;
  const client = (event as unknown as { clients: { name: string } | null }).clients;

  return (
    <PageContainer>
        
        {/* Header - Glass Card */}
        <div className="glass-card rounded-2xl p-5 sm:p-8 mesh-bg flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="space-y-2 w-full lg:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">DOGAĐAJ</span>
              <Badge className={`${STATUS_LABEL[event.status] === 'U toku' ? 'bg-blue-500' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'}`}>
                {STATUS_LABEL[event.status]}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight gradient-heading leading-tight wrap-break-word">
              {event.name}
            </h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-slate-600 dark:text-slate-400 mt-2">
              {client?.name && (
                <div className="flex items-center gap-1.5"><span className="font-semibold">{client.name}</span></div>
              )}
              <div className="hidden sm:block text-slate-300">•</div>
              <div className="flex items-center gap-1.5">
                <span className="opacity-80">{formatDateTime(event.start_at)}</span>
                <span className="opacity-50">→</span>
                <span className="opacity-80">{formatDateTime(event.end_at)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 lg:gap-3 w-full lg:w-auto mt-2 lg:mt-0">
            <Button variant="outline" className="flex-1 sm:flex-none border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800" asChild>
              <Link to="/events"><ArrowLeft className="mr-2 h-4 w-4" />Nazad</Link>
            </Button>
            {canManage && (
              <Button variant="outline" className="flex-1 sm:flex-none border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />Izmeni
              </Button>
            )}
            <Button 
              variant="outline" 
              className="flex-1 sm:flex-none border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800"
              onClick={() => {
                if (!items || items.length === 0) {
                  toast.error("Nema rezervisane opreme za izvoz");
                  return;
                }
                exportCsv(`dogadjaj-${event.name}-${new Date().toISOString().slice(0, 10)}`, items, [
                  { header: "Šifra", value: (i) => (i as any).assets?.code ?? "" },
                  { header: "Naziv", value: (i) => (i as any).assets?.name ?? "" },
                  { header: "Količina", value: (i) => String(i.quantity) },
                  { header: "Od", value: (i) => formatDateTime(i.reserved_from) },
                  { header: "Do", value: (i) => formatDateTime(i.reserved_to) },
                ]);
                toast.success("Spisak opreme je preuzet");
              }}
            >
              <FileDown className="mr-2 h-4 w-4" /> PDF Spisak
            </Button>
            {canManage && (
              <ConfirmDelete
                title={`Da li želiš da obrišeš događaj „${event.name}"?`}
                description="Sva oprema (rezervisana i izdata) će automatski biti vraćena u status dostupno."
                onConfirm={() => deleteEvent.mutate()}
                trigger={<Button variant="destructive" className="flex-1 sm:flex-none w-full sm:w-auto"><Trash2 className="mr-2 h-4 w-4" />Obriši</Button>}
              />
            )}
          </div>
        </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Izmeni događaj</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1.5"><Label>Naziv</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Početak</Label><Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Kraj</Label><Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as EventStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as EventStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Lokacija</Label>
              <LocationInput value={form.location_text} onChange={(val) => setForm({ ...form, location_text: val })} />
            </div>
            <div className="sm:col-span-2 space-y-1.5"><Label>Napomene</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => saveEvent.mutate()} disabled={saveEvent.isPending}>Sačuvaj</Button></DialogFooter>
        </DialogContent>
      </Dialog>



        <div className="grid gap-6 lg:grid-cols-2">
          {/* Active Checkouts Card */}
          <div className="glass-card rounded-2xl p-5 border-blue-500/20 shadow-[0_4px_24px_rgba(59,130,246,0.05)] ring-1 ring-blue-500/10">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                Izdata oprema (Na događaju)
              </h2>
              <p className="text-xs text-slate-500 mt-1">Oprema koja je fizički izdata klijentu</p>
            </div>
            
            {!checkouts?.length ? (
              <div className="py-8 text-center bg-white/30 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                <p className="text-sm text-slate-500">Nema aktivnih zaduženja.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {checkouts.map((c) => {
                  const a = (c as any).assets;
                  return (
                    <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-3 bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 transition-colors">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100">{a?.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {a?.code} • Zadužio: <span className="font-semibold text-slate-700 dark:text-slate-300">{c.checked_out_to_name}</span>
                        </div>
                      </div>
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 self-start sm:self-auto border-0">Aktivno</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reserved Assets Card */}
          <div className="glass-card rounded-2xl p-5 border-amber-500/20 shadow-[0_4px_24px_rgba(245,158,11,0.05)] ring-1 ring-amber-500/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-amber-600 dark:text-amber-500 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Rezervisana oprema (Planirano)
                </h2>
                <p className="text-xs text-slate-500 mt-1">Oprema koju tek treba izdati</p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="flex-1 sm:flex-none bg-white dark:bg-slate-900"><Plus className="mr-2 h-4 w-4" />Dodaj</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Dodaj opremu</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center mb-2">
                        <Label>Pretraga i Skeniranje</Label>
                        <Button variant="ghost" size="sm" onClick={() => setScanMode(!scanMode)}>
                          {scanMode ? <Keyboard className="h-4 w-4 mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                          {scanMode ? "Unos teksta" : "Uključi kameru"}
                        </Button>
                      </div>
                      {scanMode ? (
                        <div className="bg-black rounded-lg overflow-hidden border">
                          <CameraScanner onScan={handleScan} />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <Input placeholder="Naziv ili šifra" value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                      )}
                      <div className="max-h-72 overflow-y-auto space-y-1">
                        {(searchResults ?? []).map((a) => (
                          <button key={a.id} className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-600 bg-white dark:bg-slate-900 text-left transition-colors"
                            onClick={() => { addAsset.mutate(a.id); }}>
                            <div>
                              <div className="font-bold text-sm text-slate-800 dark:text-slate-200">{a.name}</div>
                              <div className="text-xs text-slate-500">{a.code}</div>
                            </div>
                            <Badge variant="outline" className="bg-slate-50 dark:bg-slate-800">{a.status}</Badge>
                          </button>
                        ))}
                        {search.length > 1 && !searchResults?.length && (
                          <div className="p-4 text-sm text-slate-500 text-center">Nema rezultata</div>
                        )}
                      </div>
                    </div>
                    <DialogFooter><Button onClick={() => setOpen(false)}>Završi</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
                
                <Button 
                  variant="default" 
                  size="sm" 
                  className="flex-1 sm:flex-none bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
                  onClick={() => setWizardOpen(true)}
                  disabled={!items?.length}
                >
                  <PackageOpen className="mr-1.5 h-4 w-4" /> Izdaj sve
                </Button>
              </div>
            </div>

            {!items?.length ? (
              <div className="py-8 text-center bg-white/30 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                <p className="text-sm text-slate-500">Još uvek nema rezervisane opreme.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((it) => {
                  const a = (it as any).assets;
                  return (
                    <div key={it.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-3 bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-300 transition-colors">
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-100">{a?.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{a?.code}</div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto justify-between sm:justify-end">
                        <Badge variant="outline" className="bg-white dark:bg-slate-900">{it.status}</Badge>
                        <Button variant="ghost" size="icon" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 h-8 w-8 rounded-lg" onClick={() => removeAsset.mutate(it.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      <LocationMapDisplay address={event.location_text} />

      <CheckoutWizard 
        open={wizardOpen} 
        onOpenChange={setWizardOpen} 
        prefillEventId={eventId}
        prefillAssets={items?.map(it => {
          const a = (it as any).assets;
          return {
            id: a.id,
            code: a.code,
            name: a.name,
            serial_number: a.serial_number || null,
            status: a.status
          };
        })}
      />
    </PageContainer>
  );
}
