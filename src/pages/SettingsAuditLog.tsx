import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Search, FileSpreadsheet, Eye } from "lucide-react";
import { useAuth } from "@/features/auth/use-auth";
import { exportCsv } from "@/lib/csv";
import { toast } from "sonner";



type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  diff: any;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  insert: "Kreirano",
  update: "Izmenjeno",
  delete: "Obrisano",
};

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  insert: "default",
  update: "secondary",
  delete: "destructive",
};

const ENTITY_LABELS: Record<string, string> = {
  assets: "Oprema",
  checkouts: "Reversi",
  events: "Događaji",
  user_roles: "Uloge",
  categories: "Kategorije",
  locations: "Lokacije",
  service_records: "Servis",
};

export default function SettingsAuditLog() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("admin");

  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", entityFilter, actionFilter],
    enabled: canView,
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (entityFilter !== "all") q = q.eq("entity_type", entityFilter);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data as AuditRow[];
    },
  });

  const userIds = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.user_id).filter(Boolean) as string[])),
    [data]
  );

  const { data: profiles } = useQuery({
    queryKey: ["audit-users", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      return data ?? [];
    },
  });

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    (profiles ?? []).forEach((p: any) => (m[p.id] = p.full_name));
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return data ?? [];
    return (data ?? []).filter((r) => {
      const who = r.user_id ? (profileMap[r.user_id] ?? "").toLowerCase() : "";
      return (
        who.includes(q) ||
        r.entity_type.toLowerCase().includes(q) ||
        (r.entity_id ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, profileMap]);

  const onExport = () => {
    if (!filtered.length) {
      toast.error("Nema podataka za izvoz");
      return;
    }
    exportCsv(`istorija-izmena-${new Date().toISOString().slice(0, 10)}`, filtered, [
      { header: "Datum", value: (r) => new Date(r.created_at).toLocaleString("sr-RS") },
      { header: "Korisnik", value: (r) => (r.user_id ? profileMap[r.user_id] ?? r.user_id : "—") },
      { header: "Akcija", value: (r) => ACTION_LABELS[r.action] ?? r.action },
      { header: "Entitet", value: (r) => ENTITY_LABELS[r.entity_type] ?? r.entity_type },
      { header: "ID zapisa", value: (r) => r.entity_id ?? "" },
    ]);
  };

  if (!canView) {
    return (
      <PageContainer>
        <PageHeader title="Istorija izmena" description="Nemate ovlašćenje za pregled." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Istorija izmena"
        description="Poslednjih 500 promena u sistemu (assets, reversi, događaji, uloge, kategorije, lokacije, servis)."
        actions={
          <Button variant="outline" onClick={onExport}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV
          </Button>
        }
      />

      <Card className="card-elevated mb-4">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pretraga po korisniku, entitetu ili ID-u…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Entitet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi entiteti</SelectItem>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="Akcija" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve akcije</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !filtered.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nema zapisa za odabrane filtere.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="p-4 flex items-center gap-3 hover:bg-muted/40 transition"
                >
                  <Badge variant={ACTION_VARIANTS[r.action] ?? "outline"} className="shrink-0">
                    {ACTION_LABELS[r.action] ?? r.action}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {ENTITY_LABELS[r.entity_type] ?? r.entity_type}
                      {r.entity_id && (
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          {r.entity_id.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.user_id ? profileMap[r.user_id] ?? r.user_id.slice(0, 8) : "Sistem"} ·{" "}
                      {new Date(r.created_at).toLocaleString("sr-RS")}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelected(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalji izmene</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Akcija" value={ACTION_LABELS[selected.action] ?? selected.action} />
                <Field label="Entitet" value={ENTITY_LABELS[selected.entity_type] ?? selected.entity_type} />
                <Field label="Korisnik" value={selected.user_id ? profileMap[selected.user_id] ?? selected.user_id : "Sistem"} />
                <Field label="Datum" value={new Date(selected.created_at).toLocaleString("sr-RS")} />
                {selected.entity_id && <Field label="ID zapisa" value={selected.entity_id} mono />}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Podaci</div>
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-[50vh]">
                  {JSON.stringify(selected.diff, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</div>
    </div>
  );
}
