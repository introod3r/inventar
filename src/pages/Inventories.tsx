import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardList, 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  MapPin, 
  Calendar, 
  ArrowRight, 
  Sparkles,
  Layers,
  Boxes
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";
import { useAuth } from "@/features/auth/use-auth";

type InvType = Database["public"]["Enums"]["inventory_type"];
type InvStatus = Database["public"]["Enums"]["inventory_status"];

interface InventoryWithRelations {
  id: string;
  name: string;
  type: InvType;
  status: InvStatus;
  started_at: string;
  completed_at: string | null;
  location_id: string | null;
  notes: string | null;
  locations: { name: string } | null;
  inventory_lines: Array<{
    id: string;
    expected_qty: number;
    counted_qty: number | null;
  }>;
}

export default function Inventories() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("inventory");

  // Filters & State
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");

  // Form State
  const [form, setForm] = useState<{
    name: string;
    type: InvType;
    location_id: string;
    category_id: string;
    notes: string;
  }>({
    name: "",
    type: "regular",
    location_id: "",
    category_id: "",
    notes: "",
  });

  // Query: Inventories with lines
  const { data: inventories, isLoading } = useQuery({
    queryKey: ["inventories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventories")
        .select("*, locations:location_id(name), inventory_lines(id, expected_qty, counted_qty)")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as InventoryWithRelations[]) ?? [];
    },
  });

  // Query: Locations
  const { data: locations } = useQuery({
    queryKey: ["locations-flat"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Query: Categories
  const { data: categories } = useQuery({
    queryKey: ["categories-flat"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Estimate assets for new audit dialog
  const { data: estimatedAssetsCount } = useQuery({
    queryKey: ["estimate-audit-assets", form.location_id, form.category_id],
    enabled: open,
    queryFn: async () => {
      let q = supabase.from("assets").select("id", { count: "exact", head: true });
      if (form.location_id) q = q.eq("current_location_id", form.location_id);
      if (form.category_id) q = q.eq("category_id", form.category_id);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Helper to suggest name based on date and location
  const handleGenerateName = () => {
    const locName = locations?.find((l) => l.id === form.location_id)?.name;
    const dateStr = new Date().toLocaleDateString("sr-RS", { month: "long", year: "numeric" });
    const capitalizedMonth = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    const typeLabel = form.type === "regular" ? "Redovni popis" : "Vanredni popis";
    const generated = `${typeLabel} — ${locName || "Svi magacini"} (${capitalizedMonth})`;
    setForm((f) => ({ ...f, name: generated }));
  };

  // Delete mutation
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Popis obrisan");
      qc.invalidateQueries({ queryKey: ["inventories"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Create mutation
  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();

      // 1) Create inventory record
      const { data: inv, error } = await supabase
        .from("inventories")
        .insert({
          name: form.name.trim(),
          type: form.type,
          location_id: form.location_id || null,
          started_by: user?.id ?? null,
          notes: form.notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // 2) Seed expected lines from assets at location (and category if specified)
      let q = supabase.from("assets").select("id, quantity");
      if (form.location_id) q = q.eq("current_location_id", form.location_id);
      if (form.category_id) q = q.eq("category_id", form.category_id);

      const { data: assets, error: e2 } = await q;
      if (e2) throw e2;

      if (assets?.length) {
        const lines = assets.map((a) => ({
          inventory_id: inv.id,
          asset_id: a.id,
          expected_qty: a.quantity ?? 1,
        }));
        const { error: e3 } = await supabase.from("inventory_lines").insert(lines);
        if (e3) throw e3;
      }
      return inv.id;
    },
    onSuccess: (newId) => {
      toast.success("Popis je uspešno pokrenut!");
      setOpen(false);
      setForm({ name: "", type: "regular", location_id: "", category_id: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["inventories"] });
      navigate(`/inventories/${newId}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // KPI Calculations
  const stats = useMemo(() => {
    if (!inventories) return { active: 0, completed: 0, totalCounted: 0, accuracy: 100 };
    const active = inventories.filter((i) => i.status === "open").length;
    const completed = inventories.filter((i) => i.status === "completed").length;

    let totalExp = 0;
    let totalFound = 0;
    let totalCounted = 0;

    inventories.forEach((inv) => {
      inv.inventory_lines.forEach((l) => {
        const exp = l.expected_qty || 0;
        const cnt = l.counted_qty || 0;
        totalExp += exp;
        totalCounted += cnt;
        totalFound += Math.min(cnt, exp);
      });
    });

    const accuracy = totalExp > 0 ? Math.round((totalFound / totalExp) * 100) : 100;
    return { active, completed, totalCounted, accuracy };
  }, [inventories]);

  // Filtered Inventories List
  const filteredInventories = useMemo(() => {
    if (!inventories) return [];
    return inventories.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (locationFilter !== "all" && (i.location_id || "") !== locationFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = i.name.toLowerCase().includes(q);
        const matchesLoc = i.locations?.name?.toLowerCase().includes(q);
        if (!matchesName && !matchesLoc) return false;
      }
      return true;
    });
  }, [inventories, statusFilter, locationFilter, search]);

  return (
    <PageContainer>
      <PageHeader
        title="Popisi Opreme"
        description="Redovno i vanredno sravnjivanje stanja zaliha, lokacija i opreme"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4" />
                Pokreni novi popis
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md md:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Pokretanje novog popisa
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Name & Quick Auto-Generator */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="audit-name">Naziv popisa</Label>
                    <button
                      type="button"
                      onClick={handleGenerateName}
                      className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                    >
                      <Sparkles className="h-3 w-3" /> Predloži naziv
                    </button>
                  </div>
                  <Input
                    id="audit-name"
                    placeholder="npr. Redovni popis — Glavni magacin"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                {/* Type Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Tip popisa</Label>
                    <Select
                      value={form.type}
                      onValueChange={(v) => setForm({ ...form, type: v as InvType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Redovni (Godišnji/Periodični)</SelectItem>
                        <SelectItem value="ad_hoc">Vanredni (Kontrolni/Brzi)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Location Selection */}
                  <div className="space-y-1.5">
                    <Label>Lokacija / Magacin</Label>
                    <Select
                      value={form.location_id || "__all"}
                      onValueChange={(v) => setForm({ ...form, location_id: v === "__all" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sve lokacije" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">— Sve lokacije —</SelectItem>
                        {locations?.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Category Scope Selection */}
                <div className="space-y-1.5">
                  <Label>Kategorija opreme (Opciono)</Label>
                  <Select
                    value={form.category_id || "__all"}
                    onValueChange={(v) => setForm({ ...form, category_id: v === "__all" ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sve kategorije (kompletan inventar)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">— Sve kategorije —</SelectItem>
                      {categories?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes / Instructions */}
                <div className="space-y-1.5">
                  <Label htmlFor="audit-notes">Zadatak / Napomene za komisiju</Label>
                  <Textarea
                    id="audit-notes"
                    placeholder="npr. Obratiti pažnju na numeraciju mikrofona i oštećene kablove..."
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>

                {/* Estimate info banner */}
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary">
                  <Boxes className="h-4 w-4 shrink-0" />
                  <span>
                    Ovaj popis će obuhvatiti približno <strong>{estimatedAssetsCount ?? 0} artikala</strong> iz baze.
                  </span>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Odustani
                </Button>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!form.name.trim() || create.isPending}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {create.isPending ? "Pokretanje..." : "Pokreni popis"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="glass-card">
          <CardContent className="p-4 md:p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Aktivni popisi</p>
              <div className="flex items-center gap-2 mt-0.5">
                <h3 className="text-2xl font-bold text-foreground">{stats.active}</h3>
                {stats.active > 0 && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4 md:p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Završeni popisi</p>
              <h3 className="text-2xl font-bold text-foreground mt-0.5">{stats.completed}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4 md:p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 shrink-0">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Popisano komada</p>
              <h3 className="text-2xl font-bold text-foreground mt-0.5">{stats.totalCounted}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-4 md:p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Stopa tačnosti</p>
              <h3 className="text-2xl font-bold text-foreground mt-0.5">{stats.accuracy}%</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-6">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full md:w-auto">
          <TabsList className="grid grid-cols-4 w-full md:w-auto">
            <TabsTrigger value="all">Svi</TabsTrigger>
            <TabsTrigger value="open" className="gap-1.5">
              U toku
              {stats.active > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-amber-500/20 text-amber-500 border-none">
                  {stats.active}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">Završeni</TabsTrigger>
            <TabsTrigger value="cancelled">Otkazani</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pretraži popise..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50"
            />
          </div>

          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-40 bg-background/50 shrink-0">
              <SelectValue placeholder="Lokacija" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve lokacije</SelectItem>
              {locations?.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Inventories Cards List */}
      <div className="space-y-3.5">
        {isLoading ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center text-muted-foreground">
              Učitavanje popisa...
            </CardContent>
          </Card>
        ) : !filteredInventories.length ? (
          <Card className="glass-card">
            <CardContent className="p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <ClipboardList className="h-8 w-8" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="font-semibold text-foreground">Nema pronađenih popisa</h3>
                <p className="text-xs text-muted-foreground">
                  {search || statusFilter !== "all" || locationFilter !== "all"
                    ? "Pokušaj sa drugačijim kriterijumima pretrage ili filterima."
                    : "Još uvek nije pokrenut nijedan popis opreme. Klikni na dugme iznad za novi popis."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredInventories.map((inv) => {
            const lines = inv.inventory_lines || [];
            const totalExp = lines.reduce((acc, l) => acc + (l.expected_qty || 0), 0);
            const totalCounted = lines.reduce((acc, l) => acc + (l.counted_qty || 0), 0);
            const progress = totalExp > 0 ? Math.min(100, Math.round((totalCounted / totalExp) * 100)) : 0;
            const isOpen = inv.status === "open";
            const isCompleted = inv.status === "completed";

            return (
              <Card 
                key={inv.id} 
                className="glass-card hover:border-primary/40 transition-all duration-200 group overflow-hidden"
              >
                <CardContent className="p-5 md:p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Left: Metadata */}
                    <div className="space-y-2.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Type Badge */}
                        <Badge 
                          variant="outline" 
                          className={inv.type === "regular" 
                            ? "bg-blue-500/10 text-blue-500 border-blue-500/20 font-medium" 
                            : "bg-purple-500/10 text-purple-500 border-purple-500/20 font-medium"
                          }
                        >
                          {inv.type === "regular" ? "Redovni popis" : "Vanredni popis"}
                        </Badge>

                        {/* Status Badge */}
                        <Badge 
                          variant="outline"
                          className={isOpen
                            ? "bg-amber-500/15 text-amber-500 border-amber-500/30 font-semibold gap-1.5"
                            : isCompleted
                            ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-semibold gap-1.5"
                            : "bg-rose-500/15 text-rose-500 border-rose-500/30 font-semibold"
                          }
                        >
                          {isOpen && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
                          {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                          {isOpen ? "U TOKU" : isCompleted ? "ZAVRŠEN" : "OTKAZAN"}
                        </Badge>

                        {/* Location */}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
                          {inv.locations?.name || "Sve lokacije"}
                        </span>
                      </div>

                      {/* Title */}
                      <Link 
                        to={`/inventories/${inv.id}`}
                        className="block font-bold text-base md:text-lg text-foreground hover:text-primary transition-colors truncate"
                      >
                        {inv.name}
                      </Link>

                      {/* Dates & Notes */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Započeto: {formatDateTime(inv.started_at)}
                        </span>
                        {inv.completed_at && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            Završeno: {formatDateTime(inv.completed_at)}
                          </span>
                        )}
                        {inv.notes && (
                          <span className="italic truncate max-w-xs text-muted-foreground/80">
                            „{inv.notes}”
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Center: Progress Bar & Quantities */}
                    <div className="w-full lg:w-72 shrink-0 space-y-2 bg-muted/40 p-3.5 rounded-xl border border-border/50">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-primary" />
                          Progres: {progress}%
                        </span>
                        <span className="font-mono text-muted-foreground font-semibold">
                          {totalCounted} / {totalExp} kom
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                        <span>Stavki u popisu: <strong>{lines.length}</strong></span>
                        {totalCounted < totalExp ? (
                          <span className="text-amber-500 font-medium">Preostalo: {totalExp - totalCounted}</span>
                        ) : (
                          <span className="text-emerald-500 font-medium">Sve popisano</span>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 justify-end shrink-0">
                      <Button
                        asChild
                        variant={isOpen ? "default" : "outline"}
                        size="sm"
                        className={isOpen ? "gap-2 shadow-md shadow-primary/20" : "gap-2"}
                      >
                        <Link to={`/inventories/${inv.id}`}>
                          {isOpen ? "Nastavi popis" : "Pregled izveštaja"}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>

                      {canManage && (
                        <ConfirmDelete
                          title={`Obrisati popis „${inv.name}"?`}
                          description="Brisanje uklanja sve podatke i zabeležene stavke ovog popisa. Ova akcija je nepovratna."
                          onConfirm={() => remove.mutate(inv.id)}
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </PageContainer>
  );
}
