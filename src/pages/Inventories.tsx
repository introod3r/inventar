import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Plus } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";
import { useAuth } from "@/features/auth/use-auth";

type InvType = Database["public"]["Enums"]["inventory_type"];



export default function Inventories() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("inventory");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; type: InvType; location_id: string }>({ name: "", type: "regular", location_id: "" });

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

  const { data: inventories, isLoading } = useQuery({
    queryKey: ["inventories"],
    queryFn: async () => (await supabase.from("inventories").select("*, locations:location_id(name)").order("started_at", { ascending: false })).data ?? [],
  });
  const { data: locations } = useQuery({
    queryKey: ["locations-flat"],
    queryFn: async () => (await supabase.from("locations").select("id,name").order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      // 1) create inventory
      const { data: inv, error } = await supabase.from("inventories").insert({
        name: form.name.trim(), type: form.type,
        location_id: form.location_id || null, started_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      // 2) seed expected lines from assets at that location (or all)
      let q = supabase.from("assets").select("id,quantity");
      if (form.location_id) q = q.eq("current_location_id", form.location_id);
      const { data: assets, error: e2 } = await q;
      if (e2) throw e2;
      if (assets?.length) {
        const lines = assets.map((a) => ({ inventory_id: inv.id, asset_id: a.id, expected_qty: a.quantity ?? 1 }));
        const { error: e3 } = await supabase.from("inventory_lines").insert(lines);
        if (e3) throw e3;
      }
      return inv.id;
    },
    onSuccess: () => {
      toast.success("Popis pokrenut");
      setOpen(false); setForm({ name: "", type: "regular", location_id: "" });
      qc.invalidateQueries({ queryKey: ["inventories"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Popisi"
        description="Redovni i vanredni popis opreme"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Novi popis</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novi popis</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Naziv</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Tip</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as InvType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Redovni</SelectItem>
                      <SelectItem value="ad_hoc">Vanredni</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Lokacija (opciono — sve ako prazno)</Label>
                  <Select value={form.location_id || "__all"} onValueChange={(v) => setForm({ ...form, location_id: v === "__all" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">— Sve lokacije —</SelectItem>
                      {locations?.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.name.trim() || create.isPending}>Pokreni</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="card-elevated">
        <CardContent className="p-0">
          {isLoading ? <div className="p-12 text-center text-muted-foreground">Učitavanje…</div>
          : !inventories?.length ? <div className="p-12 text-center"><ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p>Nema popisa.</p></div>
          : <ul className="divide-y">{inventories.map((i) => {
              const loc = (i as unknown as { locations: { name: string } | null }).locations;
              return (
                <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-accent/40">
                  <Link to={`/inventories/${i.id }`} className="flex-1 min-w-0">
                    <div className="font-medium truncate">{i.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{i.type === "regular" ? "Redovni" : "Vanredni"} · {loc?.name ?? "Sve lokacije"} · {formatDateTime(i.started_at)}</div>
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant={i.status === "open" ? "default" : "outline"}>{i.status}</Badge>
                    {canManage && (
                      <ConfirmDelete
                        title={`Obrisati popis „${i.name}"?`}
                        description="Brisanje uklanja sve stavke popisa."
                        onConfirm={() => remove.mutate(i.id)}
                      />
                    )}
                  </div>
                </li>
              );
            })}</ul>}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
