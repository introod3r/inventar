import { Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
} from "lucide-react";
import { formatRSD } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";
import { type QrItem } from "@/lib/qr-print";
import { exportCsv } from "@/lib/csv";
import { toast } from "sonner";
import { ImportAssetsDialog } from "@/components/assets/ImportAssetsDialog";
import { PrintQrDialog } from "@/components/assets/PrintQrDialog";

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
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    bg: "bg-emerald-950/80 border-emerald-500/40 text-emerald-300",
  },
  at_event: {
    label: "NA DOGAĐAJU",
    dot: "bg-blue-400",
    text: "text-blue-400",
    bg: "bg-blue-950/80 border-blue-500/40 text-blue-300",
  },
  in_service: {
    label: "NA SERVISU",
    dot: "bg-rose-400",
    text: "text-rose-400",
    bg: "bg-rose-950/80 border-rose-500/40 text-rose-300",
  },
  in_transit: {
    label: "U TRANSPORTU",
    dot: "bg-purple-400",
    text: "text-purple-400",
    bg: "bg-purple-950/80 border-purple-500/40 text-purple-300",
  },
  damaged: {
    label: "OŠTEĆENO",
    dot: "bg-amber-400",
    text: "text-amber-400",
    bg: "bg-amber-950/80 border-amber-500/40 text-amber-300",
  },
  reserved: {
    label: "REZERVISANO",
    dot: "bg-sky-400",
    text: "text-sky-400",
    bg: "bg-sky-950/80 border-sky-500/40 text-sky-300",
  },
  returned: {
    label: "VRAĆENO",
    dot: "bg-teal-400",
    text: "text-teal-400",
    bg: "bg-teal-950/80 border-teal-500/40 text-teal-300",
  },
  written_off: {
    label: "RASHODOVANO",
    dot: "bg-slate-400",
    text: "text-slate-400",
    bg: "bg-slate-900/80 border-slate-700/40 text-slate-300",
  },
};

function assetPhotoUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const { data } = supabase.storage.from("asset-photos").getPublicUrl(path);
  return data.publicUrl;
}

type SortField = "name" | "code" | "locations" | "current_value" | "status";

export default function AssetsList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AssetStatus | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDesc, setSortDesc] = useState(false);

  // QR Print Dialog State
  const [qrPrintOpen, setQrPrintOpen] = useState(false);
  const [qrPrintItems, setQrPrintItems] = useState<QrItem[]>([]);
  const [qrDialogTitle, setQrDialogTitle] = useState<string>("");

  const qc = useQueryClient();

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

  const { data: assets, isLoading } = useQuery({
    queryKey: ["assets", q, status, category],
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
    onError: (e) => toast.error(e.message),
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
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={onPrintAll} className="border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10">
              <Printer className="mr-2 h-4 w-4" /> Štampaj sve QR
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Uvoz CSV/XML
            </Button>
            <Button variant="outline" onClick={onExportCsv}>
              <FileDown className="mr-2 h-4 w-4" /> Izvoz CSV
            </Button>
            <Button asChild>
              <Link to="/assets/new">
                <Plus className="mr-2 h-4 w-4" /> Nova oprema
              </Link>
            </Button>
          </div>
        }
      />

      {/* Top Filter & Toolbar Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pretraži po nazivu, šifri, serijskom broju ili QR kodu…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 bg-slate-900/60 border-slate-800 focus-visible:ring-primary/50 text-sm h-10 rounded-lg"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as AssetStatus | "all")}
          >
            <SelectTrigger className="w-full sm:w-44 bg-slate-900/60 border-slate-800 h-10 rounded-lg text-sm">
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
            <SelectTrigger className="w-full sm:w-48 bg-slate-900/60 border-slate-800 h-10 rounded-lg text-sm">
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

      {/* Selected Action Bar */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-2.5 px-4 text-sm shadow-sm backdrop-blur-md">
          <span className="font-semibold text-primary">{selected.size} izabrano</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select onValueChange={(val) => updateStatus.mutate(val as AssetStatus)}>
              <SelectTrigger className="h-8.5 w-40 bg-background text-xs rounded-lg">
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
              onClick={onPrintSelected}
              className="h-8.5 text-xs rounded-lg border-cyan-500/40 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20"
            >
              <Printer className="mr-2 h-3.5 w-3.5" /> QR nalepnice ({selected.size})
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

                  {/* Multi-select check icon overlay on hover/select */}
                  <div
                    className="absolute bottom-2.5 left-2.5 p-1 rounded-lg bg-black/50 backdrop-blur-xs hover:bg-black/80 transition cursor-pointer"
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
                          : "border-white/40 bg-black/40 hover:border-white/80"
                      }`}
                    >
                      {isSel && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={3} />}
                    </div>
                  </div>
                </div>

                {/* Card Info Content */}
                <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-100 text-base tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
                      {a.name}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1.5 min-h-8 leading-relaxed">
                      {a.description || "Nema unetog opisa za ovaj komad opreme."}
                    </p>
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
                className="col-span-2 text-right cursor-pointer select-none flex items-center justify-end gap-1 hover:text-foreground transition-colors"
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
            </div>
            {sortedAssets.map((a) => {
              const loc = (a as unknown as { locations: { name: string } | null })
                .locations;
              const isSel = selected.has(a.id);
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
                  <div className="col-span-10 md:col-span-3 flex items-center gap-3 min-w-0">
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
                  <div className="hidden md:block col-span-2 text-right">
                    <AssetStatusBadge status={a.status} />
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
    </PageContainer>
  );
}
