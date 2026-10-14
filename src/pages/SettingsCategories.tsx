import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FolderTree, Loader2 } from "lucide-react";
type Category = {
  id: string;
  name: string;
  icon: string | null;
  parent_id: string | null;
};



export default function SettingsCategories() {
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", icon: "", parent_id: "none" });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,icon,parent_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["categories-asset-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("category_id");
      if (error) throw error;
      const map = new Map<string, number>();
      for (const a of data ?? []) {
        if (a.category_id) map.set(a.category_id, (map.get(a.category_id) ?? 0) + 1);
      }
      return map;
    },
  });

  const startCreate = () => {
    setEditing(null);
    setForm({ name: "", icon: "", parent_id: "none" });
    setOpen(true);
  };
  const startEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, icon: c.icon ?? "", parent_id: c.parent_id ?? "none" });
    setOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Naziv je obavezan");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        icon: form.icon.trim() || null,
        parent_id: form.parent_id === "none" ? null : form.parent_id,
      };
      if (editing) {
        const { error } = await supabase.from("categories").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Kategorija ažurirana");
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
        toast.success("Kategorija kreirana");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["categories-admin"] });
      qc.invalidateQueries({ queryKey: ["categories-flat"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!toDelete) return;
    try {
      const inUse = (counts?.get(toDelete.id) ?? 0) > 0;
      if (inUse) {
        toast.error("Ne možeš obrisati kategoriju koja se koristi");
        setToDelete(null);
        return;
      }
      const { error } = await supabase.from("categories").delete().eq("id", toDelete.id);
      if (error) throw error;
      toast.success("Kategorija obrisana");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["categories-admin"] });
      qc.invalidateQueries({ queryKey: ["categories-flat"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const parentName = (id: string | null) =>
    id ? categories?.find((c) => c.id === id)?.name ?? "—" : "—";

  return (
    <PageContainer>
      <PageHeader
        title="Kategorije opreme"
        description="Organizacija opreme po grupama (npr. Audio, Rasveta, Video…)"
        actions={
          <Button onClick={startCreate}>
            <Plus className="mr-2 h-4 w-4" /> Nova kategorija
          </Button>
        }
      />

      <Card className="overflow-hidden card-elevated">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground">Učitavanje…</div>
        ) : !categories?.length ? (
          <div className="p-12 text-center">
            <FolderTree className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium">Nema kategorija</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Dodaj prvu kategoriju da grupišeš opremu.
            </p>
            <Button className="mt-4" onClick={startCreate}>
              <Plus className="mr-2 h-4 w-4" /> Nova kategorija
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground bg-muted/40">
              <div className="col-span-5">Naziv</div>
              <div className="col-span-3">Nadkategorija</div>
              <div className="col-span-2 text-right">Stavki</div>
              <div className="col-span-2 text-right">Akcije</div>
            </div>
            {categories.map((c) => {
              const count = counts?.get(c.id) ?? 0;
              return (
                <div key={c.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center">
                  <div className="col-span-12 md:col-span-5 font-medium flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                    {c.name}
                  </div>
                  <div className="col-span-6 md:col-span-3 text-sm text-muted-foreground">
                    {parentName(c.parent_id)}
                  </div>
                  <div className="col-span-6 md:col-span-2 text-sm text-right">{count}</div>
                  <div className="col-span-12 md:col-span-2 flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(c)} aria-label="Izmeni">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToDelete(c)}
                      aria-label="Obriši"
                      disabled={count > 0}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Izmeni kategoriju" : "Nova kategorija"}</DialogTitle>
            <DialogDescription>Definiši naziv i opciono nadkategoriju.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Naziv *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="npr. Audio, Rasveta, Video"
                required
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ikonica (opciono)</Label>
              <Input
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="npr. 🎧"
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nadkategorija (opciono)</Label>
              <Select
                value={form.parent_id}
                onValueChange={(v) => setForm({ ...form, parent_id: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— bez —</SelectItem>
                  {(categories ?? [])
                    .filter((c) => c.id !== editing?.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Otkaži
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Sačuvaj" : "Kreiraj"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obrisati kategoriju?</AlertDialogTitle>
            <AlertDialogDescription>
              Kategorija „{toDelete?.name}" će biti trajno obrisana.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Otkaži</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Obriši</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
