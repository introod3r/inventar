import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wrench, AlertTriangle, Upload, FileSpreadsheet, CheckCircle2, Search, Filter, FileWarning } from "lucide-react";
import { formatDate, formatRSD } from "@/lib/format";
import { toast } from "sonner";
import { DamageReportsList } from "@/components/assets/DamageReportsList";
import { exportCsv } from "@/lib/csv";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ServiceRow = {
  id: string;
  asset_id: string;
  type: "repair" | "maintenance" | "inspection";
  status: "reported" | "in_progress" | "completed" | "cancelled";
  description: string | null;
  service_provider: string | null;
  cost: number | null;
  reported_at: string;
  reported_by: string | null;
  assets: { id: string; code: string; name: string } | null;
  signed_urls?: string[];
};

type DamagedAssetRow = {
  id: string;
  code: string;
  name: string;
  serial_number: string | null;
  status: string;
  damage_reports: Array<{
    id: string;
    description: string | null;
    severity: string | null;
    reported_at: string;
    photo_paths?: string[];
    signed_urls?: string[];
  }> | null;
};

const PRIORITY_MAP: Record<string, { label: string; bg: string; text: string }> = {
  repair: { label: "PRIORITET: VISOKA", bg: "bg-rose-950/60 border-rose-800/50", text: "text-rose-400" },
  maintenance: { label: "PRIORITET: SREDNJA", bg: "bg-amber-950/60 border-amber-800/50", text: "text-amber-400" },
  inspection: { label: "PRIORITET: NISKA", bg: "bg-blue-950/60 border-blue-800/50", text: "text-blue-400" },
};

const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  reported: { label: "PRIJAVLJENO", bg: "bg-slate-800/80 border-slate-700/60", text: "text-slate-300" },
  in_progress: { label: "U_SERVISU", bg: "bg-cyan-950/80 border-cyan-800/60", text: "text-cyan-300" },
  completed: { label: "ZAVRŠENO", bg: "bg-emerald-950/80 border-emerald-800/60", text: "text-emerald-300" },
  cancelled: { label: "OTKAZANO", bg: "bg-rose-950/80 border-rose-800/60", text: "text-rose-300" },
};

export default function ServicePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ asset_id: "", type: "repair", description: "", service_provider: "", cost: "" });
  
  // Selected damaged asset for sending to service dialog
  const [selectedDamagedAsset, setSelectedDamagedAsset] = useState<DamagedAssetRow | null>(null);

  // 1. Fetch Service Records
  const { data: serviceRecords, isLoading } = useQuery({
    queryKey: ["service-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_records")
        .select("*, assets:asset_id(id,code,name), damage_reports(photo_paths)")
        .order("reported_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      
      const allPaths = (data ?? []).flatMap(r => (r.damage_reports ?? []).flatMap((d: any) => d.photo_paths || [])) as string[];
      const signedUrlsMap: Record<string, string> = {};
      
      if (allPaths.length > 0) {
        const { data: urlsData } = await supabase.storage.from("damage-photos").createSignedUrls(allPaths, 3600);
        urlsData?.forEach(u => {
          if (u.path && u.signedUrl) signedUrlsMap[u.path] = u.signedUrl;
        });
      }
      
      return (data ?? []).map(r => {
        const photoPaths = (r.damage_reports ?? []).flatMap((d: any) => d.photo_paths || []) as string[];
        return {
          ...r,
          signed_urls: photoPaths.map(p => signedUrlsMap[p]).filter(Boolean)
        };
      }) as unknown as ServiceRow[];
    },
  });

  // 2. Fetch Damaged Assets (Status: DAMAGED)
  const { data: damagedAssets, isLoading: damagedLoading } = useQuery({
    queryKey: ["damaged-assets"],
    queryFn: async () => {
      // Step 1: Fetch all assets with status = 'damaged'
      const { data: assetsData, error: assetsErr } = await supabase
        .from("assets")
        .select("id, code, name, serial_number, status")
        .eq("status", "damaged")
        .order("name");

      if (assetsErr) {
        console.error("Error fetching damaged assets:", assetsErr);
        throw assetsErr;
      }

      if (!assetsData || assetsData.length === 0) return [];

      // Step 2: Fetch damage reports for these asset IDs
      const assetIds = assetsData.map((a) => a.id);
      const { data: reportsData } = await supabase
        .from("damage_reports")
        .select("id, asset_id, description, severity, reported_at, photo_paths")
        .in("asset_id", assetIds)
        .order("reported_at", { ascending: false });

      const allPaths = reportsData?.flatMap(r => r.photo_paths || []) || [];
      const signedUrlsMap: Record<string, string> = {};
      
      if (allPaths.length > 0) {
        const { data: urlsData } = await supabase.storage.from("damage-photos").createSignedUrls(allPaths, 3600);
        urlsData?.forEach(u => {
          if (u.path && u.signedUrl) signedUrlsMap[u.path] = u.signedUrl;
        });
      }

      return assetsData.map((a) => ({
        ...a,
        damage_reports: (reportsData?.filter((r) => r.asset_id === a.id) ?? []).map(r => ({
          id: r.id,
          description: r.description,
          severity: r.severity,
          reported_at: r.reported_at,
          photo_paths: r.photo_paths || [],
          signed_urls: (r.photo_paths || []).map(p => signedUrlsMap[p]).filter(Boolean)
        })),
      })) as DamagedAssetRow[];
    },
  });

  // 3. Fetch All Assets for Select Dropdown
  const { data: assets } = useQuery({
    queryKey: ["assets-for-service"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("id,code,name,status").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Action: Create Service Record
  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("service_records").insert({
        asset_id: form.asset_id,
        type: form.type as "repair" | "maintenance" | "inspection",
        status: "reported",
        description: form.description || null,
        service_provider: form.service_provider || null,
        cost: form.cost ? Number(form.cost) : null,
        reported_by: user?.id ?? null,
      });
      if (error) throw error;
      
      await supabase.from("assets").update({ status: "in_service" }).eq("id", form.asset_id);
    },
    onSuccess: () => {
      toast.success("Oprema uspešno poslata na servis");
      setOpen(false);
      setSelectedDamagedAsset(null);
      setForm({ asset_id: "", type: "repair", description: "", service_provider: "", cost: "" });
      qc.invalidateQueries({ queryKey: ["service-records"] });
      qc.invalidateQueries({ queryKey: ["damaged-assets"] });
      qc.invalidateQueries({ queryKey: ["assets-for-service"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Action: Complete Service
  const complete = useMutation({
    mutationFn: async ({ id, asset_id }: { id: string; asset_id: string }) => {
      const { error } = await supabase.from("service_records").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      await supabase.from("assets").update({ status: "available" }).eq("id", asset_id);
    },
    onSuccess: () => {
      toast.success("Servis je označen kao završen. Oprema je ponovo dostupna.");
      qc.invalidateQueries({ queryKey: ["service-records"] });
      qc.invalidateQueries({ queryKey: ["damaged-assets"] });
      qc.invalidateQueries({ queryKey: ["assets-for-service"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Action: Send to Write-Off (Otpiši opremu)
  const writeOff = useMutation({
    mutationFn: async (assetId: string) => {
      const { error } = await supabase.from("assets").update({ status: "written_off" }).eq("id", assetId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oprema je uspešno poslata na komisiju za otpis (Rashodovano)");
      qc.invalidateQueries({ queryKey: ["damaged-assets"] });
      qc.invalidateQueries({ queryKey: ["assets-for-service"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Action: Mark Asset Available (Vrati u upotrebu bez servisa)
  const markAvailable = useMutation({
    mutationFn: async (assetId: string) => {
      const { error } = await supabase.from("assets").update({ status: "available" }).eq("id", assetId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oprema je vraćena u upotrebu (Dostupno)");
      qc.invalidateQueries({ queryKey: ["damaged-assets"] });
      qc.invalidateQueries({ queryKey: ["assets-for-service"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const filteredRecords = useMemo(() => {
    if (!serviceRecords) return [];
    return serviceRecords.filter(r => {
      const matchesSearch = !q || 
        r.assets?.name.toLowerCase().includes(q.toLowerCase()) || 
        r.assets?.code.toLowerCase().includes(q.toLowerCase()) ||
        r.description?.toLowerCase().includes(q.toLowerCase()) ||
        r.service_provider?.toLowerCase().includes(q.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [serviceRecords, q, statusFilter]);

  const onExportCsv = () => {
    if (!serviceRecords?.length) {
      toast.error("Nema servisnih zapisa za izvoz");
      return;
    }
    exportCsv(`servis-evidencija-${new Date().toISOString().slice(0, 10)}`, serviceRecords, [
      { header: "Šifra Opreme", value: (r) => r.assets?.code ?? "" },
      { header: "Naziv Opreme", value: (r) => r.assets?.name ?? "" },
      { header: "Tip", value: (r) => r.type },
      { header: "Status", value: (r) => r.status },
      { header: "Prijavljeno", value: (r) => formatDate(r.reported_at) },
      { header: "Opis Kvara", value: (r) => r.description ?? "" },
      { header: "Serviser", value: (r) => r.service_provider ?? "" },
      { header: "Trošak", value: (r) => r.cost ? `${r.cost} RSD` : "" },
    ]);
    toast.success(`Izvezeno ${serviceRecords.length} servisnih zapisa`);
  };

  const handleOpenSendToService = (damagedAsset: DamagedAssetRow) => {
    const latestReport = damagedAsset.damage_reports?.[0];
    setForm({
      asset_id: damagedAsset.id,
      type: "repair",
      description: latestReport?.description || "Procena oštećenja i slanje na servis.",
      service_provider: "",
      cost: "",
    });
    setSelectedDamagedAsset(damagedAsset);
    setOpen(true);
  };

  return (
    <PageContainer>
        
        {/* Header Block */}
        <div className="glass-card rounded-2xl p-6 md:p-8 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mesh-bg">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">TEHNIČKA PODRŠKA</span>
              <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-400 text-[10px] font-mono font-bold tracking-wider uppercase">
                SERVICE LOG
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight gradient-heading">
              Servis, Kvarovi i Održavanje
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Evidencija oštećenja, troškovi popravki i istorija održavanja opreme
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto shrink-0">
            <Button variant="outline" className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm backdrop-blur-sm">
              <Upload className="mr-2 h-4 w-4" /> Uvoz
            </Button>
            <Button variant="outline" className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm backdrop-blur-sm" onClick={onExportCsv}>
              <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" /> CSV Izvoz
            </Button>
            
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-white hover:bg-slate-100 text-slate-950 font-bold shadow-lg shadow-white/10 text-sm px-4">
                  <AlertTriangle className="mr-2 h-4 w-4 text-rose-600 fill-rose-600/20" /> PRIJAVI KVAR
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#151921] border-slate-800 text-slate-200">
                <DialogHeader>
                  <DialogTitle className="text-slate-100 flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-rose-500" /> 
                    {selectedDamagedAsset ? `Slanje na Servis: ${selectedDamagedAsset.name}` : "Prijava Kvara ili Servisa"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Oprema *</Label>
                    <Select 
                      value={form.asset_id} 
                      onValueChange={(v) => setForm({ ...form, asset_id: v })}
                      disabled={!!selectedDamagedAsset}
                    >
                      <SelectTrigger className="bg-slate-900/80 border-slate-800 text-slate-200">
                        <SelectValue placeholder="Izaberi opremu sa spiska..." />
                      </SelectTrigger>
                      <SelectContent>
                        {assets?.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} <span className="text-slate-500">({a.code})</span>
                            {a.status === "damaged" && " [OŠTEĆENO]"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Tip / Prioritet</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger className="bg-slate-900/80 border-slate-800 text-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="repair">Popravka (Visoki prioritet)</SelectItem>
                        <SelectItem value="maintenance">Održavanje (Srednji prioritet)</SelectItem>
                        <SelectItem value="inspection">Inspekcija (Niski prioritet)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300">Opis Kvara / Problema</Label>
                    <Textarea 
                      rows={3} 
                      placeholder="Detaljan opis uočenog kvara ili potrebnih radova..." 
                      value={form.description} 
                      onChange={(e) => setForm({ ...form, description: e.target.value })} 
                      className="bg-slate-900/80 border-slate-800 text-slate-200"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-slate-300">Serviser / Firma</Label>
                      <Input 
                        placeholder="npr. Dragan Stanković" 
                        value={form.service_provider} 
                        onChange={(e) => setForm({ ...form, service_provider: e.target.value })} 
                        className="bg-slate-900/80 border-slate-800 text-slate-200"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-slate-300">Procena Troškova (RSD / €)</Label>
                      <Input 
                        type="number" 
                        placeholder="npr. 450" 
                        value={form.cost} 
                        onChange={(e) => setForm({ ...form, cost: e.target.value })} 
                        className="bg-slate-900/80 border-slate-800 text-slate-200"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter className="mt-4">
                  <Button 
                    onClick={() => create.mutate()} 
                    disabled={!form.asset_id || create.isPending}
                    className="bg-rose-600 hover:bg-rose-700 text-white w-full"
                  >
                    Potvrdi i Prijavi na Servis
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tabs & Main Content */}
        <Tabs defaultValue={damagedAssets && damagedAssets.length > 0 ? "damaged-assets" : "service-records"} className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <TabsList className="bg-slate-900/80 border border-slate-800 p-1 flex-wrap">
              <TabsTrigger value="damaged-assets" className="data-[state=active]:bg-amber-950/80 data-[state=active]:text-amber-300 relative">
                Oštećena Oprema 
                {damagedAssets && damagedAssets.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold text-xs animate-pulse">
                    {damagedAssets.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="service-records" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white">
                Evidencija Servisa
              </TabsTrigger>
              <TabsTrigger value="damage-reports" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white">
                Prijave Oštećenja
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Pretraži kvarove, servise..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9 bg-slate-900/80 border-slate-800 text-slate-200 text-sm h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 bg-slate-900/80 border-slate-800 text-slate-300 text-xs h-9">
                  <Filter className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                  <SelectValue placeholder="Svi Statusi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Svi Statusi</SelectItem>
                  <SelectItem value="reported">Prijavljeno</SelectItem>
                  <SelectItem value="in_progress">U Servisu</SelectItem>
                  <SelectItem value="completed">Završeno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* TAB 1: Oštećena Oprema za Procenu */}
          <TabsContent value="damaged-assets" className="space-y-4">
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0">
                  <AlertTriangle className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-amber-200 text-base">Procena i Odluka o Oštećenoj Opremi</h3>
                  <p className="text-xs text-amber-300/70 mt-0.5">
                    Za svaki oštećeni komad opreme utvrdite stanje i odaberite: slanje na servis, komisiju za otpis (rashod), ili povratak u upotrebu.
                  </p>
                </div>
              </div>
            </div>

            {damagedLoading ? (
              <div className="py-16 text-center text-slate-500">Učitavanje oštećene opreme...</div>
            ) : !damagedAssets?.length ? (
              <div className="py-16 text-center bg-[#151921] border border-slate-800/80 rounded-2xl">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-3 opacity-80" />
                <h3 className="text-lg font-medium text-slate-200">Trenutno nema oštećene opreme</h3>
                <p className="text-sm text-slate-400 mt-1">Sva oprema u magacinu je u ispravnom stanju.</p>
              </div>
            ) : (
              damagedAssets.map((asset) => {
                const latestReport = asset.damage_reports?.[0];
                return (
                  <div key={asset.id} className="bg-[#151921] border border-amber-900/40 rounded-2xl p-5 md:p-6 shadow-xl text-slate-300 flex flex-col justify-between transition-all hover:border-amber-700/60">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-100 text-lg tracking-tight">
                          {asset.name}
                        </h3>
                        <span className="font-mono text-cyan-400 font-bold text-sm">
                          ({asset.code})
                        </span>
                        {asset.serial_number && (
                          <span className="text-xs text-slate-500">
                            SN: {asset.serial_number}
                          </span>
                        )}
                      </div>

                      <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border bg-amber-950/80 border-amber-500/50 text-amber-300 flex items-center gap-2 w-fit">
                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                        OŠTEĆENO
                      </span>
                    </div>

                    <div className="bg-[#1A1F2A]/80 border border-slate-800/80 rounded-xl p-4 my-3 text-sm text-slate-300 leading-relaxed">
                      <span className="font-semibold text-amber-400">Prijavljeno Oštećenje: </span>
                      {latestReport?.description || "Prijava oštećenja bez dodatnog tekstualnog opisa."}
                      {latestReport?.reported_at && (
                        <div className="text-xs text-slate-500 mt-2">
                          Prijavljeno: {formatDate(latestReport.reported_at)}
                        </div>
                      )}
                      
                      {latestReport?.signed_urls && latestReport.signed_urls.length > 0 && (
                        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-800/50">
                          {latestReport.signed_urls.map((url, idx) => (
                            <a key={idx} href={url} target="_blank" rel="noreferrer" className="block relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border border-slate-700 hover:border-amber-500/50 hover:shadow-lg transition-all group">
                              <img src={url} alt={`Oštećenje ${idx + 1}`} className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Search className="h-4 w-4 text-white" />
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Decision Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/60">
                      <div className="text-xs text-slate-400">
                        Potrebna odluka servisa / komisije
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button 
                          size="sm" 
                          className="bg-cyan-600 hover:bg-cyan-700 text-white font-medium text-xs h-9 px-3"
                          onClick={() => handleOpenSendToService(asset)}
                        >
                          <Wrench className="mr-1.5 h-3.5 w-3.5" /> Pošalji na Servis
                        </Button>

                        <Button 
                          size="sm" 
                          variant="outline"
                          className="border-rose-900/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 font-medium text-xs h-9 px-3"
                          onClick={() => {
                            if (confirm(`Da li ste sigurni da želite da pošaljete opremu "${asset.name}" na komisiju za otpis (Rashodovano)?`)) {
                              writeOff.mutate(asset.id);
                            }
                          }}
                        >
                          <FileWarning className="mr-1.5 h-3.5 w-3.5 text-rose-400" /> Rashoduj (Otpiši)
                        </Button>

                        <Button 
                          size="sm" 
                          variant="outline"
                          className="border-slate-700 text-slate-300 hover:bg-slate-800 font-medium text-xs h-9 px-3"
                          onClick={() => markAvailable.mutate(asset.id)}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> Vrati u Upotrebu
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* TAB 2: Evidencija Servisa */}
          <TabsContent value="service-records" className="space-y-4">
            {isLoading ? (
              <div className="py-16 text-center text-slate-500">Učitavanje servisnih zapisa...</div>
            ) : !filteredRecords.length ? (
              <div className="py-16 text-center bg-[#151921] border border-slate-800/80 rounded-2xl">
                <Wrench className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                <h3 className="text-lg font-medium text-slate-200">Nema servisnih zapisa</h3>
                <p className="text-sm text-slate-400 mt-1">Trenutno nema prijavljenih kvarova ili servisa.</p>
              </div>
            ) : (
              filteredRecords.map((r) => {
                const a = r.assets;
                const priority = PRIORITY_MAP[r.type] ?? PRIORITY_MAP.repair;
                const status = STATUS_MAP[r.status] ?? STATUS_MAP.reported;

                return (
                  <div key={r.id} className="bg-[#151921] border border-slate-800/80 rounded-2xl p-5 md:p-6 shadow-xl text-slate-300 flex flex-col justify-between transition-all hover:border-slate-700/80">
                    
                    {/* Header line */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-100 text-lg tracking-tight">
                          {a?.name || "Nepoznata oprema"}
                        </h3>
                        {a?.code && (
                          <span className="font-mono text-cyan-400 font-bold text-sm">
                            ({a.code})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${priority.bg} ${priority.text}`}>
                          {priority.label}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </div>
                    </div>

                    {/* Subline */}
                    <div className="text-xs text-slate-400 mb-3">
                      Prijavio: <span className="text-slate-300">Operater</span> • Datum: <span className="text-slate-300">{formatDate(r.reported_at)}</span>
                    </div>

                    {/* Problem Description Box */}
                    <div className="bg-[#1A1F2A]/80 border border-slate-800/80 rounded-xl p-4 my-1 text-sm text-slate-300 leading-relaxed">
                      <span className="font-semibold text-slate-200">Opis Kvara / Problema: </span>
                      {r.description || "Nema detaljnog opisa kvara."}
                      
                      {r.signed_urls && r.signed_urls.length > 0 && (
                        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-800/50">
                          {r.signed_urls.map((url, idx) => (
                            <a key={idx} href={url} target="_blank" rel="noreferrer" className="block relative w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border border-slate-700 hover:border-cyan-500/50 hover:shadow-lg transition-all group">
                              <img src={url} alt={`Oštećenje ${idx + 1}`} className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Search className="h-4 w-4 text-white" />
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-2 border-t border-slate-800/40 text-xs">
                      <div className="text-slate-400">
                        Serviser: <span className="text-slate-200 font-medium">{r.service_provider || "Dodeljen serviseru"}</span>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-slate-400">
                          Procena Troškova: <span className="text-slate-100 font-bold text-sm">
                            {r.cost != null ? (r.cost < 10000 ? `€${r.cost}` : formatRSD(r.cost)) : "N/A"}
                          </span>
                        </div>

                        {r.status !== "completed" && a && (
                          <Button 
                            size="sm" 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-8 px-3"
                            onClick={() => complete.mutate({ id: r.id, asset_id: a.id })}
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Završi Servis
                          </Button>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </TabsContent>

          {/* TAB 3: Prijave Oštećenja */}
          <TabsContent value="damage-reports">
            <DamageReportsList />
          </TabsContent>
        </Tabs>

    </PageContainer>
  );
}
