import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { formatRSD, formatDate } from "@/lib/format";
import { calculateBookValue } from "@/lib/calculations";
import { Pencil, X, MapPin, User, QrCode, ArrowRightLeft, FileWarning } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { CheckoutDialog } from "@/components/checkout/CheckoutDialog";
import { DamageReportDialog } from "@/components/assets/DamageReportDialog";
import { useAuth } from "@/features/auth/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { printQrSheet } from "@/lib/qr-print";

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

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, locations:current_location_id(name), categories:category_id(name), asset_photos(storage_path, is_primary)")
        .eq("id", assetId)
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

  const moveAsset = useMutation({
    mutationFn: async (locId: string) => {
      if (!locId) throw new Error("Izaberite lokaciju");
      const { error } = await supabase.from("assets").update({ current_location_id: locId }).eq("id", assetId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oprema premeštena");
      setNewLocationId("");
      qc.invalidateQueries({ queryKey: ["asset", assetId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  useEffect(() => {
    if (asset?.code) {
      QRCode.toDataURL(asset.qr_code || asset.code, { margin: 1, width: 120, color: { dark: "#151921", light: "#ffffff" } })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error(err));
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
            onClick={() => printQrSheet([{ code: asset.code, name: asset.name, serial: asset.serial_number }])}
          >
            <QrCode className="mr-2 h-4 w-4" /> Generiši Nalepnicu
          </Button>
        </div>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        asset={{ id: asset.id, code: asset.code, name: asset.name, serial_number: asset.serial_number }}
        onDone={() => qc.invalidateQueries({ queryKey: ["asset", assetId] })}
      />
      <DamageReportDialog
        open={damageOpen}
        onOpenChange={setDamageOpen}
        asset={{ id: asset.id, code: asset.code, name: asset.name }}
      />
    </PageContainer>
  );
}
