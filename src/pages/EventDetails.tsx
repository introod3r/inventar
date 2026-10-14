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
import { 
  ArrowLeft, Plus, Trash2, Pencil, FileDown, PackageOpen, Camera, Keyboard, 
  History, Clock, FileText, ArrowRight, CheckCircle2, Layers 
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";
import { useAuth } from "@/features/auth/use-auth";
import type { Database } from "@/integrations/supabase/types";
import { CheckoutWizard } from "@/components/checkout/CheckoutWizard";
import { exportCsv } from "@/lib/csv";
import { LocationInput } from "@/components/common/LocationInput";
import { LocationMapDisplay } from "@/components/common/LocationMapDisplay";
import { CameraScanner, type ScanResult } from "@/components/scanner/CameraScanner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateReversPdf, downloadBlob } from "@/lib/revers-pdf";

type EventStatus = Database["public"]["Enums"]["event_status"];
const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Skica", confirmed: "Potvrđen", in_progress: "U toku", completed: "Završen", cancelled: "Otkazan",
};

const ASSET_STATUS_MAP: Record<string, { label: string; class: string }> = {
  available: { label: "Dostupno", class: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  reserved: { label: "Rezervisano", class: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  at_event: { label: "Na događaju", class: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  in_transit: { label: "U transportu", class: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" },
  in_service: { label: "Na servisu", class: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  damaged: { label: "Oštećeno", class: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  written_off: { label: "Rashodovano", class: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  returned: { label: "Vraćeno", class: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20" },
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
      .select("*, assets:asset_id(id,code,name,status,serial_number)")
      .eq("event_id", eventId!)).data ?? [],
  });

  const { data: activeCheckouts } = useQuery({
    queryKey: ["event-checkouts", eventId!],
    queryFn: async () => (await supabase
      .from("checkouts")
      .select("*, assets:asset_id(id,code,name,status,serial_number)")
      .eq("event_id", eventId!)
      .is("returned_at", null)).data ?? [],
  });

  // Query ALL checkouts ever created for this event (Active + Returned)
  const { data: allCheckouts } = useQuery({
    queryKey: ["event-all-checkouts", eventId!],
    queryFn: async () => (await supabase
      .from("checkouts")
      .select("*, assets:asset_id(id,code,name,status,serial_number)")
      .eq("event_id", eventId!)
      .order("checked_out_at", { ascending: false })).data ?? [],
  });

  // Query Asset Status History log for assets linked to this event
  const assetIds = (items?.map((it: any) => it.asset_id) ?? []).filter(Boolean);

  const { data: statusHistory } = useQuery({
    queryKey: ["event-status-history", eventId!, assetIds],
    enabled: assetIds.length > 0,
    queryFn: async () => (await supabase
      .from("asset_status_history")
      .select("*, assets:asset_id(id,code,name)")
      .in("asset_id", assetIds)
      .order("changed_at", { ascending: false })).data ?? [],
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
        status: "reserved",
      });
      if (error) throw error;
      await supabase.from("assets").update({ status: "reserved" }).eq("id", assetId).in("status", ["available", "returned"]);
    },
    onSuccess: () => {
      toast.success("Oprema rezervisana");
      setSearch("");
      qc.invalidateQueries({ queryKey: ["event-assets", eventId!] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["event-status-history", eventId!] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleScan = async (r: ScanResult) => {
    const code = r.code.trim();
    
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
      const { data: ea } = await supabase.from("event_assets").select("asset_id").eq("id", id).maybeSingle();
      const { error } = await supabase.from("event_assets").delete().eq("id", id);
      if (error) throw error;
      if (ea?.asset_id) {
        await supabase.from("assets").update({ status: "available" }).eq("id", ea.asset_id).eq("status", "reserved");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-assets", eventId!] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["event-status-history", eventId!] });
    },
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

      if (form.status === "completed" || form.status === "cancelled") {
        const { data: reservedAssets } = await supabase
          .from("event_assets")
          .select("asset_id")
          .eq("event_id", eventId!)
          .eq("status", "reserved");

        if (reservedAssets && reservedAssets.length > 0) {
          const ids = reservedAssets.map(r => r.asset_id);
          await supabase.from("assets").update({ status: "available" }).in("id", ids).eq("status", "reserved");
          await supabase.from("event_assets").update({ status: form.status === "completed" ? "returned" : "reserved" }).eq("event_id", eventId!).eq("status", "reserved");
        }
      }
    },
    onSuccess: () => {
      toast.success("Sačuvano");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["event", eventId!] });
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteEvent = useMutation({
    mutationFn: async () => {
      const { data: activeC } = await supabase
        .from("checkouts")
        .select("id, asset_id")
        .eq("event_id", eventId!)
        .is("returned_at", null);
        
      const { data: eventAssets } = await supabase
        .from("event_assets")
        .select("asset_id")
        .eq("event_id", eventId!);

      const aIds = new Set<string>();
      const cIds: string[] = [];

      if (activeC) {
        for (const c of activeC) {
          aIds.add(c.asset_id);
          cIds.push(c.id);
        }
      }
      if (eventAssets) {
        for (const ea of eventAssets) {
          aIds.add(ea.asset_id);
        }
      }

      if (cIds.length > 0) {
        await supabase.from("checkouts").update({ returned_at: new Date().toISOString() }).in("id", cIds);
      }
      if (aIds.size > 0) {
        await supabase.from("assets").update({ status: "available" }).in("id", Array.from(aIds));
      }

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

  const handleDownloadPdf = async (c: any) => {
    try {
      const a = c.assets;
      const pdf = await generateReversPdf({
        checkoutId: c.id,
        assets: a ? [{ code: a.code, name: a.name, serial_number: a.serial_number }] : [],
        event: event ? { name: event.name } : null,
        checkedOutToName: c.checked_out_to_name,
        checkedOutAt: c.checked_out_at,
        expectedReturnAt: c.expected_return_at,
        returnedAt: c.returned_at,
        conditionOut: c.condition_out,
        conditionIn: c.condition_in,
        notes: c.notes,
        signatureOutPath: c.signature_path,
        signatureInPath: c.return_signature_path,
      });
      downloadBlob(pdf, `revers-${a?.code || 'event'}-${c.id.slice(0, 8)}.pdf`);
    } catch (err) {
      toast.error(`Greška pri pravljenju PDF-a: ${(err as Error).message}`);
    }
  };

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

      {/* Main Content Tabs */}
      <Tabs defaultValue="assets" className="space-y-6">
        <TabsList className="grid grid-cols-1 sm:grid-cols-3 w-full bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl h-auto gap-1">
          <TabsTrigger value="assets" className="rounded-xl py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
            <Layers className="w-4 h-4 mr-2 text-amber-500" />
            Oprema događaja ({items?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="reversi-history" className="rounded-xl py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
            <FileText className="w-4 h-4 mr-2 text-blue-500" />
            Istorija Reversa ({allCheckouts?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="status-history" className="rounded-xl py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm">
            <History className="w-4 h-4 mr-2 text-purple-500" />
            Istorija Statusa ({statusHistory?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Equipment & Active Checkouts */}
        <TabsContent value="assets" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Active Checkouts Card */}
            <div className="glass-card rounded-2xl p-5 border-blue-500/20 shadow-[0_4px_24px_rgba(59,130,246,0.05)] ring-1 ring-blue-500/10">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  Izdata oprema (Na događaju)
                </h2>
                <p className="text-xs text-slate-500 mt-1">Oprema koja je trenutno fizički zadužena i izdata</p>
              </div>
              
              {!activeCheckouts?.length ? (
                <div className="py-8 text-center bg-white/30 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <p className="text-sm text-slate-500">Nema aktivnih zaduženja.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeCheckouts.map((c) => {
                    const a = (c as any).assets;
                    return (
                      <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-3 bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 transition-colors">
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100">{a?.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] font-semibold">{a?.code}</span> • Zadužio: <span className="font-semibold text-slate-700 dark:text-slate-300">{c.checked_out_to_name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-0">Aktivno</Badge>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownloadPdf(c)} title="Preuzmi PDF Revers">
                            <FileDown className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                          </Button>
                        </div>
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
                  <p className="text-xs text-slate-500 mt-1">Oprema spremna za izdavanje</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
                  <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="flex-1 sm:flex-none bg-white dark:bg-slate-900"><Plus className="mr-2 h-4 w-4" />Dodaj</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Dodaj opremu na događaj</DialogTitle></DialogHeader>
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
        </TabsContent>

        {/* Tab 2: All Reversi (Checkouts History) */}
        <TabsContent value="reversi-history">
          <div className="glass-card rounded-2xl p-6 border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  Istorija Zaduženja i Reversa
                </h2>
                <p className="text-xs text-slate-500 mt-1">Kompletna evidencija svih reversa kreiranih za ovaj događaj</p>
              </div>
            </div>

            {!allCheckouts?.length ? (
              <div className="py-12 text-center bg-white/30 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                <FileText className="w-10 h-10 mx-auto text-slate-400 mb-2 opacity-50" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nema zabeleženih reversa za ovaj događaj.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {allCheckouts.map((c) => {
                  const a = (c as any).assets;
                  const isReturned = Boolean(c.returned_at);
                  return (
                    <div key={c.id} className="p-4 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{a?.name}</span>
                          <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400 font-semibold">{a?.code}</span>
                          {isReturned ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-0 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Vraćeno
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-0 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Na događaju
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <div>Preuzeo: <span className="font-semibold text-slate-800 dark:text-slate-200">{c.checked_out_to_name || 'Klijent'}</span></div>
                          <div>Izdato: <span className="font-medium">{formatDateTime(c.checked_out_at)}</span></div>
                          {isReturned && (
                            <div>Razduženo: <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatDateTime(c.returned_at)}</span></div>
                          )}
                        </div>
                        {(c.condition_out || c.condition_in) && (
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 pt-1">
                            {c.condition_out && <div>Stanje pri izdavanju: <span className="italic">{c.condition_out}</span></div>}
                            {c.condition_in && <div>Stanje pri povratu: <span className="italic font-medium">{c.condition_in}</span></div>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <Button size="sm" variant="outline" className="bg-white dark:bg-slate-900 text-xs gap-1.5" onClick={() => handleDownloadPdf(c)}>
                          <FileDown className="w-3.5 h-3.5 text-blue-500" /> PDF Revers
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Asset Status Change History Timeline */}
        <TabsContent value="status-history">
          <div className="glass-card rounded-2xl p-6 border-slate-200/60 dark:border-slate-800/60">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <History className="w-5 h-5 text-purple-500" />
                  Hronologija Statusa Opreme
                </h2>
                <p className="text-xs text-slate-500 mt-1">Istorija svih promena statusa u bazi za opremu sa ovog događaja</p>
              </div>
            </div>

            {!statusHistory?.length ? (
              <div className="py-12 text-center bg-white/30 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                <History className="w-10 h-10 mx-auto text-slate-400 mb-2 opacity-50" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nema obeleženih promena statusa u bazi za dodatu opremu.</p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {statusHistory.map((h) => {
                  const a = (h as any).assets;
                  const fromInfo = ASSET_STATUS_MAP[h.from_status ?? ""] ?? { label: h.from_status || "Početno", class: "bg-slate-100 text-slate-700" };
                  const toInfo = ASSET_STATUS_MAP[h.to_status] ?? { label: h.to_status, class: "bg-slate-100 text-slate-700" };

                  return (
                    <div key={h.id} className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="absolute -left-6 top-5 w-3 h-3 rounded-full bg-purple-500 ring-4 ring-white dark:ring-slate-950" />
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{a?.name}</span>
                          <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">{a?.code}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs pt-1">
                          <Badge variant="outline" className={`${fromInfo.class} text-[11px]`}>{fromInfo.label}</Badge>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <Badge variant="outline" className={`${toInfo.class} text-[11px]`}>{toInfo.label}</Badge>
                        </div>
                        {h.note && <p className="text-xs text-slate-500 italic mt-1">{h.note}</p>}
                      </div>

                      <div className="text-xs text-slate-400 flex items-center gap-1 self-start sm:self-center">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDateTime(h.changed_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

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
