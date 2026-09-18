import { Link, useNavigate } from "react-router-dom";
import { useCallback, useState, useEffect, useRef } from "react";
import { CameraScanner, type ScanResult } from "@/components/scanner/CameraScanner";
import { QuickStatusModal } from "@/components/scanner/QuickStatusModal";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
} from "lucide-react";
import { AssetStatusBadge } from "@/components/common/StatusBadge";
import { toast } from "sonner";
import { useScanCart } from "@/features/cart/use-scan-cart";
import { BulkCheckoutDialog } from "@/components/checkout/BulkCheckoutDialog";
import { playScanSuccess, playScanError } from "@/lib/sound";
import { exportCsv } from "@/lib/csv";

type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

type ScannedAsset = AssetRow & {
  categories?: { id: string; name: string } | null;
  locations?: { id: string; name: string } | null;
  asset_photos?: { storage_path: string; is_primary: boolean }[];
};

type ScanHistoryItem = {
  id: string;
  code: string;
  timestamp: Date;
  status: "found" | "not_found";
  asset?: ScannedAsset;
};

export default function ScanPage() {
  const navigate = useNavigate();
  const { items, add, remove, clear } = useScanCart();

  // Scan Modes: 'single' (inspect item) | 'batch' (auto add to cart)
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<"result" | "cart" | "history">("result");

  // State for scans
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentAsset, setCurrentAsset] = useState<ScannedAsset | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  // Dialogs
  const [bulkOpen, setBulkOpen] = useState(false);
  const [statusModalAsset, setStatusModalAsset] = useState<ScannedAsset | null>(null);

  // USB/Bluetooth Keyboard Wedge buffer
  const hidBufferRef = useRef<string>("");
  const hidLastTimeRef = useRef<number>(0);

  // Core scan processing logic
  const handleScan = useCallback(
    async (r: ScanResult) => {
      const cleanCode = r.code.trim();
      if (!cleanCode || loading || cleanCode === lastCode) return;

      setLastCode(cleanCode);
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from("assets")
          .select(
            "*, categories:category_id(id, name), locations:current_location_id(id, name), asset_photos(storage_path, is_primary)"
          )
          .or(`code.eq.${cleanCode},qr_code.eq.${cleanCode},barcode.eq.${cleanCode},serial_number.eq.${cleanCode}`)
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          // Not found in database
          if (soundEnabled) playScanError();
          setNotFoundCode(cleanCode);
          setCurrentAsset(null);
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

          if (mode === "batch") {
            // Batch mode: add directly to scan cart and keep scanning!
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
            // Single inspect mode: display rich card
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
    [loading, lastCode, mode, add, soundEnabled]
  );

  // Hardware USB/Bluetooth Barcode Scanner Keyboard Wedge Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is focused on an input element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      // Most hardware laser barcode scanners emit keystrokes in <45ms increments
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
        {
          header: "Status baze",
          value: (r) => (r.status === "found" ? "Pronađeno" : "Nije pronađeno"),
        },
        { header: "Naziv opreme", value: (r) => r.asset?.name ?? "" },
        { header: "Serijski broj", value: (r) => r.asset?.serial_number ?? "" },
        {
          header: "Kategorija",
          value: (r) => r.asset?.categories?.name ?? "",
        },
        { header: "Status opreme", value: (r) => r.asset?.status ?? "" },
        { header: "Lokacija", value: (r) => r.asset?.locations?.name ?? "" },
      ]
    );
    toast.success("Istorija skeniranja je izvezena.");
  };

  // Primary photo url helper
  const getPrimaryPhotoUrl = (photos?: { storage_path: string; is_primary: boolean }[]) => {
    if (!photos || photos.length === 0) return null;
    const primary = photos.find((p) => p.is_primary) ?? photos[0];
    const { data } = supabase.storage.from("asset-photos").getPublicUrl(primary.storage_path);
    return data?.publicUrl ?? null;
  };

  return (
    <PageContainer>
      <PageHeader
        title="Skeniranje Opreme"
        description="Mobilni skener sa naprednim fokusiranjem, serijskim očitavanjem i reversom"
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
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
            Režim rada:
          </span>
          <div className="flex rounded-lg bg-muted p-1 gap-1">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                mode === "single"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pojedinačni pregled
            </button>
            <button
              type="button"
              onClick={() => setMode("batch")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                mode === "batch"
                  ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3 w-3" /> Serijsko u korpu
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>HID barkod čitač aktivan</span>
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
                paused={mode === "single" && (!!currentAsset || !!notFoundCode)}
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
                    placeholder="Unesi šifru, QR ili barkod ručno..."
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
                <Button type="submit" variant="secondary" className="h-10 px-4">
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
                  <Badge variant="secondary" className="h-5 px-1.5 text-[11px] ml-1">
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
                      <p className="text-sm text-muted-foreground">Pretraga baze opreme...</p>
                    </div>
                  )}

                  {!loading && !currentAsset && !notFoundCode && (
                    <div className="py-12 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                        <ScanLine className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">Spremno za skeniranje</h4>
                        <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1">
                          Usmite kameru prema QR ili bar-kodu na opremi ili povežite bežični skener.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Scanned Asset Found Card */}
                  {!loading && currentAsset && (
                    <div className="space-y-5">
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

                      {/* Action Buttons Grid */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                        <Button
                          onClick={() => addToCart(currentAsset)}
                          className="h-10"
                        >
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
                              {h.status === "found" ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              )}
                              <span className="truncate">
                                {h.asset ? h.asset.name : "Nepoznata oprema"}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5 flex gap-2">
                              <span>{h.code}</span>
                              <span>· {h.timestamp.toLocaleTimeString("sr-RS")}</span>
                            </div>
                          </div>

                          {h.asset && (
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
      {items.length > 0 && (
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
    </PageContainer>
  );
}
