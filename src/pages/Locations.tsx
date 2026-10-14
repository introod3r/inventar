import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  MapPin,
  Pencil,
  Warehouse,
  Truck,
  Layers,
  Boxes,
  Package,
  Search,
  X,
  ExternalLink,
  ChevronRight,
  Filter
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";

type LocType = Database["public"]["Enums"]["location_type"];

const TYPE_LABELS: Record<string, string> = {
  warehouse: "Magacin",
  shelf: "Polica",
  sector: "Sektor",
  vehicle: "Vozilo",
  field: "Terenska lokacija",
  backstage: "Backstage",
  event_zone: "Event zona",
};

function getLocationIcon(type: string) {
  switch (type) {
    case "warehouse":
      return <Warehouse className="h-4 w-4" />;
    case "vehicle":
      return <Truck className="h-4 w-4" />;
    case "shelf":
    case "sector":
      return <Layers className="h-4 w-4" />;
    default:
      return <MapPin className="h-4 w-4" />;
  }
}

type Form = { id?: string; name: string; type: LocType; parent_id: string };
const empty: Form = { name: "", type: "warehouse" as LocType, parent_id: "" };

export default function LocationsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");

  const { data: locations = [], isLoading: loadingLocations } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => (await supabase.from("locations").select("*").order("name")).data ?? [],
  });

  // Uvid u broj artikala po lokaciji
  const { data: assetCounts = new Map<string, number>(), isLoading: loadingCounts } = useQuery({
    queryKey: ["locations-asset-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("assets").select("current_location_id");
      const map = new Map<string, number>();
      data?.forEach((a) => {
        if (a.current_location_id) {
          map.set(a.current_location_id, (map.get(a.current_location_id) || 0) + 1);
        }
      });
      return map;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), type: form.type, parent_id: form.parent_id || null };
      const { error } = form.id
        ? await supabase.from("locations").update(payload).eq("id", form.id)
        : await supabase.from("locations").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(form.id ? "Lokacija uspešno izmenjena" : "Lokacija uspešno dodata");
      setOpen(false);
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lokacija obrisana");
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["locations-asset-counts"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Filtrirane lokacije
  const filteredLocations = useMemo(() => {
    return locations.filter((l) => {
      const matchesSearch =
        !search.trim() ||
        l.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (TYPE_LABELS[l.type] || l.type).toLowerCase().includes(search.trim().toLowerCase());

      const matchesType = selectedType === "all" || l.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [locations, search, selectedType]);

  // Izračunaj ukupan broj artikala na svim lokacijama
  const totalAssetsAcrossLocations = useMemo(() => {
    let sum = 0;
    assetCounts.forEach((c) => {
      sum += c;
    });
    return sum;
  }, [assetCounts]);

  const isLoading = loadingLocations || loadingCounts;

  return (
    <PageContainer>
      <PageHeader
        title="Lokacije Opreme"
        description="Fizički magacini, regalne police, transportna vozila i terenske lokacije."
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setForm(empty);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => setForm(empty)} className="shadow-sm">
                <Plus className="mr-2 h-4 w-4" /> Nova lokacija
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{form.id ? "Izmeni lokaciju" : "Nova lokacija"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <div className="space-y-1.5">
                  <Label htmlFor="loc-name">Naziv lokacije *</Label>
                  <Input
                    id="loc-name"
                    placeholder="npr. Glavni magacin, Kombi 1, Polica B-04"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loc-type">Tip lokacije</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as LocType })}>
                    <SelectTrigger id="loc-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_LABELS) as LocType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          <div className="flex items-center gap-2">
                            {getLocationIcon(t)}
                            <span>{TYPE_LABELS[t]}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loc-parent">Nadređena lokacija (opciono)</Label>
                  <Select
                    value={form.parent_id || "__none"}
                    onValueChange={(v) => setForm({ ...form, parent_id: v === "__none" ? "" : v })}
                  >
                    <SelectTrigger id="loc-parent">
                      <SelectValue placeholder="— Samostalna lokacija —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Samostalna lokacija (bez nadređene) —</SelectItem>
                      {locations
                        ?.filter((l) => l.id !== form.id)
                        .map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name} ({TYPE_LABELS[l.type] || l.type})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Primer: postavite „Glavni magacin” kao roditelja za „Polica A-01”.
                  </p>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Odustani
                </Button>
                <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
                  {save.isPending ? "Čuvanje..." : "Sačuvaj lokaciju"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* KPI Kartice */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="p-4 rounded-xl border bg-card shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Warehouse className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Ukupno lokacija</div>
            <div className="text-xl font-bold">{locations.length}</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Raspoređeno opreme</div>
            <div className="text-xl font-bold">{totalAssetsAcrossLocations} <span className="text-xs font-normal text-muted-foreground">kom.</span></div>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card shadow-sm col-span-2 sm:col-span-1 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Vozila u floti</div>
            <div className="text-xl font-bold">
              {locations.filter((l) => l.type === "vehicle").length}
            </div>
          </div>
        </div>
      </div>

      {/* Filteri i Pretraga */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po nazivu ili tipu lokacije..."
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
          <Button
            size="sm"
            variant={selectedType === "all" ? "default" : "outline"}
            className="h-8 text-xs shrink-0"
            onClick={() => setSelectedType("all")}
          >
            Sve ({locations.length})
          </Button>
          <Button
            size="sm"
            variant={selectedType === "warehouse" ? "default" : "outline"}
            className="h-8 text-xs shrink-0"
            onClick={() => setSelectedType("warehouse")}
          >
            Magacini
          </Button>
          <Button
            size="sm"
            variant={selectedType === "vehicle" ? "default" : "outline"}
            className="h-8 text-xs shrink-0"
            onClick={() => setSelectedType("vehicle")}
          >
            Vozila
          </Button>
          <Button
            size="sm"
            variant={selectedType === "shelf" ? "default" : "outline"}
            className="h-8 text-xs shrink-0"
            onClick={() => setSelectedType("shelf")}
          >
            Police
          </Button>
        </div>
      </div>

      {/* Spisak lokacija */}
      <Card className="card-elevated overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">Učitavanje lokacija i stanja opreme…</div>
          ) : !locations.length ? (
            <div className="p-12 text-center">
              <Warehouse className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
              <h3 className="font-semibold text-base">Nema definisanih lokacija</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Dodajte prvi magacin, vozilo ili zonu za skladištenje.</p>
              <Button onClick={() => { setForm(empty); setOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Dodaj lokaciju
              </Button>
            </div>
          ) : !filteredLocations.length ? (
            <div className="p-10 text-center">
              <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
              <p className="font-medium text-sm">Nema lokacija koje odgovaraju filteru</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearch(""); setSelectedType("all"); }}>
                Poništi filtere
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {filteredLocations.map((l) => {
                const parent = locations.find((x) => x.id === l.parent_id);
                const count = assetCounts.get(l.id) || 0;
                const isSubLocation = Boolean(l.parent_id);

                return (
                  <li
                    key={l.id}
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors ${
                      isSubLocation ? "pl-6 sm:pl-8 bg-muted/10" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="grid place-items-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
                        {getLocationIcon(l.type)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm sm:text-base text-foreground truncate">
                            {l.name}
                          </span>
                          <Badge variant="outline" className="text-[11px] font-normal py-0 h-5">
                            {TYPE_LABELS[l.type] || l.type}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                          {parent ? (
                            <span className="flex items-center gap-1 text-foreground/70">
                              <span>u: {parent.name}</span>
                              <ChevronRight className="h-3 w-3 opacity-60" />
                            </span>
                          ) : null}
                          <span>
                            Smešteno: <strong className={count > 0 ? "text-primary font-semibold" : "text-muted-foreground"}>{count} komada opreme</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0">
                      {/* Direktni 1-click skok na katalog sa opremom na ovoj lokaciji */}
                      <Button
                        variant="secondary"
                        size="sm"
                        asChild
                        className="h-8 text-xs font-medium"
                      >
                        <Link to={`/assets?location=${l.id}`} title={`Prikaži ${count} artikala na ovoj lokaciji`}>
                          <Package className="h-3.5 w-3.5 mr-1.5 text-primary" />
                          <span>Pregledaj opremu ({count})</span>
                          <ExternalLink className="h-3 w-3 ml-1 opacity-60" />
                        </Link>
                      </Button>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          aria-label="Izmeni lokaciju"
                          onClick={() => {
                            setForm({ id: l.id, name: l.name, type: l.type, parent_id: l.parent_id ?? "" });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmDelete
                          title={`Obrisati lokaciju „${l.name}”?`}
                          description={
                            count > 0
                              ? `PAŽNJA: Na ovoj lokaciji se trenutno nalazi ${count} komada opreme! Prvo premestite opremu na drugu lokaciju pre brisanja.`
                              : "Ako lokacija sadrži podlokacije, brisanje može biti onemogućeno."
                          }
                          onConfirm={() => remove.mutate(l.id)}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
