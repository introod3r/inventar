import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MapPin, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";

type LocType = Database["public"]["Enums"]["location_type"];

const TYPE_LABELS: Record<string, string> = {
  magacin: "Magacin",
  polica: "Polica",
  sektor: "Sektor",
  vozilo: "Vozilo",
  terenska_lokacija: "Terenska lokacija",
  backstage: "Backstage",
  event_zona: "Event zona",
};

type Form = { id?: string; name: string; type: LocType; parent_id: string };
const empty: Form = { name: "", type: "magacin" as LocType, parent_id: "" };

export default function LocationsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);

  const { data: locations, isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => (await supabase.from("locations").select("*").order("name")).data ?? [],
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
      toast.success(form.id ? "Lokacija izmenjena" : "Lokacija dodata");
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
      toast.success("Obrisano");
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Lokacije"
        description="Magacini, police, vozila, event zone"
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm(empty)}><Plus className="mr-2 h-4 w-4" />Nova lokacija</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{form.id ? "Izmeni lokaciju" : "Nova lokacija"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Naziv</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tip</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as LocType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_LABELS) as LocType[]).map((t) => (
                        <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nadređena lokacija (opciono)</Label>
                  <Select value={form.parent_id || "__none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "__none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Nema —</SelectItem>
                      {locations?.filter((l) => l.id !== form.id).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>Sačuvaj</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="card-elevated">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">Učitavanje…</div>
          ) : !locations?.length ? (
            <div className="p-12 text-center">
              <MapPin className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium">Nema lokacija</h3>
              <p className="text-sm text-muted-foreground mt-1">Dodaj prvi magacin.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {locations.map((l) => {
                const parent = locations.find((x) => x.id === l.parent_id);
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid place-items-center w-9 h-9 rounded-md bg-primary/10 text-primary shrink-0">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{l.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {(TYPE_LABELS[l.type] || l.type)}{parent && <> · u: {parent.name}</>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" aria-label="Izmeni" onClick={() => { setForm({ id: l.id, name: l.name, type: l.type, parent_id: l.parent_id ?? "" }); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDelete
                        title={`Obrisati lokaciju „${l.name}"?`}
                        description="Ako lokacija sadrži opremu ili podlokacije, brisanje može biti odbijeno."
                        onConfirm={() => remove.mutate(l.id)}
                      />
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
