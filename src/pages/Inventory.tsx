import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AssetStatusBadge, ASSET_STATUS_LABEL } from "@/components/common/StatusBadge";
import {
  Plus,
  Search,
  Package,
  Printer,
  X,
  FileDown,
  Upload,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  MapPin,
  Camera,
  Warehouse,
  MoreHorizontal,
  MoreVertical,
  ShoppingCart,
  Copy,
} from "lucide-react";
import { formatRSD } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";
import { type QrItem } from "@/lib/qr-print";
import { exportCsv } from "@/lib/csv";
import { toast } from "sonner";
import { ImportAssetsDialog } from "@/components/assets/ImportAssetsDialog";
import { PrintQrDialog } from "@/components/assets/PrintQrDialog";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { useScanCart } from "@/features/cart/use-scan-cart";

type AssetStatus = Database["public"]["Enums"]["asset_status"];
const STATUSES: AssetStatus[] = [
  "available",
  "reserved",
  "at_event",
  "in_transit",
  "returned",
  "damaged",
  "in_service",
  "written_off",
];

const STATUS_CONFIG: Record<
  AssetStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  available: {
    label: "DOSTUPNO",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:border-emerald-500/40 dark:text-emerald-300",
  },
  at_event: {
    label: "NA DOGAĐAJU",
    dot: "bg-blue-500 dark:bg-blue-400",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/80 dark:border-blue-500/40 dark:text-blue-300",
  },
  in_service: {
    label: "NA SERVISU",
    dot: "bg-rose-500 dark:bg-rose-400",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/80 dark:border-rose-500/40 dark:text-rose-300",
  },
  in_transit: {
    label: "U TRANSPORTU",
    dot: "bg-purple-500 dark:bg-purple-400",
    text: "text-purple-700 dark:text-purple-400",
    bg: "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/80 dark:border-purple-500/40 dark:text-purple-300",
  },
  damaged: {
    label: "OŠTEĆENO",
    dot: "bg-amber-500 dark:bg-amber-400",
    text: "text-amber-800 dark:text-amber-400",
    bg: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/80 dark:border-amber-500/40 dark:text-amber-300",
  },
  reserved: {
    label: "REZERVISANO",
    dot: "bg-sky-500 dark:bg-sky-400",
    text: "text-sky-700 dark:text-sky-400",
    bg: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/80 dark:border-sky-500/40 dark:text-sky-300",
  },
  returned: {
    label: "VRAĆENO",
    dot: "bg-teal-500 dark:bg-teal-400",
    text: "text-teal-700 dark:text-teal-400",
    bg: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/80 dark:border-teal-500/40 dark:text-teal-300",
  },
  written_off: {
    label: "RASHODOVANO",
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/80 dark:border-slate-700/40 dark:text-slate-300",
  },
};

const STATUS_CHIPS: Array<{ key: AssetStatus | "all"; label: string }> = [
  { key: "all", label: "Sve" },
  { key: "available", label: "Dostupno" },
  { key: "at_event", label: "Na događaju" },
  { key: "in_service", label: "Na servisu" },
  { key: "damaged", label: "Oštećeno" },
  { key: "in_transit", label: "U transportu" },
  { key: "reserved", label: "Rezervisano" },
  { key: "returned", label: "Vraćeno" },
];

function assetPhotoUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const { data } = supabase.storage.from("asset-photos").getPublicUrl(path);
  return data.publicUrl;
}

type SortField = "name" | "code" | "locations" | "current_value" | "status";

export default function AssetsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const locationParam = searchParams.get("location") || "all";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AssetStatus | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [location, setLocation] = useState<string>(locationParam);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [targetLocationId, setTargetLocationId] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDesc, setSortDesc] = useState(false);

  // QR Print Dialog State
  const [qrPrintOpen, setQrPrintOpen] = useState(false);
  const [qrPrintItems, setQrPrintItems] = useState<QrItem[]>([]);
  const [qrDialogTitle, setQrDialogTitle] = useState<string>("");

  const qc = useQueryClient();
  const scanCart = useScanCart();

  useEffect(() => {
    const loc = searchParams.get("location") || "all";
    if (loc !== location) {
      setLocation(loc);
    }
  }, [searchParams, location]);

  const handleLocationChange = (val: string) => {
    setLocation(val);
    const next = new URLSearchParams(searchParams);
    if (val === "all") next.delete("location");
    else next.set("location", val);
    setSearchParams(next);
  };

  const handleAddToCart = (a: { id: string; code: string; name: string; serial_number?: string | null }) => {
    const added = scanCart.add({ id: a.id, code: a.code, name: a.name, serial_number: a.serial_number });
    if (added) {
      toast.success(`„${a.name}” dodat u korpu za izdavanje`);
    } else {
      toast.info(`„${a.name}” je već u korpi`);
    }
  };

  const handleAddSelectedToCart = () => {
    const selectedAssets = (assets ?? []).filter((a) => selected.has(a.id));
    let count = 0;
    selectedAssets.forEach((a) => {
      if (scanCart.add({ id: a.id, code: a.code, name: a.name, serial_number: a.serial_number })) {
        count++;
      }
    });
    if (count > 0) {
      toast.success(`Dodato ${count} stavki u korpu za izdavanje`);
      clearSelection();
    } else {
      toast.info("Izabrane stavke se već nalaze u korpi");
    }
  };

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("id, name, type")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assets, isLoading } = useQuery({
    queryKey: ["assets", q, status, category, location],
    queryFn: async () => {
      let query = supabase
        .from("assets")
        .select(
          "id,code,name,description,serial_number,status,current_value,category_id,current_location_id,locations:current_location_id(name),categories:category_id(name)",
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (status !== "all") query = query.eq("status", status);
      if (category !== "all") query = query.eq("category_id", category);
      if (location !== "all") query = query.eq("current_location_id", location);
      if (q.trim()) {
        const term = q.trim();
        query = query.or(
          `name.ilike.%${term}%,code.ilike.%${term}%,serial_number.ilike.%${term}%`,
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      const assetIds = rows.map((asset) => asset.id);
      if (!assetIds.length)
        return rows.map((asset) => ({ ...asset, thumbnail_path: null }));

      const { data: photoRows, error: photoError } = await supabase
        .from("asset_photos")
        .select("asset_id, storage_path, is_primary, created_at")
        .in("asset_id", assetIds)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });
      if (photoError) throw photoError;

      const thumbnails = new Map<string, string>();
      for (const photo of photoRows ?? []) {
        if (!thumbnails.has(photo.asset_id))
          thumbnails.set(photo.asset_id, photo.storage_path);
      }

      return rows.map((asset) => ({
        ...asset,
        thumbnail_path: thumbnails.get(asset.id) ?? null,
      }));
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (newStatus: AssetStatus) => {
      const ids = Array.from(selected);
      const { error } = await supabase
        .from("assets")
        .update({ status: newStatus })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status ažuriran za izabranu opremu");
      qc.invalidateQueries({ queryKey: ["assets"] });
      clearSelection();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const moveLocation = useMutation({
    mutationFn: async (targetId: string) => {
      const ids = Array.from(selected);
      const { error } = await supabase
        .from("assets")
        .update({ current_location_id: targetId || null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Uspešno premešteno ${selected.size} stavki na novu lokaciju`);
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["locations-asset-counts"] });
      setBulkMoveOpen(false);
      setTargetLocationId("");
      clearSelection();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const allIds = useMemo(() => assets?.map((a) => a.id) ?? [], [assets]);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someChecked = selected.size > 0 && !allChecked;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(false);
    }
  };

  const sortedAssets = useMemo(() => {
    if (!assets) return [];
    return [...assets].sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a];
      let valB: any = b[sortField as keyof typeof b];

      if (sortField === "locations") {
        valA = (a as any).locations?.name ?? "";
        valB = (b as any).locations?.name ?? "";
      } else if (sortField === "status") {
        valA = ASSET_STATUS_LABEL[a.status] ?? a.status;
        valB = ASSET_STATUS_LABEL[b.status] ?? b.status;
      }

      if (valA == null) valA = "";
      if (valB == null) valB = "";

      if (typeof valA === "string" && typeof valB === "string") {
        return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
      }
      if (typeof valA === "number" && typeof valB === "number") {
        return sortDesc ? valB - valA : valA - valB;
      }
      return 0;
    });
  }, [assets, sortField, sortDesc]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: assets?.length ?? 0 };
    (assets ?? []).forEach((a) => {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    });
    return counts;
  }, [assets]);

  const totalValue = useMemo(() => {
    return (sortedAssets ?? []).reduce((acc, a) => acc + (a.current_value ?? 0), 0);
  }, [sortedAssets]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((s) => {
      if (allIds.every((id) => s.has(id))) return new Set();
      return new Set(allIds);
    });
  };
  const clearSelection = () => setSelected(new Set());

  const onPrintSelected = () => {
    const items = (assets ?? [])
      .filter((a) => selected.has(a.id))
      .map((a) => ({ code: a.code, name: a.name, serial: a.serial_number }));
    if (!items.length) {
      toast.error("Nema selektovanih stavki");
      return;
    }
    setQrPrintItems(items);
    setQrDialogTitle(`Štampa QR Nalepnica (${items.length} izabranih)`);
    setQrPrintOpen(true);
  };

  const onPrintAll = async () => {
    let query = supabase
      .from("assets")
      .select("code,name,serial_number")
      .order("code", { ascending: true });
    if (status !== "all") query = query.eq("status", status);
    if (category !== "all") query = query.eq("category_id", category);
    if (location !== "all") query = query.eq("current_location_id", location);
    if (q.trim()) {
      const term = q.trim();
      query = query.or(
        `name.ilike.%${term}%,code.ilike.%${term}%,serial_number.ilike.%${term}%`,
      );
    }
    const { data, error } = await query;
    if (error) {
      toast.error("Greška pri učitavanju opreme");
      return;
    }
    const rows = data ?? [];
    if (!rows.length) {
      toast.error("Nema opreme za štampu");
      return;
    }
    
    setQrPrintItems(
      rows.map((a) => ({ code: a.code, name: a.name, serial: a.serial_number })),
    );
    setQrDialogTitle(`Štampa QR Nalepnica (${rows.length} komada)`);
    setQrPrintOpen(true);
  };

  const onExportCsv = () => {
    const rows = assets ?? [];
    if (!rows.length) {
      toast.error("Nema podataka za izvoz");
      return;
    }
    exportCsv(`oprema-${new Date().toISOString().slice(0, 10)}`, rows, [
      { header: "Šifra", value: (a) => a.code },
      { header: "Naziv", value: (a) => a.name },
      { header: "Serijski broj", value: (a) => a.serial_number ?? "" },
      { header: "Status", value: (a) => a.status },
      {
        header: "Lokacija",
        value: (a) =>
          (a as unknown as { locations: { name: string } | null }).locations?.name ?? "",
      },
      { header: "Trenutna vrednost", value: (a) => a.current_value ?? "" },
    ]);
    toast.success(`Izvezeno ${rows.length} stavki`);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Oprema"
        description="Sva osnovna sredstva i event oprema"
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-1.5 h-9.5 text-sm">
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  <span className="hidden sm:inline">Alati i Izvoz</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={onPrintAll} className="cursor-pointer">
                  <Printer className="mr-2 h-4 w-4 text-cyan-500" /> Štampaj sve QR
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportOpen(true)} className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4 text-blue-500" /> Uvoz CSV/XML
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportCsv} className="cursor-pointer">
                  <FileDown className="mr-2 h-4 w-4 text-emerald-500" /> Izvoz CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button asChild className="gap-1.5 h-9.5 text-sm shadow-sm">
              <Link to="/assets/new">
                <Plus className="h-4 w-4" /> <span>Nova oprema</span>
              </Link>
            </Button>
          </div>
        }
      />

      {/* Top Filter & Toolbar Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Pretraži po nazivu, šifri, serijskom broju ili QR kodu…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 pr-20 bg-slate-900/60 border-slate-800 focus-visible:ring-primary/50 text-sm h-10 rounded-lg"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {q && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setQ("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10"
              onClick={() => setCameraOpen(true)}
              title="Skeniraj barkod ili QR kod opreme kamerom"
            >
              <Camera className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as AssetStatus | "all")}
          >
            <SelectTrigger className="w-full sm:w-40 bg-slate-900/60 border-slate-800 h-10 rounded-lg text-sm">
              <SelectValue placeholder="Svi Statusi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi Statusi</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ASSET_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={(v) => setCategory(v)}>
            <SelectTrigger className="w-full sm:w-44 bg-slate-900/60 border-slate-800 h-10 rounded-lg text-sm">
              <SelectValue placeholder="Sve Kategorije" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve Kategorije</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={location} onValueChange={handleLocationChange}>
            <SelectTrigger className="w-full sm:w-44 bg-slate-900/60 border-slate-800 h-10 rounded-lg text-sm">
              <div className="flex items-center gap-1.5 truncate">
                <Warehouse className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Sve Lokacije" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve Lokacije</SelectItem>
              {locations?.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View Mode Toggle Switcher */}
          <div className="flex items-center bg-slate-900/80 border border-slate-800 rounded-lg p-1 h-10 gap-1 ml-auto sm:ml-0">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className={`h-8 w-8 rounded-md transition ${
                viewMode === "grid"
                  ? "bg-slate-800 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode("grid")}
              title="Prikaz u mreži (Grid)"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className={`h-8 w-8 rounded-md transition ${
                viewMode === "list"
                  ? "bg-slate-800 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode("list")}
              title="Prikaz u listi (Tabela)"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Horizontal Touch-Friendly Quick Status Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none">
        {STATUS_CHIPS.map((chip) => {
          const isActive = status === chip.key;
          const count = statusCounts[chip.key] ?? 0;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setStatus(chip.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 border cursor-pointer ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-slate-900/60 hover:bg-slate-800/80 text-muted-foreground hover:text-foreground border-slate-800"
              }`}
            >
              <span>{chip.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-slate-800 text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* KPI & Summary Bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span>
            Prikazano: <strong className="text-foreground font-semibold">{sortedAssets.length}</strong> od <span className="font-mono">{assets?.length ?? 0}</span> artikala
          </span>
          <span className="hidden sm:inline text-slate-700">•</span>
          <span className="hidden sm:inline">
            Ukupna vrednost: <strong className="text-foreground font-mono font-semibold">{formatRSD(totalValue)}</strong>
          </span>
        </div>
        {selected.size > 0 && (
          <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-[11px] font-semibold">
            {selected.size} izabrano
          </Badge>
        )}
      </div>

      {/* Active Location Filter Badge */}
      {location !== "all" && (
        <div className="mb-3 flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs bg-muted/80 border">
            <Warehouse className="h-3.5 w-3.5 text-primary" />
            <span>Lokacija: <strong>{locations?.find((l) => l.id === location)?.name || "Izabrana lokacija"}</strong></span>
            <button
              type="button"
              onClick={() => handleLocationChange("all")}
              className="ml-1 hover:text-destructive text-muted-foreground cursor-pointer"
              title="Ukloni filter lokacije"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      {/* Selected Action Bar */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-2.5 px-4 text-sm shadow-sm backdrop-blur-md">
          <span className="font-semibold text-primary">{selected.size} izabrano</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddSelectedToCart}
              className="h-8.5 text-xs rounded-lg border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
            >
              <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> U korpu ({selected.size})
            </Button>

            <Select onValueChange={(val) => updateStatus.mutate(val as AssetStatus)}>
              <SelectTrigger className="h-8.5 w-36 bg-background text-xs rounded-lg">
                <SelectValue placeholder="Promeni status" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {ASSET_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkMoveOpen(true)}
              className="h-8.5 text-xs rounded-lg border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20"
            >
              <MapPin className="mr-1.5 h-3.5 w-3.5" /> Premesti
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={onPrintSelected}
              className="h-8.5 text-xs rounded-lg border-cyan-500/40 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20"
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> QR nalepnice
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              className="h-8.5 text-xs px-2.5 rounded-lg"
            >
              <X className="mr-1 h-3.5 w-3.5" /> Poništi
            </Button>
          </div>
        </div>
      )}

      {/* Content Area */}
      {isLoading ? (
        <div className="p-16 text-center text-muted-foreground">Učitavanje opreme…</div>
      ) : !sortedAssets.length ? (
        <Card className="p-12 text-center card-elevated">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-medium text-lg">Nema opreme</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Nismo pronašli stavke za izabrane filtere.
          </p>
          <Button asChild className="mt-4">
            <Link to="/assets/new">
              <Plus className="mr-2 h-4 w-4" />
              Nova oprema
            </Link>
          </Button>
        </Card>
      ) : viewMode === "grid" ? (
        /* GRID VIEW (Desktop card layout matching mockup) */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4.5">
          {sortedAssets.map((a) => {
            const loc = (a as unknown as { locations: { name: string } | null })
              .locations;
            const isSel = selected.has(a.id);
            const statusCfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.available;
            const categoryName = (a as unknown as { categories?: { name: string } | null }).categories?.name;

            return (
              <Link
                key={a.id}
                to={`/assets/${a.id}`}
                className={`group relative flex flex-col justify-between rounded-2xl overflow-hidden border bg-slate-900/70 hover:bg-slate-900/90 transition-all duration-300 hover:border-slate-700 hover:shadow-xl cursor-pointer ${
                  isSel
                    ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                    : "border-slate-800/80"
                }`}
              >
                {/* Photo & Overlays */}
                <div className="relative aspect-16/10 w-full overflow-hidden bg-slate-950">
                  {a.thumbnail_path ? (
                    <img
                      src={assetPhotoUrl(a.thumbnail_path)}
                      alt={a.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 ease-out"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src =
                          "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=80";
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-700 bg-slate-950">
                      <Package className="h-10 w-10 stroke-1" />
                    </div>
                  )}

                  {/* Top-left Code Badge */}
                  <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[11px] font-mono tracking-wider text-slate-200 uppercase font-semibold border border-white/10 shadow-sm">
                    {a.code || "BEZ ŠIFRE"}
                  </div>

                  {/* Top-right Status Badge */}
                  <div
                    className={`absolute top-3 right-3 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border shadow-sm ${statusCfg.bg}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                    <span>{statusCfg.label}</span>
                  </div>

                  {/* Multi-select check icon overlay with ergonomic touch area */}
                  <button
                    type="button"
                    aria-label={`Izaberi ${a.name}`}
                    className="absolute bottom-2.5 left-2.5 h-9 w-9 rounded-lg bg-black/60 backdrop-blur-xs flex items-center justify-center hover:bg-black/80 transition cursor-pointer z-10"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(a.id);
                    }}
                  >
                    <div
                      className={`h-5 w-5 rounded-md border flex items-center justify-center transition ${
                        isSel
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-white/50 bg-black/40 hover:border-white"
                      }`}
                    >
                      {isSel && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={3} />}
                    </div>
                  </button>
                </div>

                {/* Card Info Content */}
                <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-primary/80 uppercase tracking-wider truncate">
                        {categoryName || "Oprema"}
                      </span>
                      {/* 3-Dots Quick Actions Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-slate-800/80 rounded-md -mr-1 transition cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleAddToCart(a);
                            }}
                            className="cursor-pointer"
                          >
                            <ShoppingCart className="mr-2 h-4 w-4 text-emerald-500" /> Dodaj u korpu
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setQrPrintItems([{ code: a.code, name: a.name, serial: a.serial_number }]);
                              setQrDialogTitle(`Štampa QR Nalepnice (${a.code})`);
                              setQrPrintOpen(true);
                            }}
                            className="cursor-pointer"
                          >
                            <Printer className="mr-2 h-4 w-4 text-cyan-500" /> Štampaj QR nalepnicu
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigator.clipboard.writeText(a.code);
                              toast.success(`Kopirana šifra: ${a.code}`);
                            }}
                            className="cursor-pointer"
                          >
                            <Copy className="mr-2 h-4 w-4 text-slate-400" /> Kopiraj šifru
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <h3 className="font-bold text-slate-100 text-base tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
                      {a.name}
                    </h3>
                    {a.description ? (
                      <p className="text-xs text-slate-400 line-clamp-1 mt-1 leading-relaxed">
                        {a.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2 pt-2 text-xs border-t border-slate-800/80">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Serijski Br:</span>
                      <span className="font-mono text-slate-200 font-medium">
                        {a.serial_number || "—"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-400">
                      <span>Lokacija:</span>
                      <span className="flex items-center gap-1.5 text-cyan-400 font-medium truncate max-w-42.5">
                        <MapPin className="h-3.5 w-3.5 text-cyan-400 flex-none" />
                        <span className="truncate">{loc?.name || "—"}</span>
                      </span>
                    </div>
                  </div>

                  {/* Card Footer: Value */}
                  <div className="pt-2.5 border-t border-slate-800/80 flex justify-between items-center text-xs">
                    <span className="text-slate-400">Knjigovodstvena:</span>
                    <span className="font-bold text-sm font-mono text-slate-100">
                      {formatRSD(a.current_value ?? null)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW (Table View) */
        <Card className="overflow-hidden card-elevated">
          <div className="divide-y">
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground bg-muted/40 items-center font-medium">
              <div className="col-span-1">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Izaberi sve"
                />
              </div>
              <div
                className="col-span-3 cursor-pointer select-none flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => handleSort("name")}
              >
                Fotografija / naziv
                {sortField === "name" &&
                  (sortDesc ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ))}
              </div>
              <div
                className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => handleSort("code")}
              >
                Šifra
                {sortField === "code" &&
                  (sortDesc ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ))}
              </div>
              <div
                className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => handleSort("locations")}
              >
                Lokacija
                {sortField === "locations" &&
                  (sortDesc ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ))}
              </div>
              <div
                className="col-span-2 cursor-pointer select-none flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => handleSort("current_value")}
              >
                Vrednost
                {sortField === "current_value" &&
                  (sortDesc ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ))}
              </div>
              <div
                className="col-span-1 text-center cursor-pointer select-none flex items-center justify-center gap-1 hover:text-foreground transition-colors"
                onClick={() => handleSort("status")}
              >
                Status
                {sortField === "status" &&
                  (sortDesc ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ))}
              </div>
              <div className="col-span-1 text-right">
                Akcije
              </div>
            </div>
            {sortedAssets.map((a) => {
              const loc = (a as unknown as { locations: { name: string } | null })
                .locations;
              const isSel = selected.has(a.id);
              const categoryName = (a as unknown as { categories?: { name: string } | null }).categories?.name;
              return (
                <Link
                  key={a.id}
                  to={`/assets/${a.id}`}
                  className={`grid grid-cols-12 gap-3 md:gap-4 px-3 md:px-4 py-3 items-center cursor-pointer hover:bg-accent/40 transition ${
                    isSel
                      ? "bg-primary/5 md:bg-accent/30 ring-1 ring-inset ring-primary/30 md:ring-0"
                      : ""
                  }`}
                >
                  <div
                    className="col-span-2 md:col-span-1 flex items-center justify-center"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(a.id);
                    }}
                  >
                    <div
                      role="checkbox"
                      aria-checked={isSel}
                      aria-label={`Izaberi ${a.name}`}
                      className={`grid place-items-center h-9 w-9 md:h-5 md:w-5 rounded-lg md:rounded border-2 transition ${
                        isSel
                          ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/30"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      {isSel && (
                        <CheckCircle2
                          className="h-5 w-5 md:h-3.5 md:w-3.5"
                          strokeWidth={3}
                        />
                      )}
                    </div>
                  </div>
                  <div className="col-span-8 md:col-span-3 flex items-center gap-3 min-w-0">
                    <div className="h-14 w-14 md:h-12 md:w-12 flex-none overflow-hidden rounded-lg border border-border bg-muted shadow-sm">
                      {a.thumbnail_path ? (
                        <img
                          src={assetPhotoUrl(a.thumbnail_path)}
                          alt={`Fotografija opreme ${a.name}`}
                          className="h-full w-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src =
                              "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300&auto=format&fit=crop&q=80";
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <Package className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {categoryName && (
                        <span className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider block md:hidden">
                          {categoryName}
                        </span>
                      )}
                      <div className="truncate font-medium">{a.name}</div>
                      <div className="truncate text-xs text-muted-foreground font-mono md:hidden">
                        {a.code}
                        {a.serial_number ? ` · S/N ${a.serial_number}` : ""}
                      </div>
                      {a.serial_number && (
                        <div className="hidden md:block truncate text-xs text-muted-foreground">
                          S/N: {a.serial_number}
                        </div>
                      )}
                      <div className="md:hidden mt-1.5 flex items-center gap-2 flex-wrap">
                        <AssetStatusBadge status={a.status} />
                        {loc?.name && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            · {loc.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="hidden md:block col-span-2 text-sm font-mono font-medium">
                    {a.code || "—"}
                  </div>
                  <div className="hidden md:block col-span-2 text-sm text-muted-foreground">
                    {loc?.name ?? "—"}
                  </div>
                  <div className="hidden md:block col-span-2 text-sm font-mono">
                    {formatRSD(a.current_value ?? null)}
                  </div>
                  <div className="hidden md:block col-span-1 text-center">
                    <AssetStatusBadge status={a.status} />
                  </div>
                  <div className="col-span-2 md:col-span-1 flex items-center justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAddToCart(a);
                          }}
                          className="cursor-pointer"
                        >
                          <ShoppingCart className="mr-2 h-4 w-4 text-emerald-500" /> Dodaj u korpu
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setQrPrintItems([{ code: a.code, name: a.name, serial: a.serial_number }]);
                            setQrDialogTitle(`Štampa QR Nalepnice (${a.code})`);
                            setQrPrintOpen(true);
                          }}
                          className="cursor-pointer"
                        >
                          <Printer className="mr-2 h-4 w-4 text-cyan-500" /> Štampaj QR
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigator.clipboard.writeText(a.code);
                            toast.success(`Kopirana šifra: ${a.code}`);
                          }}
                          className="cursor-pointer"
                        >
                          <Copy className="mr-2 h-4 w-4 text-slate-400" /> Kopiraj šifru
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      <ImportAssetsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => qc.invalidateQueries({ queryKey: ["assets"] })}
      />

      <PrintQrDialog
        open={qrPrintOpen}
        onOpenChange={setQrPrintOpen}
        items={qrPrintItems}
        title={qrDialogTitle}
      />

      {/* Dijalog za pretragu skeniranjem kamerom */}
      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent className="max-w-md p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" /> Skeniranje koda opreme
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-xl overflow-hidden mt-2 bg-black min-h-75 flex items-center justify-center">
            {cameraOpen && (
              <CameraScanner
                onScan={(res) => {
                  const code = typeof res === "string" ? res : res.code;
                  setQ(code);
                  setCameraOpen(false);
                  toast.success(`Očitan kod: ${code}`);
                }}
              />
            )}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setCameraOpen(false)}>
              Zatvori
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dijalog za masovno premeštanje na lokaciju */}
      <Dialog open={bulkMoveOpen} onOpenChange={setBulkMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> Premesti selektovanu opremu
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Izaberite novo odredište (magacin, zonu ili vozilo) za <strong>{selected.size}</strong> selektovanih artikala:
            </p>
            <div className="space-y-1.5">
              <Label>Odredišna lokacija</Label>
              <Select value={targetLocationId} onValueChange={setTargetLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Izaberite lokaciju..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Nema / Ukloni trenutnu lokaciju —</SelectItem>
                  {locations?.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkMoveOpen(false)}>
              Odustani
            </Button>
            <Button
              onClick={() => moveLocation.mutate(targetLocationId === "__none" ? "" : targetLocationId)}
              disabled={moveLocation.isPending || !targetLocationId}
            >
              {moveLocation.isPending ? "Premeštanje u toku..." : "Potvrdi premeštanje"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
