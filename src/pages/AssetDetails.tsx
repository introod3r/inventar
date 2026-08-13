import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { formatRSD, formatDate, formatDateTime } from "@/lib/format";
import { calculateBookValue } from "@/lib/calculations";
import { 
  Pencil, X, MapPin, User, QrCode, ArrowRightLeft, FileWarning, 
  History, Calendar, Wrench, FileText, Clock, ArrowRight, CheckCircle2, 
  FileDown 
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { CheckoutDialog } from "@/components/checkout/CheckoutDialog";
import { DamageReportDialog } from "@/components/assets/DamageReportDialog";
import { useAuth } from "@/features/auth/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateReversPdf, downloadBlob } from "@/lib/revers-pdf";
import { Badge } from "@/components/ui/badge";
import { PrintQrDialog } from "@/components/assets/PrintQrDialog";

type AssetStatus = Database["public"]["Enums"]["asset_status"];

const STATUS_CONFIG: Record<AssetStatus, { label: string; dot: string; text: string; bg: string }> = {
  available: { label: "DOSTUPNO", dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-950/80 border-emerald-500/40 text-emerald-300" },
  at_event: { label: "NA DOGAĐAJU", dot: "bg-blue-400", text: "text-blue-400", bg: "bg-blue-950/80 border-blue-500/40 text-blue-300" },
  in_service: { label: "NA SERVISU", dot: "bg-rose-400", text: "text-rose-400", bg: "bg-rose-950/80 border-rose-500/40 text-rose-300" },
  in_transit: { label: "U TRANSPORTU", dot: "bg-purple-400", text: "text-purple-400", bg: "bg-purple-950/80 border-purple-500/40 text-purple-300" },
  damaged: { label: "OŠTEĆENO", dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-950/80 border-amber-500/40 text-amber-300" },
  reserved: { label: "REZERVISANO", dot: "bg-sky-400", text: "text-sky-400", bg: "bg-sky-950/80 border-sky-500/40 text-sky-300" },
  returned: { label: "VRAĆENO", dot: "bg-teal-400", text: "text-teal-400", bg: "bg-teal-950/80 border-teal-500/40 text-teal-300" },
  written_off: { label: "RASHODOVANO", dot: "bg-slate-400", text: "text-slate-400", bg: "bg-slate-900/80 border-slate-700/40 text-slate-300" },
};

const SERVICE_TYPE_LABEL: Record<string, string> = {
  repair: "Popravka / Kvar",
  maintenance: "Redovni Servis",
  inspection: "Kontrolni Pregled",
};

const SERVICE_STATUS_LABEL: Record<string, { label: string; class: string }> = {
  reported: { label: "Prijavljeno", class: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  in_progress: { label: "U toku", class: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  completed: { label: "Završeno", class: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  cancelled: { label: "Otkazano", class: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
};

function assetPhotoUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const { data } = supabase.storage.from("asset-photos").getPublicUrl(path);
  return data.publicUrl;
}

export default function AssetDetails() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("manage_assets");

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const [newLocationId, setNewLocationId] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrPrintOpen, setQrPrintOpen] = useState(false);

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, locations:current_location_id(name), categories:category_id(name), asset_photos(storage_path, is_primary)")
        .eq("id", assetId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: locations } = useQuery({
    queryKey: ["locations-list"],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, name").order("name");
      return data ?? [];
    }
  });

  // 1. History of Events for this asset
  const { data: assetEvents } = useQuery({
    queryKey: ["asset-events-history", assetId],
    enabled: Boolean(assetId),
    queryFn: async () => (await supabase
      .from("event_assets")
      .select("*, events:event_id(id, name, start_at, end_at, status, location_text, clients:client_id(name))")
      .eq("asset_id", assetId!)
      .order("created_at", { ascending: false })).data ?? [],
  });

  // 2. History of Checkouts/Reversi for this asset
  const { data: assetCheckouts } = useQuery({
    queryKey: ["asset-checkouts-history", assetId],
    enabled: Boolean(assetId),
    queryFn: async () => (await supabase
      .from("checkouts")
      .select("*, events:event_id(id, name)")
      .eq("asset_id", assetId!)
      .order("checked_out_at", { ascending: false })).data ?? [],
  });

  // 3. Service Records for this asset
  const { data: assetServices } = useQuery({
    queryKey: ["asset-service-history", assetId],
    enabled: Boolean(assetId),
    queryFn: async () => (await supabase
      .from("service_records")
      .select("*")
      .eq("asset_id", assetId!)
      .order("reported_at", { ascending: false })).data ?? [],
  });

  // 4. Status History Audit Trail for this asset
  const { data: assetStatusHistory } = useQuery({
    queryKey: ["asset-status-history", assetId],
    enabled: Boolean(assetId),
    queryFn: async () => (await supabase
      .from("asset_status_history")
      .select("*")
      .eq("asset_id", assetId!)
      .order("changed_at", { ascending: false })).data ?? [],
  });

  const moveAsset = useMutation({
    mutationFn: async (locId: string) => {
      if (!locId) throw new Error("Izaberite lokaciju");
      const { error } = await supabase.from("assets").update({ current_location_id: locId }).eq("id", assetId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oprema premeštena");
      setNewLocationId("");
      qc.invalidateQueries({ queryKey: ["asset", assetId] });
      qc.invalidateQueries({ queryKey: ["asset-status-history", assetId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const handleDownloadPdf = async (c: any) => {
    try {
      const pdf = await generateReversPdf({
        checkoutId: c.id,
        assets: asset ? [{ code: asset.code, name: asset.name, serial_number: asset.serial_number }] : [],
        event: c.events ? { name: c.events.name } : null,
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
      downloadBlob(pdf, `revers-${asset?.code || 'oprema'}-${c.id.slice(0, 8)}.pdf`);
    } catch (err) {
      toast.error(`Greška pri pravljenju PDF-a: ${(err as Error).message}`);
    }
  };

  useEffect(() => {
    if (asset?.code) {
      QRCode.toDataURL(asset.qr_code || asset.code, { margin: 1, width: 120, color: { dark: "#151921", light: "#ffffff" } })
        .then((url: string) => setQrDataUrl(url))
        .catch((err: unknown) => console.error(err));
    }
  }, [asset?.code, asset?.qr_code]);

  if (isLoading) return <PageContainer><div className="p-8 text-slate-400 flex justify-center items-center h-64">Učitavanje podataka o opremi...</div></PageContainer>;
  if (!asset) return <PageContainer><div className="p-8 text-center text-slate-400">Oprema nije pronađena.</div></PageContainer>;

  const primaryPhoto = asset.asset_photos?.find((p: any) => p.is_primary)?.storage_path || asset.asset_photos?.[0]?.storage_path;
  const statusCfg = STATUS_CONFIG[asset.status as AssetStatus] ?? STATUS_CONFIG.available;
  const locName = (asset as any).locations?.name ?? "Nije raspoređeno";
  const catName = (asset as any).categories?.name ?? "Nema kategorije";

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Main Asset Card */}
        <div className="glass-card rounded-2xl overflow-hidden flex flex-col">
          
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800/60 bg-white/40 dark:bg-[#1A1F2A]/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 rounded-md bg-cyan-100 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 text-cyan-700 dark:text-cyan-400 font-mono text-sm font-semibold tracking-wider">
                {asset.code || "BEZ ŠIFRE"}
              </div>
              <div className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border ${statusCfg.bg}`}>
                <span className={`h-2 w-2 rounded-full ${statusCfg.dot} animate-pulse`} />
                {statusCfg.label}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 sm:mt-0">
              {canManage && (
                <Button variant="ghost" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" asChild>
                  <Link to={`/assets/${asset.id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" /> Izmeni
                  </Link>
                </Button>
              )}
              <Button variant="ghost" size="icon" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-full" onClick={() => navigate("/assets")}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Hero Section */}
          <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8">
            {/* Image */}
            <div className="w-full md:w-1/3 shrink-0 flex flex-col gap-4">
              <div className="aspect-square rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-inner">
                {primaryPhoto ? (
                  <img 
                    src={assetPhotoUrl(primaryPhoto)} 
                    alt={asset.name} 
                    className="w-full h-full object-contain transition-transform duration-500 hover:scale-105" 
                    onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=80"; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-700">Nema slike</div>
                )}
              </div>
              
              {/* Quick Actions (Revers, Prijava Kvara) */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs" onClick={() => setCheckoutOpen(true)}>
                  <ArrowRightLeft className="mr-2 h-3.5 w-3.5" /> Revers
                </Button>
                <Button variant="secondary" className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs" onClick={() => setDamageOpen(true)}>
                  <FileWarning className="mr-2 h-3.5 w-3.5" /> Prijavi Kvar
                </Button>
              </div>
            </div>

            {/* Details */}
            <div className="flex flex-col flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 leading-tight mb-2 gradient-heading">{asset.name}</h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-8 leading-relaxed">
                {asset.description || "Nema dodatnog opisa za ovu opremu."}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Serijski Broj */}
                <div className="bg-white/40 dark:bg-[#1A1F2A]/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800/60 rounded-xl p-4 flex flex-col justify-center">
                  <div className="text-xs text-slate-500 mb-1">Serijski Broj</div>
                  <div className="font-mono text-slate-800 dark:text-slate-200 font-medium">{asset.serial_number || "—"}</div>
                </div>
                
                {/* Kategorija */}
                <div className="bg-white/40 dark:bg-[#1A1F2A]/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800/60 rounded-xl p-4 flex flex-col justify-center">
                  <div className="text-xs text-slate-500 mb-1">Kategorija</div>
                  <div className="text-slate-800 dark:text-slate-200 font-medium">{catName}</div>
                </div>

                {/* Lokacija */}
                <div className="bg-white/40 dark:bg-[#1A1F2A]/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800/60 rounded-xl p-4 flex flex-col justify-center">
                  <div className="text-xs text-slate-500 mb-1">Trenutna Lokacija</div>
                  <div className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-medium">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{locName}</span>
                  </div>
                </div>

                {/* Odgovorno Lice */}
                <div className="bg-white/40 dark:bg-[#1A1F2A]/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800/60 rounded-xl p-4 flex flex-col justify-center">
                  <div className="text-xs text-slate-500 mb-1">Odgovorno Lice</div>
                  <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
                    <User className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">Nije dodeljeno</span>
                  </div>
                </div>
              </div>

              {/* Finansijski Podaci */}
              {(asset.purchase_value || asset.purchase_date || asset.depreciation_rate) && hasPermission("view_finance") && (
                <div className="mt-6">
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-800/60 pb-2 flex items-center gap-2">
                    Finansijski Podaci
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-white/40 dark:bg-[#1A1F2A]/50 backdrop-blur-sm border border-slate-200 dark:border-slate-800/40 rounded-xl p-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 mb-1">Datum nabavke</span>
                      <span className="text-slate-800 dark:text-slate-200 text-sm font-medium">{formatDate(asset.purchase_date) || "—"}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 mb-1">Nabavna vrednost</span>
                      <span className="text-slate-800 dark:text-slate-200 text-sm font-medium">{formatRSD(asset.purchase_value)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 mb-1">Amortizacija</span>
                      <span className="text-slate-800 dark:text-slate-200 text-sm font-medium">{asset.depreciation_rate ? `${asset.depreciation_rate}% god.` : "—"}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 mb-1">Knjigovodstvena vr.</span>
                      <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                        {formatRSD(calculateBookValue(asset.purchase_value, asset.purchase_date, asset.depreciation_rate))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Move Location Action */}
          <div className="px-6 md:px-8 pb-8">
            <div className="bg-white/40 dark:bg-[#1A1F2A]/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800/60 rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-300">
                <MapPin className="h-4 w-4 text-cyan-600 dark:text-cyan-500" />
                Premesti Opremu na Novu Lokaciju
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={newLocationId} onValueChange={setNewLocationId}>
                  <SelectTrigger className="flex-1 bg-slate-900 border-slate-700 text-sm">
                    <SelectValue placeholder="-- Izaberi novu lokaciju ili magacin --" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations?.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  className="bg-cyan-900/40 text-cyan-300 hover:bg-cyan-800/50 border border-cyan-800 shrink-0"
                  onClick={() => moveAsset.mutate(newLocationId)}
                  disabled={!newLocationId || moveAsset.isPending}
                >
                  Potvrdi Premeštaj
                </Button>
              </div>
            </div>
          </div>

          {/* Tehničke Specifikacije */}
          <div className="px-6 md:px-8 pb-8">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Ostali Detalji</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/40 dark:bg-[#1A1F2A]/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800/60 rounded-xl p-4 flex justify-between items-center">
                <span className="text-sm text-slate-500">Barkod:</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{asset.barcode || "Nema"}</span>
              </div>
              <div className="bg-white/40 dark:bg-[#1A1F2A]/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800/60 rounded-xl p-4 flex justify-between items-center">
                <span className="text-sm text-slate-500">Količina / Jedinica:</span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{asset.quantity} {asset.unit || "kom"}</span>
              </div>
            </div>
          </div>

          {/* Footer (QR Code) */}
          <div className="bg-slate-50/50 dark:bg-[#111318] border-t border-slate-200 dark:border-slate-800/60 p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 backdrop-blur-md">
            <div className="flex items-center gap-6">
              {qrDataUrl && (
                <div className="bg-white p-1 rounded-xl shrink-0 shadow-lg shadow-cyan-900/10">
                  <img src={qrDataUrl} alt={`QR Code for ${asset.code}`} className="w-20 h-20 md:w-24 md:h-24 object-contain" />
                </div>
              )}
              <div>
                <div className="text-xs font-bold text-cyan-600 dark:text-cyan-800 uppercase tracking-widest mb-2">Oznaka za skeniranje (QR / Barcode)</div>
                <div className="flex flex-col gap-1 font-mono text-slate-600 dark:text-slate-300">
                  <span className="font-bold text-slate-900 dark:text-white text-lg">QR-{asset.qr_code || asset.code}</span>
                  <span className="text-sm text-slate-500">Barcode: {asset.barcode || "N/A"}</span>
                </div>
              </div>
            </div>
            <Button 
              className="bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/20 shrink-0"
              onClick={() => setQrPrintOpen(true)}
            >
              <QrCode className="mr-2 h-4 w-4" /> Generiši Nalepnicu
            </Button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ISTORIJA I REGISTAR AKTIVNOSTI (POSVETLJEN DETALJAN REGISTAR NA DNU STRANICE) */}
        {/* ========================================================================= */}
        <div className="glass-card rounded-2xl p-6 md:p-8 border border-slate-200/80 dark:border-slate-800/80 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <History className="w-6 h-6 text-cyan-500" />
                Istorija i Registar Aktivnosti
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Kompletan registar događaja, reversa, servisa i promena statusa kroz vreme za komad <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">{asset.code}</span>
              </p>
            </div>
          </div>

          <Tabs defaultValue="events" className="space-y-6">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-1.5 rounded-2xl h-auto gap-1">
              <TabsTrigger value="events" className="rounded-xl py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 data-[state=active]:shadow-xs">
                <Calendar className="w-4 h-4 mr-2 text-purple-500" />
                Događaji ({assetEvents?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="checkouts" className="rounded-xl py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-xs">
                <FileText className="w-4 h-4 mr-2 text-blue-500" />
                Reversi ({assetCheckouts?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="services" className="rounded-xl py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-rose-600 dark:data-[state=active]:text-rose-400 data-[state=active]:shadow-xs">
                <Wrench className="w-4 h-4 mr-2 text-rose-500" />
                Servis ({assetServices?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="timeline" className="rounded-xl py-2.5 font-semibold text-xs sm:text-sm data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-xs">
                <Clock className="w-4 h-4 mr-2 text-emerald-500" />
                Statusi ({assetStatusHistory?.length ?? 0})
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: EVENTS */}
            <TabsContent value="events">
              {!assetEvents?.length ? (
                <div className="py-12 text-center bg-white/30 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <Calendar className="w-10 h-10 mx-auto text-slate-400 mb-2 opacity-50" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Ova oprema još uvek nije dodeljena nijednom događaju.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assetEvents.map((ea: any) => {
                    const ev = ea.events;
                    const client = ev?.clients;
                    return (
                      <div key={ea.id} className="p-4 bg-white/60 dark:bg-[#1A1F2A]/60 rounded-xl border border-slate-200 dark:border-slate-800/80 hover:border-purple-300 dark:hover:border-purple-900/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link to={`/events/${ev?.id}`} className="font-bold text-base text-slate-900 dark:text-slate-100 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                              {ev?.name || "Događaj"}
                            </Link>
                            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border-purple-200 dark:border-purple-800/40 text-[11px]">
                              {ea.status === 'picked' ? 'Preuzeto na binu' : (ea.status === 'returned' ? 'Vraćeno sa događaja' : 'Rezervisano')}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
                            {client?.name && (
                              <div>Klijent: <span className="font-semibold text-purple-600 dark:text-purple-400">{client.name}</span></div>
                            )}
                            {ev?.location_text && (
                              <div>Lokacija: <span className="font-medium text-slate-700 dark:text-slate-300">{ev.location_text}</span></div>
                            )}
                            <div>Period: <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(ev?.start_at)} — {formatDate(ev?.end_at)}</span></div>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="self-start sm:self-auto bg-white dark:bg-slate-900 text-xs" asChild>
                          <Link to={`/events/${ev?.id}`}>Detalji događaja <ArrowRight className="w-3.5 h-3.5 ml-1 text-purple-500" /></Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* TAB 2: CHECKOUTS / REVERSI */}
            <TabsContent value="checkouts">
              {!assetCheckouts?.length ? (
                <div className="py-12 text-center bg-white/30 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <FileText className="w-10 h-10 mx-auto text-slate-400 mb-2 opacity-50" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nema evidentiranih zaduženja ili izdatih reversa za ovu opremu.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assetCheckouts.map((c: any) => {
                    const isReturned = Boolean(c.returned_at);
                    return (
                      <div key={c.id} className="p-4 bg-white/60 dark:bg-[#1A1F2A]/60 rounded-xl border border-slate-200 dark:border-slate-800/80 hover:border-blue-300 dark:hover:border-blue-900/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100">Zadužio: <span className="text-blue-600 dark:text-blue-400">{c.checked_out_to_name || "Klijent"}</span></span>
                            {isReturned ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-0 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Vraćeno
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-0 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Trenutno zaduženo
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                            {c.events?.name && <div>Događaj: <span className="font-medium text-slate-800 dark:text-slate-200">{c.events.name}</span></div>}
                            <div>Izdato: <span className="font-medium text-slate-800 dark:text-slate-200">{formatDateTime(c.checked_out_at)}</span></div>
                            {isReturned && <div>Vraćeno: <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatDateTime(c.returned_at)}</span></div>}
                          </div>
                          {(c.condition_out || c.condition_in) && (
                            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 pt-1">
                              {c.condition_out && <div>Stanje pri izdavanju: <span className="italic font-medium text-slate-700 dark:text-slate-300">{c.condition_out}</span></div>}
                              {c.condition_in && <div>Stanje pri povratu: <span className="italic font-medium text-emerald-600 dark:text-emerald-400">{c.condition_in}</span></div>}
                            </div>
                          )}
                        </div>
                        <Button size="sm" variant="outline" className="bg-white dark:bg-slate-900 text-xs gap-1.5 self-start md:self-auto" onClick={() => handleDownloadPdf(c)}>
                          <FileDown className="w-3.5 h-3.5 text-blue-500" /> PDF Revers
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* TAB 3: SERVICE RECORDS */}
            <TabsContent value="services">
              {!assetServices?.length ? (
                <div className="py-12 text-center bg-white/30 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <Wrench className="w-10 h-10 mx-auto text-slate-400 mb-2 opacity-50" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Ova oprema nema zabeleženih servisnih naloga niti kvareva.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {assetServices.map((s: any) => {
                    const stConfig = SERVICE_STATUS_LABEL[s.status] ?? SERVICE_STATUS_LABEL.reported;
                    const typeLabel = SERVICE_TYPE_LABEL[s.type] ?? s.type;

                    return (
                      <div key={s.id} className="p-4 bg-white/60 dark:bg-[#1A1F2A]/60 rounded-xl border border-slate-200 dark:border-slate-800/80 hover:border-rose-300 dark:hover:border-rose-900/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100">{typeLabel}</span>
                            <Badge variant="outline" className={stConfig.class}>{stConfig.label}</Badge>
                          </div>
                          {s.description && <p className="text-xs text-slate-600 dark:text-slate-400">{s.description}</p>}
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <div>Prijavljeno: <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(s.reported_at)}</span></div>
                            {s.service_provider && <div>Serviser: <span className="font-semibold text-rose-600 dark:text-rose-400">{s.service_provider}</span></div>}
                            {s.completed_at && <div>Završeno: <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatDate(s.completed_at)}</span></div>}
                          </div>
                        </div>
                        {s.cost != null && (
                          <div className="text-right self-start md:self-auto bg-slate-100 dark:bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Trošak servisa</div>
                            <div className="text-sm font-bold text-rose-600 dark:text-rose-400">{formatRSD(s.cost)}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* TAB 4: AUDIT TRAIL TIMELINE */}
            <TabsContent value="timeline">
              {!assetStatusHistory?.length ? (
                <div className="py-12 text-center bg-white/30 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <Clock className="w-10 h-10 mx-auto text-slate-400 mb-2 opacity-50" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nema zapisa u istoriji promena statusa.</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                  {assetStatusHistory.map((h: any) => {
                    const fromLabel = STATUS_CONFIG[h.from_status as AssetStatus]?.label || h.from_status || "Inicijalno";
                    const toLabel = STATUS_CONFIG[h.to_status as AssetStatus]?.label || h.to_status;
                    const toColorClass = STATUS_CONFIG[h.to_status as AssetStatus]?.text || "text-emerald-400";

                    return (
                      <div key={h.id} className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white/60 dark:bg-[#1A1F2A]/60 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                        <div className="absolute -left-6 top-4.5 w-3 h-3 rounded-full bg-cyan-500 ring-4 ring-white dark:ring-slate-950" />
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-500 dark:text-slate-400">{fromLabel}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className={`font-bold ${toColorClass}`}>{toLabel}</span>
                          </div>
                          {h.note && <p className="text-xs text-slate-500 italic">{h.note}</p>}
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
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        asset={{ id: asset.id, code: asset.code, name: asset.name, serial_number: asset.serial_number }}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["asset", assetId] });
          qc.invalidateQueries({ queryKey: ["asset-checkouts-history", assetId] });
          qc.invalidateQueries({ queryKey: ["asset-status-history", assetId] });
        }}
      />
      <DamageReportDialog
        open={damageOpen}
        onOpenChange={setDamageOpen}
        asset={{ id: asset.id, code: asset.code, name: asset.name }}
      />
      <PrintQrDialog
        open={qrPrintOpen}
        onOpenChange={setQrPrintOpen}
        items={[{ code: asset.code, name: asset.name, serial: asset.serial_number }]}
        title={`Štampa QR Nalepnice za ${asset.code}`}
      />
    </PageContainer>
  );
}
