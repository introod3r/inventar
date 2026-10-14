import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/lib/format";

type DamageRow = {
  id: string;
  asset_id: string;
  severity: string | null;
  description: string | null;
  reported_at: string;
  photo_paths: string[] | null;
  assets: { code: string; name: string } | null;
};

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  minor: "secondary", moderate: "default", severe: "destructive",
};

async function signedUrls(paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data } = await supabase.storage.from("damage-photos").createSignedUrls(paths, 3600);
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u);
}

export function DamageReportsList() {
  const [preview, setPreview] = useState<{ urls: string[]; report: DamageRow } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["damage-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("damage_reports")
        .select("id, asset_id, severity, description, reported_at, photo_paths, assets:asset_id(code,name)")
        .order("reported_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as DamageRow[];
    },
  });

  const openPreview = async (r: DamageRow) => {
    const urls = await signedUrls(r.photo_paths ?? []);
    setPreview({ urls, report: r });
  };

  return (
    <>
      <Card className="card-elevated">
        <CardHeader><CardTitle className="text-base">Prijave oštećenja</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">Učitavanje…</div>
          ) : !data?.length ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nema prijava oštećenja.</div>
          ) : (
            <ul className="divide-y">
              {data.map((r) => (
                <li key={r.id} className="flex items-center justify-between p-4 gap-3">
                  <button onClick={() => openPreview(r)} className="text-left min-w-0 flex-1 hover:opacity-80">
                    <div className="font-medium truncate flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      {r.assets?.name ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.assets?.code} · {formatDateTime(r.reported_at)}
                      {r.description && <> · {r.description}</>}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.photo_paths?.length ? <Badge variant="outline">{r.photo_paths.length} foto</Badge> : null}
                    {r.severity && <Badge variant={severityVariant[r.severity] ?? "outline"}>{r.severity}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview?.report.assets?.name} — {preview?.report.assets?.code}</DialogTitle>
          </DialogHeader>
          {preview?.report.description && <p className="text-sm">{preview.report.description}</p>}
          {preview?.urls.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {preview.urls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="block aspect-square rounded-md overflow-hidden border border-border bg-muted">
                  <img src={u} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">Bez fotografija.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
