import { Link, useNavigate } from "react-router-dom";
import { useCallback, useState, useEffect, useRef } from "react";
import { CameraScanner, type ScanResult } from "@/components/scanner/CameraScanner";
import { QuickStatusModal } from "@/components/scanner/QuickStatusModal";
import { DamageReportDialog } from "@/components/assets/DamageReportDialog";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  Loader2,
  ScanLine,
  ChevronRight,
  AlertCircle,
  ShoppingCart,
  Plus,
  Trash2,
  X,
  Volume2,
  VolumeX,
  CheckCircle2,
  History,
  Download,
  RefreshCw,
  FileText,
  Package,
  MapPin,
  Tag,
  ArrowRight,
  Sparkles,
  Undo2,
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { AssetStatusBadge } from "@/components/common/StatusBadge";
import { toast } from "sonner";
import { useScanCart } from "@/features/cart/use-scan-cart";
import { BulkCheckoutDialog } from "@/components/checkout/BulkCheckoutDialog";
import { playScanSuccess, playScanError } from "@/lib/sound";
import { exportCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";

type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

type ScannedAsset = AssetRow & {
  categories?: { id: string; name: string } | null;
  locations?: { id: string; name: string } | null;
  asset_photos?: { storage_path: string; is_primary: boolean }[];
};

type ActiveCheckoutInfo = {
  id: string;
  asset_id: string;
  event_id: string | null;
  checked_out_to_name: string | null;
  checked_out_at: string;
  expected_return_at: string | null;
  condition_out: string | null;
  notes: string | null;
  events?: { id: string; name: string; clients?: { id: string; name: string } | null } | null;
};

type ScannedReversItem = {
  checkoutId: string;
  assetId: string;
  code: string;
  name: string;
  serialNumber?: string | null;
  returnedAt?: string | null;
};

type ScannedReversGroup = {
  reversCode: string;
  eventName?: string;
  clientName?: string;
  checkedOutTo?: string;
  checkedOutAt?: string;
  items: ScannedReversItem[];
};

type ScanHistoryItem = {
  id: string;
  code: string;
  timestamp: Date;
  status: "found" | "not_found" | "revers" | "returned";
  asset?: ScannedAsset;
  note?: string;
};

export default function ScanPage() {
  const navigate = useNavigate();
  const { items, add, remove, clear } = useScanCart();

  // Scan Modes: 'batch' (Outbound dispatch / to cart) | 'return' (Inbound check-in) | 'single' (Inspect item)
  const [mode, setMode] = useState<"batch" | "return" | "single">("batch");
  const [autoReturnOk, setAutoReturnOk] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<"result" | "cart" | "history">("result");

  // State for scans
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentAsset, setCurrentAsset] = useState<ScannedAsset | null>(null);
  const [activeCheckout, setActiveCheckout] = useState<ActiveCheckoutInfo | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  // Revers Scanning modal state
  const [scannedRevers, setScannedRevers] = useState<ScannedReversGroup | null>(null);
  const [reversBusy, setReversBusy] = useState(false);

  // Dialogs
  const [bulkOpen, setBulkOpen] = useState(false);
  const [statusModalAsset, setStatusModalAsset] = useState<ScannedAsset | null>(null);
  const [damageModalAsset, setDamageModalAsset] = useState<{
    id: string;
    code: string;
    name: string;
    checkoutId?: string;
  } | null>(null);

  // USB/Bluetooth Keyboard Wedge buffer
  const hidBufferRef = useRef<string>("");
  const hidLastTimeRef = useRef<number>(0);

  // Instant or manual return helper
  const handleExecuteReturnOk = useCallback(
    async (checkoutId: string, asset: ScannedAsset) => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { error: coErr } = await supabase
          .from("checkouts")
          .update({
            returned_at: new Date().toISOString(),
            return_received_by: user?.id ?? null,
            condition_in: "OK",
          })
          .eq("id", checkoutId);

        if (coErr) throw coErr;

        const { error: astErr } = await supabase
          .from("assets")
          .update({ status: "available" })
          .eq("id", asset.id);

        if (astErr) throw astErr;

        if (soundEnabled) playScanSuccess();
        toast.success(`Razduženo: ${asset.name} je sada u magacinu (Dostupno)`);

        setHistory((prev) => [
          {
            id: `${Date.now()}-${Math.random()}`,
            code: asset.code,
            timestamp: new Date(),
            status: "returned",
            asset: { ...asset, status: "available" },
            note: "Razduženo (Ispravno)",
          },
          ...prev.slice(0, 49),
        ]);

        setActiveCheckout(null);
        setCurrentAsset({ ...asset, status: "available" });
      } catch (e) {
        if (soundEnabled) playScanError();
        toast.error((e as Error).message || "Greška pri razduživanju.");
      }
    },
    [soundEnabled]
  );

  // Core scan processing logic
  const handleScan = useCallback(
    async (r: ScanResult) => {
      const cleanCode = r.code.trim();
      if (!cleanCode || loading || cleanCode === lastCode) return;

      setLastCode(cleanCode);
      setLoading(true);

      try {
        // 1. Check if scanned code is a Revers identifier (e.g. REV-XXXX)
        const isReversCode =
          cleanCode.toUpperCase().startsWith("REV-") || cleanCode.includes("revers-");

        if (isReversCode) {
          const revKey = cleanCode.replace(/^REV-/i, "").replace(/^revers-/i, "");
          const { data: revData } = await supabase
            .from("checkouts")
            .select(
              `id, asset_id, event_id, checked_out_to_name, checked_out_at, expected_return_at, returned_at, condition_out, signature_path,
               assets:asset_id(id, code, name, serial_number),
               events:event_id(name, clients:client_id(name))`
            )
            .or(`signature_path.ilike.%${revKey}%,id.ilike.${revKey}%`)
            .order("checked_out_at", { ascending: false });

          if (revData && revData.length > 0) {
            const first = revData[0];
            const group: ScannedReversGroup = {
              reversCode: cleanCode.toUpperCase(),
              eventName: (first.events as any)?.name,
              clientName: (first.events as any)?.clients?.name,
              checkedOutTo: first.checked_out_to_name || "Preuzimalac",
              checkedOutAt: first.checked_out_at,
              items: revData.map((c: any) => ({
                checkoutId: c.id,
                assetId: c.asset_id,
                code: c.assets?.code || "—",
                name: c.assets?.name || "Nepoznata oprema",
                serialNumber: c.assets?.serial_number,
                returnedAt: c.returned_at,
              })),
            };

            setScannedRevers(group);
            if (soundEnabled) playScanSuccess();
            toast.success(`Prepoznat revers: ${group.reversCode} (${group.items.length} stavki)`);

            setHistory((prev) => [
              {
                id: `${Date.now()}-${Math.random()}`,
                code: cleanCode,
                timestamp: new Date(),
                status: "revers",
                note: `Revers: ${group.items.length} stavki`,
              },
              ...prev.slice(0, 49),
            ]);
            return;
          }
        }

        // 2. Search for Asset in database
        const { data, error } = await supabase
          .from("assets")
          .select(
            "*, categories:category_id(id, name), locations:current_location_id(id, name), asset_photos(storage_path, is_primary)"
          )
          .or(
            `code.eq.${cleanCode},qr_code.eq.${cleanCode},barcode.eq.${cleanCode},serial_number.eq.${cleanCode}`
          )
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          // Not found in database
          if (soundEnabled) playScanError();
          setNotFoundCode(cleanCode);
          setCurrentAsset(null);
          setActiveCheckout(null);
          setActiveTab("result");

          setHistory((prev) => [
            {
              id: `${Date.now()}-${Math.random()}`,
              code: cleanCode,
              timestamp: new Date(),
              status: "not_found",
            },
            ...prev.slice(0, 49),
          ]);

          toast.error(`Šifra nije pronađena: ${cleanCode}`);
        } else {
          // Found asset
          const assetData = data as unknown as ScannedAsset;

          // Check if there is an active checkout for this asset
          const { data: coData } = await supabase
            .from("checkouts")
            .select(
              `id, asset_id, event_id, checked_out_to_name, checked_out_at, expected_return_at, condition_out, notes,
               events:event_id(id, name, clients:client_id(id, name))`
            )
            .eq("asset_id", assetData.id)
            .is("returned_at", null)
            .order("checked_out_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const activeCo = (coData as unknown as ActiveCheckoutInfo) || null;
          setActiveCheckout(activeCo);

          // History record
          setHistory((prev) => [
            {
              id: `${Date.now()}-${Math.random()}`,
              code: cleanCode,
              timestamp: new Date(),
              status: "found",
              asset: assetData,
            },
            ...prev.slice(0, 49),
          ]);

          // Handle according to active mode
          if (mode === "return") {
            // INBOUND RETURN MODE
            if (activeCo && autoReturnOk) {
              // 1-Scan auto return
              await handleExecuteReturnOk(activeCo.id, assetData);
            } else {
              // Inspect & confirm return
              if (soundEnabled) playScanSuccess();
              setCurrentAsset(assetData);
              setNotFoundCode(null);
              setActiveTab("result");
              if (activeCo) {
                toast.info(`Zaduženo na: ${activeCo.events?.name || "Događaj"}`);
              } else if (assetData.status === "available") {
                toast.success(`Artikl je već u magacinu: ${assetData.name}`);
              } else {
                toast.info(`Artikl na terenu bez reversa: ${assetData.name}`);
              }
            }
          } else if (mode === "batch") {
            // OUTBOUND BATCH MODE: add to scan cart and keep scanning!
            const ok = add({
              id: assetData.id,
              code: assetData.code,
              name: assetData.name,
              serial_number: assetData.serial_number,
            });

            if (soundEnabled) playScanSuccess();

            if (ok) {
              toast.success(`+1 U korpu: ${assetData.name}`);
            } else {
              toast.info(`Već je u korpi: ${assetData.name}`);
            }
            setCurrentAsset(assetData);
            setNotFoundCode(null);
          } else {
            // SINGLE INSPECT MODE
            if (soundEnabled) playScanSuccess();
            setCurrentAsset(assetData);
            setNotFoundCode(null);
            setActiveTab("result");
            toast.success(`Prepoznato: ${assetData.name}`);
          }
        }
      } catch (e) {
        toast.error((e as Error).message || "Greška pri pretrazi opreme.");
      } finally {
        setLoading(false);
        // Cool down to prevent immediate re-trigger of identical tag
        setTimeout(() => setLastCode(null), 1200);
      }
    },
    [loading, lastCode, mode, add, soundEnabled, autoReturnOk, handleExecuteReturnOk]
  );

  // Hardware USB/Bluetooth Barcode Scanner Keyboard Wedge Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      if (now - hidLastTimeRef.current > 100) {
        hidBufferRef.current = "";
      }
      hidLastTimeRef.current = now;

      if (e.key === "Enter") {
        if (hidBufferRef.current.length >= 3) {
          e.preventDefault();
          const scannedCode = hidBufferRef.current;
          hidBufferRef.current = "";
          handleScan({ code: scannedCode, format: "HID_SCANNER" });
        }
      } else if (e.key.length === 1) {
        hidBufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleScan]);

  const addToCart = (a: ScannedAsset) => {
    const ok = add({
      id: a.id,
      code: a.code,
      name: a.name,
      serial_number: a.serial_number,
    });
    if (ok) {
      toast.success(`Dodato u korpu: ${a.name}`);
    } else {
      toast.info("Stavka je već u korpi.");
    }
  };

  // Revers Bulk Return Action
  const handleReturnEntireRevers = async () => {
    if (!scannedRevers) return;
    setReversBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const openItems = scannedRevers.items.filter((it) => !it.returnedAt);
      if (openItems.length === 0) {
        toast.info("Sve stavke sa ovog reversa su već razdužene.");
        setScannedRevers(null);
        return;
      }

      for (const it of openItems) {
        await supabase
          .from("checkouts")
          .update({
            returned_at: new Date().toISOString(),
            return_received_by: user?.id ?? null,
            condition_in: "OK",
          })
          .eq("id", it.checkoutId);

        await supabase.from("assets").update({ status: "available" }).eq("id", it.assetId);
      }

      if (soundEnabled) playScanSuccess();
      toast.success(
        `Razdužene sve stavke (${openItems.length}) sa reversa ${scannedRevers.reversCode}`
      );
      setScannedRevers(null);
    } catch (e) {
      toast.error((e as Error).message || "Greška pri razduživanju reversa.");
    } finally {
      setReversBusy(false);
    }
  };

  // Export session scan history as CSV
  const handleExportHistory = () => {
    if (history.length === 0) {
      toast.error("Nema podataka za izvoz.");
      return;
    }
    exportCsv(
      `skeniranje-${new Date().toISOString().slice(0, 10)}`,
      history,
      [
        {
          header: "Vreme",
          value: (r) => r.timestamp.toLocaleTimeString("sr-RS"),
        },
        { header: "Očitana šifra", value: (r) => r.code },
        { header: "Tip", value: (r) => r.status },
        { header: "Artikal", value: (r) => r.asset?.name ?? r.note ?? "Nije pronađeno" },
        { header: "Status opreme", value: (r) => r.asset?.status ?? "" },
        { header: "Lokacija", value: (r) => r.asset?.locations?.name ?? "" },
      ]
    );
    toast.success("Istorija skeniranja je izvezena.");
  };

  const getPrimaryPhotoUrl = (photos?: { storage_path: string; is_primary: boolean }[]) => {
    if (!photos || photos.length === 0) return null;
    const primary = photos.find((p) => p.is_primary) ?? photos[0];
    const { data } = supabase.storage.from("asset-photos").getPublicUrl(primary.storage_path);
    return data?.publicUrl ?? null;
  };

  // Camera Pause condition: save mobile battery & prevent accidental scans when modals are open
  const isCameraPaused =
    bulkOpen ||
    !!statusModalAsset ||
    !!damageModalAsset ||
    !!scannedRevers ||
    (mode === "single" && (!!currentAsset || !!notFoundCode));

  return (
    <PageContainer>
      <PageHeader
        title="Skeniranje Opreme"
        description="Mobilni centar za izdavanje u korpu, instant prijem i razduživanje reversa"
        actions={
          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled((s) => !s)}
              title={soundEnabled ? "Isključi zvučne signale" : "Uključi zvučne signale"}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>

            {/* Scan Cart Button */}
            <Button
              variant={items.length > 0 ? "default" : "outline"}
              onClick={() => setBulkOpen(true)}
              className="relative"
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              Korpa
              {items.length > 0 && (
                <Badge className="ml-2 bg-primary-foreground text-primary font-bold">
                  {items.length}
                </Badge>
              )}
            </Button>
          </div>
        }
      />

      {/* Mode Switcher & Hardware Scanner Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 p-2.5 rounded-xl bg-card border shadow-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
            Režim rada:
          </span>
          <div className="flex rounded-lg bg-muted p-1 gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setMode("batch");
                setCurrentAsset(null);
                setActiveCheckout(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                mode === "batch"
                  ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" /> Izdavanje (U korpu)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("return");
                setCurrentAsset(null);
                setActiveCheckout(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                mode === "return"
                  ? "bg-emerald-600 text-white shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Undo2 className="h-3.5 w-3.5" /> Prijem (Razduživanje)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("single");
                setCurrentAsset(null);
                setActiveCheckout(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                mode === "single"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Info / Karton
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 px-2 text-xs text-muted-foreground">
          {mode === "return" && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-foreground font-medium bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 px-2 py-1 rounded-md">
              <input
                type="checkbox"
                checked={autoReturnOk}
                onChange={(e) => setAutoReturnOk(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-emerald-500 accent-emerald-600"
              />
              <span className="text-emerald-700 dark:text-emerald-300">1-sken auto prijem</span>
            </label>
          )}

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">HID barkod aktivan</span>
          </div>
        </div>
      </div>

      {/* Main Scanner Layout */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left / Top: Mobile-First Camera Viewfinder */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="overflow-hidden border-2 shadow-sm">
            <CardContent className="p-3 sm:p-4 space-y-3">
              <CameraScanner
                onScan={handleScan}
                paused={isCameraPaused}
                fullscreen={fullscreen}
                onToggleFullscreen={() => setFullscreen((f) => !f)}
              />

              {/* Manual Barcode Entry Bar */}
              <form
                className="flex gap-2 pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualCode.trim()) {
                    handleScan({ code: manualCode.trim(), format: "MANUAL" });
                    setManualCode("");
                  }
                }}
              >
                <div className="relative flex-1">
                  <Input
                    placeholder={
                      mode === "return"
                        ? "Unesi šifru, QR, barkod ili REV-XXXX za prijem..."
                        : "Unesi šifru, QR ili barkod ručno..."
                    }
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="h-10 pr-8"
                  />
                  {manualCode && (
                    <button
                      type="button"
                      onClick={() => setManualCode("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Button type="submit" variant="secondary" className="h-10 px-4 font-semibold">
                  Traži
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right / Bottom: Interactive Results, Cart & Session History */}
        <div className="lg:col-span-5 space-y-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid grid-cols-3 w-full h-11">
              <TabsTrigger value="result" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <ScanLine className="h-4 w-4" /> Rezultat
              </TabsTrigger>
              <TabsTrigger value="cart" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <ShoppingCart className="h-4 w-4" /> Korpa
                {items.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[11px] ml-1 font-bold">
                    {items.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <History className="h-4 w-4" /> Istorija
                {history.length > 0 && (
                  <span className="text-[11px] text-muted-foreground ml-1">({history.length})</span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Result / Scanned Item Action Card */}
            <TabsContent value="result" className="mt-4 space-y-4">
              <Card className="shadow-sm">
                <CardContent className="p-5">
                  {loading && (
                    <div className="py-12 text-center space-y-3">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                      <p className="text-sm text-muted-foreground">Pretraga baze i zaduženja...</p>
                    </div>
                  )}

                  {!loading && !currentAsset && !notFoundCode && (
                    <div className="py-12 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                        <ScanLine className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">
                          {mode === "return"
                            ? "Spremno za prijem i razduživanje"
                            : mode === "batch"
                              ? "Spremno za pakovanje i izdavanje"
                              : "Spremno za pregled opreme"}
                        </h4>
                        <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1">
                          {mode === "return"
                            ? "Usmite kameru prema nalepnici opreme ili skenirajte QR kod na reversu (REV-XXXX) za automatski prijem."
                            : "Usmite kameru prema QR ili barkodu za brzo očitavanje."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Scanned Asset Found Card */}
                  {!loading && currentAsset && (
                    <div className="space-y-4">
                      {/* Asset Header Info */}
                      <div className="flex items-start gap-3.5">
                        {getPrimaryPhotoUrl(currentAsset.asset_photos) ? (
                          <img
                            src={getPrimaryPhotoUrl(currentAsset.asset_photos)!}
                            alt={currentAsset.name}
                            className="w-16 h-16 rounded-xl object-cover border shadow-xs shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary">
                            <Package className="h-8 w-8" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-base leading-tight truncate">
                              {currentAsset.name}
                            </h3>
                            <AssetStatusBadge status={currentAsset.status} />
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap font-mono">
                            <span>Šifra: {currentAsset.code}</span>
                            {currentAsset.serial_number && (
                              <span>· S/N: {currentAsset.serial_number}</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                            {currentAsset.categories?.name && (
                              <span className="flex items-center gap-1">
                                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                                {currentAsset.categories.name}
                              </span>
                            )}
                            {currentAsset.locations?.name && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                {currentAsset.locations.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* INBOUND RETURN WORKFLOW CARD */}
                      {mode === "return" ? (
                        <div className="space-y-3 pt-2 border-t">
                          {activeCheckout ? (
                            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-3.5 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                                  <Receipt className="h-3.5 w-3.5" /> Aktivno Zaduženje
                                </span>
                                <Badge variant="outline" className="text-[10px] bg-background">
                                  {activeCheckout.events?.name || "Događaj"}
                                </Badge>
                              </div>

                              <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
                                <div>
                                  Preuzeo:{" "}
                                  <span className="text-foreground font-medium">
                                    {activeCheckout.checked_out_to_name || "—"}
                                  </span>
                                </div>
                                <div>
                                  Rok:{" "}
                                  <span className="text-foreground font-medium">
                                    {activeCheckout.expected_return_at
                                      ? formatDateTime(activeCheckout.expected_return_at)
                                      : "Nije definisan"}
                                  </span>
                                </div>
                              </div>

                              {/* Two Primary Instant Return Buttons */}
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <Button
                                  onClick={() =>
                                    handleExecuteReturnOk(activeCheckout.id, currentAsset)
                                  }
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-11"
                                >
                                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Ispravno (Razduži)
                                </Button>

                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    setDamageModalAsset({
                                      id: currentAsset.id,
                                      code: currentAsset.code,
                                      name: currentAsset.name,
                                      checkoutId: activeCheckout.id,
                                    })
                                  }
                                  className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 font-semibold h-11"
                                >
                                  <AlertTriangle className="mr-1.5 h-4 w-4 text-rose-500" />{" "}
                                  Oštećeno
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-muted/50 rounded-xl p-3.5 space-y-2 border">
                              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                {currentAsset.status === "available" ? (
                                  <>
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Artikl je
                                    već razdužen i nalazi se u magacinu.
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="h-4 w-4 text-amber-500" /> Artikl ima
                                    status „{currentAsset.status}”, ali nema otvoren revers.
                                  </>
                                )}
                              </div>

                              {currentAsset.status !== "available" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="w-full mt-2"
                                  onClick={async () => {
                                    await supabase
                                      .from("assets")
                                      .update({ status: "available" })
                                      .eq("id", currentAsset.id);
                                    setCurrentAsset({ ...currentAsset, status: "available" });
                                    toast.success(
                                      `Status artikla ${currentAsset.name} promenjen u Dostupno.`
                                    );
                                  }}
                                >
                                  Vrati u magacin (Dostupno)
                                </Button>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs"
                              onClick={() => {
                                setCurrentAsset(null);
                                setActiveCheckout(null);
                              }}
                            >
                              Skeniraj sledeći artikl
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* OUTBOUND DISPATCH & SINGLE INSPECT ACTIONS */
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                          <Button onClick={() => addToCart(currentAsset)} className="h-10">
                            <Plus className="mr-1.5 h-4 w-4" /> U korpu
                          </Button>

                          <Button
                            variant="secondary"
                            onClick={() => setStatusModalAsset(currentAsset)}
                            className="h-10"
                          >
                            <RefreshCw className="mr-1.5 h-4 w-4" /> Promeni status
                          </Button>

                          <Button variant="outline" asChild className="h-10">
                            <Link to={`/assets/${currentAsset.id}`}>
                              Karton opreme <ChevronRight className="ml-1 h-4 w-4" />
                            </Link>
                          </Button>

                          <Button
                            variant="ghost"
                            onClick={() => {
                              setCurrentAsset(null);
                              setNotFoundCode(null);
                            }}
                            className="h-10"
                          >
                            Skeniraj sledeće
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scanned Code Not Found Alert */}
                  {!loading && notFoundCode && (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="font-semibold text-foreground">
                            Šifra nije pronađena u bazi
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Očitana vrednost:{" "}
                            <span className="font-mono font-bold text-foreground">
                              {notFoundCode}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button asChild className="flex-1">
                          <Link to={`/assets/new?code=${encodeURIComponent(notFoundCode)}`}>
                            <Plus className="mr-2 h-4 w-4" /> Kreiraj novi artikal
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setNotFoundCode(null);
                            setCurrentAsset(null);
                          }}
                        >
                          Pokušaj ponovo
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: Scan Cart Tab */}
            <TabsContent value="cart" className="mt-4 space-y-4">
              <Card className="shadow-sm">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-primary" /> Korpa ({items.length})
                  </CardTitle>
                  {items.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={clear}
                      className="h-8 text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Isprazni sve
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-3">
                  {items.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Korpa je prazna. Skenirajte artikle za grupno zaduživanje.
                    </div>
                  ) : (
                    <>
                      <ul className="divide-y border rounded-xl max-h-72 overflow-y-auto">
                        {items.map((it) => (
                          <li
                            key={it.id}
                            className="flex items-center justify-between p-3 text-sm hover:bg-muted/30 transition-colors"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="font-medium truncate">{it.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {it.code}
                                {it.serial_number ? ` · S/N: ${it.serial_number}` : ""}
                              </div>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => remove(it.id)}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              aria-label="Ukloni"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>

                      <Button
                        className="w-full h-11 font-medium"
                        onClick={() => setBulkOpen(true)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Zaduži sve ({items.length}) uz jedan potpis
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: Session Scan History */}
            <TabsContent value="history" className="mt-4 space-y-4">
              <Card className="shadow-sm">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <History className="h-4 w-4 text-primary" /> Istorija sesije ({history.length})
                  </CardTitle>
                  <div className="flex gap-1.5">
                    {history.length > 0 && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleExportHistory}
                          className="h-8 text-xs"
                          title="Preuzmi CSV izveštaj"
                        >
                          <Download className="mr-1 h-3.5 w-3.5" /> CSV
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistory([])}
                          className="h-8 text-xs text-muted-foreground"
                          title="Obriši listu"
                        >
                          Očisti
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {history.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Nema zabeleženih očitavanja u ovoj sesiji.
                    </div>
                  ) : (
                    <ul className="divide-y border rounded-xl max-h-72 overflow-y-auto">
                      {history.map((h) => (
                        <li
                          key={h.id}
                          className="flex items-center justify-between p-2.5 px-3 text-xs hover:bg-muted/30 transition-colors"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-2 font-medium">
                              {h.status === "returned" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              ) : h.status === "revers" ? (
                                <Receipt className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                              ) : h.status === "found" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                              ) : (
                                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              )}
                              <span className="truncate">
                                {h.asset ? h.asset.name : h.note || "Očitana šifra"}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5 flex gap-2">
                              <span>{h.code}</span>
                              <span>· {h.timestamp.toLocaleTimeString("sr-RS")}</span>
                            </div>
                          </div>

                          {h.asset && mode === "batch" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => addToCart(h.asset!)}
                              className="h-7 px-2 text-[11px]"
                            >
                              + Korpa
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Floating Bottom Mobile Dock for Cart Checkout */}
      {items.length > 0 && mode === "batch" && (
        <div className="fixed bottom-4 inset-x-4 sm:hidden z-40">
          <div className="bg-primary text-primary-foreground p-3 rounded-2xl shadow-xl flex items-center justify-between border border-white/20 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                {items.length}
              </div>
              <div className="text-xs font-medium">
                {items.length === 1 ? "1 stavka u korpi" : `${items.length} stavki u korpi`}
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setBulkOpen(true)}
              className="font-semibold text-xs shadow-xs"
            >
              Zaduži sve <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Scanned Revers Quick-Return Modal */}
      <Dialog open={!!scannedRevers} onOpenChange={(v) => !v && setScannedRevers(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col justify-between p-5">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Receipt className="h-5 w-5 text-primary" />
              Revers {scannedRevers?.reversCode}
            </DialogTitle>
          </DialogHeader>

          {scannedRevers && (
            <div className="py-2 space-y-4 flex-1 overflow-y-auto">
              <div className="bg-muted/50 rounded-xl p-3 text-xs space-y-1 border">
                <div>
                  Događaj:{" "}
                  <span className="font-semibold text-foreground">
                    {scannedRevers.eventName || "—"}
                  </span>
                  {scannedRevers.clientName && (
                    <span className="text-muted-foreground"> ({scannedRevers.clientName})</span>
                  )}
                </div>
                <div>
                  Preuzeo:{" "}
                  <span className="font-semibold text-foreground">
                    {scannedRevers.checkedOutTo}
                  </span>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Stavke na reversu ({scannedRevers.items.length})
                </h5>
                <ul className="divide-y border rounded-xl max-h-56 overflow-y-auto text-xs">
                  {scannedRevers.items.map((it) => (
                    <li
                      key={it.checkoutId}
                      className="p-2.5 flex items-center justify-between hover:bg-muted/20"
                    >
                      <div>
                        <div className="font-medium text-foreground">{it.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {it.code}
                          {it.serialNumber ? ` · SN: ${it.serialNumber}` : ""}
                        </div>
                      </div>
                      {it.returnedAt ? (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 text-[10px]"
                        >
                          Vraćeno
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-amber-700 dark:text-amber-400 text-[10px]"
                        >
                          Zaduženo
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t flex items-center justify-between sm:justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (scannedRevers) {
                  navigate(`/checkouts?q=${encodeURIComponent(scannedRevers.reversCode)}`);
                }
              }}
            >
              Otvori u Reversima
            </Button>

            <Button
              size="sm"
              onClick={handleReturnEntireRevers}
              disabled={reversBusy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {reversBusy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
              )}
              Razduži sve stavke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Checkout Modal with Digital Signature */}
      <BulkCheckoutDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        items={items}
        onRemoveItem={remove}
        onDone={() => {
          clear();
          navigate("/checkouts");
        }}
      />

      {/* Quick In-Place Status Adjustment Modal */}
      <QuickStatusModal
        open={!!statusModalAsset}
        onOpenChange={(v) => !v && setStatusModalAsset(null)}
        asset={statusModalAsset}
        onSuccess={(newStatus) => {
          if (currentAsset && currentAsset.id === statusModalAsset?.id) {
            setCurrentAsset({ ...currentAsset, status: newStatus });
          }
        }}
      />

      {/* Damaged Return Service Prompt Modal */}
      {damageModalAsset && (
        <DamageReportDialog
          open={!!damageModalAsset}
          onOpenChange={(v) => !v && setDamageModalAsset(null)}
          asset={damageModalAsset}
          sendToService={true}
          checkoutId={damageModalAsset.checkoutId}
          onReportSubmitted={() => {
            if (currentAsset && currentAsset.id === damageModalAsset.id) {
              setCurrentAsset({ ...currentAsset, status: "damaged" });
            }
            setActiveCheckout(null);
            setDamageModalAsset(null);
          }}
        />
      )}
    </PageContainer>
  );
}
