import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  CheckCircle2, 
  Camera, 
  X, 
  Search, 
  FileDown, 
  Printer, 
  Plus, 
  Minus, 
  ArrowLeft, 
  Barcode, 
  Layers, 
  MessageSquare, 
  PackageSearch,
  MapPin,
  Calendar,
  Clock,
  Check,
  Ban
} from "lucide-react";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { InventoryPrintReport, type InventoryReportLine } from "@/components/inventory/InventoryPrintReport";
import { toast } from "sonner";
import { exportCsv } from "@/lib/csv";
import { playScanSuccess, playScanError } from "@/lib/sound";
import { formatDateTime } from "@/lib/format";


export default function InventoryDetails() {
  const { inventoryId } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Scanning & Input State
  const [scanning, setScanning] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "missing" | "found" | "surplus">("all");

  // Modals
  const [reportOpen, setReportOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [reconcileLocations, setReconcileLocations] = useState(true);
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");

  // Per-line note editing modal
  const [editingNoteLine, setEditingNoteLine] = useState<{ id: string; name: string; note: string } | null>(null);

  // Fetch inventory details
  const { data: inv, isLoading: invLoading } = useQuery({
    queryKey: ["inventory", inventoryId!],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventories")
        .select("*, locations:location_id(name)")
        .eq("id", inventoryId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch inventory lines with assets
  const { data: lines, isLoading: linesLoading } = useQuery({
    queryKey: ["inventory-lines", inventoryId!],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_lines")
        .select("*, assets:asset_id(id, code, name, serial_number, barcode, qr_code, current_location_id, locations:current_location_id(name), categories:category_id(name))")
        .eq("inventory_id", inventoryId!);
      if (error) throw error;
      return (data as unknown as InventoryReportLine[]) ?? [];
    },
  });

  // Global search for adding unlisted asset
  const { data: searchableAssets, isLoading: searchingAssets } = useQuery({
    queryKey: ["search-assets-for-audit", assetSearchQuery],
    enabled: addAssetOpen && assetSearchQuery.trim().length >= 2,
    queryFn: async () => {
      const q = assetSearchQuery.trim();
      const { data, error } = await supabase
        .from("assets")
        .select("id, code, name, serial_number, current_location_id, locations:current_location_id(name)")
        .or(`code.ilike.%${q}%,name.ilike.%${q}%,barcode.ilike.%${q}%,serial_number.ilike.%${q}%`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mutation: Scan code (either by camera or laser wedge scanner)
  const scanMut = useMutation({
    mutationFn: async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return null;

      // 1) Find asset in database
      const { data: asset, error } = await supabase
        .from("assets")
        .select("id, code, name, quantity")
        .or(`code.eq.${trimmed},qr_code.eq.${trimmed},barcode.eq.${trimmed},serial_number.eq.${trimmed}`)
        .maybeSingle();
      if (error) throw error;

      if (!asset) {
        playScanError();
        throw new Error(`Artikal sa šifrom/barkodom „${trimmed}“ nije pronađen u bazi!`);
      }

      const { data: { user } } = await supabase.auth.getUser();
      const existing = lines?.find((l) => l.assets?.id === asset.id);

      if (existing) {
        const nextQty = (existing.counted_qty ?? 0) + 1;
        const { error: e2 } = await supabase
          .from("inventory_lines")
          .update({
            counted_qty: nextQty,
            scanned_at: new Date().toISOString(),
            scanned_by: user?.id ?? null,
          })
          .eq("id", existing.id);
        if (e2) throw e2;
      } else {
        // Discovered asset that was not originally pre-seeded in this audit
        const { error: e2 } = await supabase
          .from("inventory_lines")
          .insert({
            inventory_id: inventoryId!,
            asset_id: asset.id,
            expected_qty: 0,
            counted_qty: 1,
            scanned_at: new Date().toISOString(),
            scanned_by: user?.id ?? null,
            note: "Pronađeno vanredno tokom popisa",
          });
        if (e2) throw e2;
      }

      playScanSuccess();
      return asset.name;
    },
    onSuccess: (name) => {
      if (name) {
        toast.success(`Popisano: ${name}`);
        qc.invalidateQueries({ queryKey: ["inventory-lines", inventoryId!] });
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Handle Camera Scan
  const handleCameraScan = useCallback(
    (r: { code: string }) => {
      if (r.code === lastCode) return;
      setLastCode(r.code);
      scanMut.mutate(r.code);
      setTimeout(() => setLastCode(null), 1500);
    },
    [lastCode, scanMut]
  );

  // Handle Manual Barcode Submit (Laser Wedge Scanner)
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    scanMut.mutate(barcodeInput.trim());
    setBarcodeInput("");
  };

  // Mutation: Update Counted Quantity
  const updateQtyMut = useMutation({
    mutationFn: async ({ lineId, newQty }: { lineId: string; newQty: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("inventory_lines")
        .update({
          counted_qty: Math.max(0, newQty),
          scanned_at: new Date().toISOString(),
          scanned_by: user?.id ?? null,
        })
        .eq("id", lineId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-lines", inventoryId!] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Mutation: Save Item Note
  const saveNoteMut = useMutation({
    mutationFn: async ({ lineId, note }: { lineId: string; note: string }) => {
      const { error } = await supabase
        .from("inventory_lines")
        .update({ note: note.trim() || null })
        .eq("id", lineId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Napomena sačuvana");
      setEditingNoteLine(null);
      qc.invalidateQueries({ queryKey: ["inventory-lines", inventoryId!] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Mutation: Add Unlisted Asset to Audit
  const addAssetMut = useMutation({
    mutationFn: async (assetId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const existing = lines?.find((l) => l.assets?.id === assetId);
      if (existing) {
        throw new Error("Ovaj artikal je već obuhvaćen popisom.");
      }

      const { error } = await supabase.from("inventory_lines").insert({
        inventory_id: inventoryId!,
        asset_id: assetId,
        expected_qty: 0,
        counted_qty: 1,
        scanned_at: new Date().toISOString(),
        scanned_by: user?.id ?? null,
        note: "Vanredno dodat artikal",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Artikal dodat u popis!");
      setAddAssetOpen(false);
      setAssetSearchQuery("");
      qc.invalidateQueries({ queryKey: ["inventory-lines", inventoryId!] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Mutation: Complete Audit & Reconcile
  const completeMut = useMutation({
    mutationFn: async () => {
      // 1) Mark inventory as completed
      const { error } = await supabase
        .from("inventories")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", inventoryId!);
      if (error) throw error;

      // 2) If reconcile locations is requested and inventory has a location_id:
      if (reconcileLocations && inv?.location_id && lines) {
        const foundAssetIds = lines
          .filter((l) => (l.counted_qty ?? 0) > 0 && l.assets?.id)
          .map((l) => l.assets!.id);

        if (foundAssetIds.length > 0) {
          await supabase
            .from("assets")
            .update({ current_location_id: inv.location_id })
            .in("id", foundAssetIds);
        }
      }
    },
    onSuccess: () => {
      toast.success("Popis je uspešno zaključen i sravnjen!");
      setCompleteOpen(false);
      qc.invalidateQueries({ queryKey: ["inventory", inventoryId!] });
      qc.invalidateQueries({ queryKey: ["inventories"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Mutation: Cancel Audit
  const cancelMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("inventories")
        .update({ status: "cancelled" })
        .eq("id", inventoryId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info("Popis je otkazan.");
      qc.invalidateQueries({ queryKey: ["inventory", inventoryId!] });
      qc.invalidateQueries({ queryKey: ["inventories"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Auto focus barcode input when component is mounted or scanner closed
  useEffect(() => {
    if (!scanning && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [scanning]);

  // Statistics
  const { totalExpected, totalCounted, totalMissing, totalSurplus, progress } = useMemo(() => {
    if (!lines) return { totalExpected: 0, totalCounted: 0, totalMissing: 0, totalSurplus: 0, progress: 0 };
    let exp = 0;
    let cnt = 0;
    let missing = 0;
    let surplus = 0;

    lines.forEach((l) => {
      const e = l.expected_qty || 0;
      const c = l.counted_qty || 0;
      exp += e;
      cnt += c;
      if (c < e) missing += e - c;
      if (c > e) surplus += c - e;
    });

    const prog = exp > 0 ? Math.min(100, Math.round(((exp - missing) / exp) * 100)) : 100;
    return { totalExpected: exp, totalCounted: cnt, totalMissing: missing, totalSurplus: surplus, progress: prog };
  }, [lines]);

  // Filtered Lines
  const filteredLines = useMemo(() => {
    if (!lines) return [];
    return lines.filter((l) => {
      const expected = l.expected_qty || 0;
      const counted = l.counted_qty || 0;

      // Status Filter Tab
      if (filterTab === "missing" && counted >= expected) return false;
      if (filterTab === "found" && (counted === 0 || counted < expected)) return false;
      if (filterTab === "surplus" && counted <= expected) return false;

      // Text Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const asset = l.assets;
        const matchCode = asset?.code?.toLowerCase().includes(q);
        const matchName = asset?.name?.toLowerCase().includes(q);
        const matchSerial = asset?.serial_number?.toLowerCase().includes(q);
        const matchLoc = asset?.locations?.name?.toLowerCase().includes(q);
        const matchNote = l.note?.toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchSerial && !matchLoc && !matchNote) return false;
      }

      return true;
    });
  }, [lines, filterTab, search]);

  if (invLoading || !inv) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary animate-pulse">
              <Clock className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Učitavanje podataka o popisu...</p>
          </div>
        </div>
      </PageContainer>
    );
  }

  const isOpen = inv.status === "open";
  const isCompleted = inv.status === "completed";

  return (
    <PageContainer>
      {/* Top Breadcrumb & Action Header */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground gap-1.5"
                onClick={() => navigate("/inventories")}
              >
                <ArrowLeft className="h-4 w-4" />
                Popisi
              </Button>
              <span className="text-muted-foreground">/</span>
              <Badge
                variant="outline"
                className={
                  isOpen
                    ? "bg-amber-500/15 text-amber-500 border-amber-500/30 gap-1.5 font-semibold"
                    : isCompleted
                    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1.5 font-semibold"
                    : "bg-rose-500/15 text-rose-500 border-rose-500/30 font-semibold"
                }
              >
                {isOpen && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
                {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                {isOpen ? "POPIS U TOKU" : isCompleted ? "ZAVRŠEN" : "OTKAZAN"}
              </Badge>

              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                {inv.type === "regular" ? "Redovni popis" : "Vanredni popis"}
              </Badge>
            </div>

            <h1 className="text-xl md:text-3xl font-bold tracking-tight text-foreground">
              {inv.name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Lokacija: <strong>{(inv as any).locations?.name || "Sve lokacije"}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Započeto: {formatDateTime(inv.started_at)}
              </span>
              {inv.completed_at && (
                <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Zaključeno: {formatDateTime(inv.completed_at)}
                </span>
              )}
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Print Official Zapisnik */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-background/50 shadow-sm"
              onClick={() => setReportOpen(true)}
            >
              <Printer className="h-4 w-4 text-primary" />
              Zapisnik o popisu
            </Button>

            {/* Export CSV */}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-background/50 shadow-sm"
              onClick={() => {
                if (!lines?.length) {
                  toast.error("Nema stavki za izvoz.");
                  return;
                }
                exportCsv(`popis-${inv.name}-${new Date().toISOString().slice(0, 10)}`, lines, [
                  { header: "Šifra", value: (l) => l.assets?.code ?? "" },
                  { header: "Naziv artikla", value: (l) => l.assets?.name ?? "" },
                  { header: "Serijski broj", value: (l) => l.assets?.serial_number ?? "" },
                  { header: "Kategorija", value: (l) => l.assets?.categories?.name ?? "" },
                  { header: "Lokacija", value: (l) => l.assets?.locations?.name ?? "" },
                  { header: "Očekivano", value: (l) => String(l.expected_qty ?? 0) },
                  { header: "Popisano", value: (l) => String(l.counted_qty ?? 0) },
                  { header: "Razlika", value: (l) => String((l.counted_qty ?? 0) - (l.expected_qty ?? 0)) },
                  { header: "Napomena", value: (l) => l.note ?? "" },
                ]);
                toast.success("CSV izveštaj je uspešno preuzet!");
              }}
            >
              <FileDown className="h-4 w-4" />
              CSV
            </Button>

            {/* Cancel Audit Option */}
            {isOpen && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-rose-500 gap-1.5"
                onClick={() => {
                  if (window.confirm("Da li ste sigurni da želite da otkažete ovaj popis?")) {
                    cancelMut.mutate();
                  }
                }}
              >
                <Ban className="h-4 w-4" />
                Otkaži
              </Button>
            )}

            {/* Complete Audit Button */}
            {isOpen && (
              <Button
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
                onClick={() => setCompleteOpen(true)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Zaključi popis
              </Button>
            )}
          </div>
        </div>

        {/* Audit Instructions if present */}
        {inv.notes && (
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground flex items-start gap-2.5">
            <MessageSquare className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <strong className="text-foreground font-semibold">Zadatak / Instrukcije komisije: </strong>
              {inv.notes}
            </div>
          </div>
        )}
      </div>

      {/* KPI Stats & Progress Bar */}
      <Card className="glass-card mb-6 overflow-hidden">
        <CardContent className="p-5 md:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Ukupna realizacija popisa</span>
            </div>
            <span className="text-xs font-mono font-bold text-primary">
              {progress}% sravnjeno ({totalCounted} / {totalExpected} kom)
            </span>
          </div>

          <Progress value={progress} className="h-2.5 bg-muted" />

          {/* 4 KPI Metric Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* Očekivano */}
            <div className="p-4 rounded-xl bg-muted/50 border border-border/60">
              <p className="text-xs text-muted-foreground font-medium">Knjigovodstveno (Očekivano)</p>
              <p className="text-xl md:text-2xl font-black text-foreground mt-1">{totalExpected} kom</p>
            </div>

            {/* Popisano */}
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Fizički Popisano</p>
              <p className="text-xl md:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{totalCounted} kom</p>
            </div>

            {/* Manjak */}
            <div className={`p-4 rounded-xl border ${totalMissing > 0 ? "bg-rose-500/10 border-rose-500/20" : "bg-muted/50 border-border/60"}`}>
              <p className={`text-xs font-medium ${totalMissing > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                Nedostaje (Manjak)
              </p>
              <p className={`text-xl md:text-2xl font-black mt-1 ${totalMissing > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                {totalMissing} kom
              </p>
            </div>

            {/* Višak */}
            <div className={`p-4 rounded-xl border ${totalSurplus > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-muted/50 border-border/60"}`}>
              <p className={`text-xs font-medium ${totalSurplus > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                Višak / Nepredviđeno
              </p>
              <p className={`text-xl md:text-2xl font-black mt-1 ${totalSurplus > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                {totalSurplus} kom
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dual Scanner & Quick Entry Bar (Only when audit is open) */}
      {isOpen && (
        <div className="space-y-4 mb-6">
          <Card className="glass-card border-primary/30">
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                {/* Laser Barcode / USB Wedge Scanner Form */}
                <form onSubmit={handleBarcodeSubmit} className="flex-1 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                    <Input
                      ref={barcodeInputRef}
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="Skeniraj ili unesi šifru / barkod artikla (Enter)..."
                      className="pl-11 h-11 bg-background text-sm font-mono tracking-wider border-primary/40 focus-visible:ring-primary"
                    />
                  </div>
                  <Button type="submit" className="h-11 px-5 gap-2 shrink-0 font-medium" disabled={!barcodeInput.trim() || scanMut.isPending}>
                    <Check className="h-4 w-4" />
                    Potvrdi unos
                  </Button>
                </form>

                {/* Camera Toggle Button */}
                <Button
                  variant={scanning ? "destructive" : "secondary"}
                  onClick={() => setScanning((s) => !s)}
                  className="h-11 gap-2 shrink-0"
                >
                  {scanning ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4 text-primary" />}
                  {scanning ? "Ugasi kameru" : "Kamera skener"}
                </Button>

                {/* Add Unlisted Asset Button */}
                <Button
                  variant="outline"
                  onClick={() => setAddAssetOpen(true)}
                  className="h-11 gap-2 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Dodaj vanrednu stavku
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Camera Scanner Viewport */}
          {scanning && (
            <Card className="glass-card overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <CardContent className="p-6">
                <div className="max-w-md mx-auto space-y-3 text-center">
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Camera className="h-4 w-4 text-primary" />
                      Usmjeri kameru na barkod ili QR kod
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setScanning(false)}>
                      Zatvori
                    </Button>
                  </div>
                  <div className="rounded-2xl overflow-hidden border border-border shadow-2xl">
                    <CameraScanner onScan={handleCameraScan} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Items Table Card with Filters */}
      <Card className="glass-card">
        <CardContent className="p-5 md:p-6 space-y-4">
          {/* Table Toolbar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-border/60 pb-4">
            {/* Status Filter Tabs */}
            <Tabs 
              value={filterTab} 
              onValueChange={(v) => setFilterTab(v as typeof filterTab)} 
              className="w-full md:w-auto"
            >
              <TabsList className="grid grid-cols-4 w-full md:w-auto">
                <TabsTrigger value="all">
                  Sve ({lines?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="missing" className="gap-1.5">
                  Manjak
                  {totalMissing > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-rose-500/20 text-rose-500 border-none font-bold">
                      {lines?.filter((l) => (l.counted_qty || 0) < (l.expected_qty || 0)).length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="found" className="gap-1.5">
                  Pronađeno
                </TabsTrigger>
                <TabsTrigger value="surplus" className="gap-1.5">
                  Višak
                  {totalSurplus > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-amber-500/20 text-amber-500 border-none font-bold">
                      {lines?.filter((l) => (l.counted_qty || 0) > (l.expected_qty || 0)).length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtriraj stavke (naziv, šifra, lokacija)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50 h-9"
              />
            </div>
          </div>

          {/* Table Content */}
          {linesLoading ? (
            <div className="p-12 text-center text-muted-foreground">Učitavanje stavki...</div>
          ) : !filteredLines.length ? (
            <div className="p-12 text-center space-y-3">
              <PackageSearch className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold text-foreground">Nema stavki koje odgovaraju zadatom filteru</p>
              <p className="text-xs text-muted-foreground">Pokušaj da promeniš pretragu ili izabereš tab „Sve”.</p>
            </div>
          ) : (
            <div className="border border-border/70 rounded-xl overflow-hidden divide-y divide-border/60">
              {/* Header row */}
              <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3 text-xs font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider">
                <div className="col-span-2">Šifra / ID</div>
                <div className="col-span-4">Naziv Artikla & Detalji</div>
                <div className="col-span-2">Knjigovodstveno</div>
                <div className="col-span-2 text-center">Fizički Popisano</div>
                <div className="col-span-2 text-right">Status / Akcija</div>
              </div>

              {/* Rows */}
              {filteredLines.map((l) => {
                const asset = l.assets;
                const expected = l.expected_qty || 0;
                const counted = l.counted_qty || 0;
                const diff = counted - expected;
                const isFound = counted >= expected && expected > 0;
                const isOver = counted > expected;
                const isMissing = counted < expected;

                return (
                  <div
                    key={l.id}
                    className={`grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 px-5 py-3.5 items-center hover:bg-muted/30 transition-colors ${
                      isMissing && counted === 0
                        ? "bg-rose-500/[0.02]"
                        : isOver
                        ? "bg-amber-500/[0.02]"
                        : ""
                    }`}
                  >
                    {/* Code & S/N */}
                    <div className="lg:col-span-2 space-y-0.5">
                      <span className="font-mono text-xs font-bold text-primary tracking-wider block">
                        {asset?.code || "BEZ ŠIFRE"}
                      </span>
                      {asset?.serial_number && (
                        <span className="text-[10px] text-muted-foreground font-mono block">
                          S/N: {asset.serial_number}
                        </span>
                      )}
                    </div>

                    {/* Name, Category, Location, Note */}
                    <div className="lg:col-span-4 space-y-1">
                      <div className="font-bold text-sm text-foreground leading-tight">
                        {asset?.name || "Nepoznat artikal"}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {asset?.locations?.name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground/70" />
                            {asset.locations.name}
                          </span>
                        )}
                        {asset?.categories?.name && (
                          <span>· {asset.categories.name}</span>
                        )}
                      </div>

                      {/* Display Note if exists */}
                      {l.note && (
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted text-[11px] text-muted-foreground italic">
                          <MessageSquare className="h-3 w-3 text-primary shrink-0" />
                          <span>{l.note}</span>
                        </div>
                      )}
                    </div>

                    {/* Expected Qty */}
                    <div className="lg:col-span-2 text-xs">
                      <span className="lg:hidden text-muted-foreground">Očekivano: </span>
                      <span className="font-mono font-semibold text-foreground">{expected} kom</span>
                    </div>

                    {/* Counted Quantity Controller */}
                    <div className="lg:col-span-2 flex items-center lg:justify-center gap-2">
                      <span className="lg:hidden text-xs text-muted-foreground">Popisano: </span>
                      {isOpen ? (
                        <div className="flex items-center gap-1.5 bg-background border border-border/80 rounded-lg p-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded"
                            onClick={() => updateQtyMut.mutate({ lineId: l.id, newQty: counted - 1 })}
                            disabled={counted <= 0}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="font-mono text-sm font-bold w-9 text-center text-foreground">
                            {counted}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded"
                            onClick={() => updateQtyMut.mutate({ lineId: l.id, newQty: counted + 1 })}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="font-mono text-sm font-bold text-foreground">
                          {counted} kom
                        </span>
                      )}
                    </div>

                    {/* Status & Actions */}
                    <div className="lg:col-span-2 flex items-center justify-between lg:justify-end gap-2">
                      <div>
                        {isFound && !isOver ? (
                          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1 text-[11px]">
                            <Check className="h-3 w-3" /> U redu
                          </Badge>
                        ) : isOver ? (
                          <Badge variant="outline" className="bg-amber-500/15 text-amber-500 border-amber-500/30 gap-1 text-[11px]">
                            Višak (+{diff})
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-500/15 text-rose-500 border-rose-500/30 gap-1 text-[11px]">
                            Fali ({diff})
                          </Badge>
                        )}
                      </div>

                      {isOpen && (
                        <div className="flex items-center gap-1">
                          {/* Quick match button if counted != expected */}
                          {counted !== expected && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Potvrdi očekivano stanje"
                              className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                              onClick={() => updateQtyMut.mutate({ lineId: l.id, newQty: expected })}
                            >
                              Sravni
                            </Button>
                          )}

                          {/* Edit Note Button */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Dodaj/izmeni napomenu"
                            onClick={() => setEditingNoteLine({ id: l.id, name: asset?.name || "", note: l.note || "" })}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL: Printable Official Zapisnik */}
      <InventoryPrintReport
        open={reportOpen}
        onOpenChange={setReportOpen}
        inventory={{
          id: inv.id,
          name: inv.name,
          type: inv.type,
          status: inv.status,
          started_at: inv.started_at,
          completed_at: inv.completed_at,
          notes: inv.notes,
          locations: (inv as any).locations,
        }}
        lines={lines || []}
      />

      {/* MODAL: Complete Audit Confirmation & Auto-Reconciliation */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Zaključivanje popisa opreme
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <p className="text-muted-foreground">
              Pre zaključivanja, pregledaj rekapitulaciju utvrđenog stanja:
            </p>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-lg bg-muted/60 border border-border">
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Popisano</div>
                <div className="text-base font-black text-emerald-500 mt-0.5">{totalCounted}</div>
              </div>
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <div className="text-[10px] text-rose-500 uppercase font-bold">Manjak</div>
                <div className="text-base font-black text-rose-500 mt-0.5">{totalMissing}</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="text-[10px] text-amber-500 uppercase font-bold">Višak</div>
                <div className="text-base font-black text-amber-500 mt-0.5">{totalSurplus}</div>
              </div>
            </div>

            {/* Reconciliation Checkbox */}
            {inv.location_id && (
              <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-primary/10 border border-primary/20">
                <Checkbox
                  id="reconcile"
                  checked={reconcileLocations}
                  onCheckedChange={(c) => setReconcileLocations(!!c)}
                />
                <div className="grid gap-1 leading-none">
                  <label htmlFor="reconcile" className="text-xs font-bold text-foreground cursor-pointer">
                    Automatski ažuriraj trenutnu lokaciju pronađene opreme
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Svim pronađenim artiklima u bazi biće postavljena lokacija „{(inv as any).locations?.name}”.
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground italic">
              Nakon zaključivanja, podaci postaju trajno arhivirani i ne mogu se više menjati.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              Nazad
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              onClick={() => completeMut.mutate()}
              disabled={completeMut.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              {completeMut.isPending ? "Zaključivanje..." : "Potvrdi i zaključi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Add Unlisted Asset */}
      <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Dodaj vanrednu stavku u popis
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Pretraži artikal po nazivu, šifri ili serijskom broju</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="npr. Mikrofon Shure, KABL-01..."
                  value={assetSearchQuery}
                  onChange={(e) => setAssetSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 border border-border/70 rounded-xl p-2 bg-muted/20">
              {searchingAssets ? (
                <p className="text-xs text-center text-muted-foreground py-4">Pretraga baze...</p>
              ) : !searchableAssets?.length ? (
                <p className="text-xs text-center text-muted-foreground py-4">
                  {assetSearchQuery.trim().length < 2
                    ? "Unesi najmanje 2 slova za pretragu..."
                    : "Nema pronađenih artikala."}
                </p>
              ) : (
                searchableAssets.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-background hover:bg-accent/40 transition-colors border border-border/50 text-xs"
                  >
                    <div>
                      <div className="font-bold text-foreground">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {a.code} {a.serial_number && `· S/N: ${a.serial_number}`}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => addAssetMut.mutate(a.id)}
                      disabled={addAssetMut.isPending}
                    >
                      <Plus className="h-3 w-3" /> Dodaj
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAssetOpen(false)}>
              Zatvori
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Edit Item Note */}
      {editingNoteLine && (
        <Dialog open={!!editingNoteLine} onOpenChange={(open) => !open && setEditingNoteLine(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Napomena za stavku
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <p className="font-semibold text-foreground">{editingNoteLine.name}</p>
              <Input
                placeholder="npr. Nađeno bez kutije, oštećen konektor..."
                value={editingNoteLine.note}
                onChange={(e) =>
                  setEditingNoteLine({ ...editingNoteLine, note: e.target.value })
                }
              />
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setEditingNoteLine(null)}>
                Odustani
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  saveNoteMut.mutate({ lineId: editingNoteLine.id, note: editingNoteLine.note })
                }
                disabled={saveNoteMut.isPending}
              >
                Sačuvaj
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageContainer>
  );
}
