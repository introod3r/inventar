
import { useState, useRef } from "react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Download, Upload, Loader2, Database, AlertTriangle } from "lucide-react";
import { useAuth } from "@/features/auth/use-auth";
import { exportBackup, importBackup } from "@/lib/backup.functions";



export default function SettingsBackup() {
  const { hasPermission } = useAuth();
  const canAdmin = hasPermission("admin");
  const exportFn = exportBackup;
  const importFn = importBackup;
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [results, setResults] = useState<Record<string, { inserted: number; skipped: number; error?: string }> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!canAdmin) {
    return (
      <PageContainer>
        <PageHeader title="Backup" description="Samo administrator ima pristup ovom delu." />
      </PageContainer>
    );
  }

  const handleExport = async () => {
    setExporting(true);
    try {
      const payload = await exportFn();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup uspešno preuzet");
    } catch (e: any) {
      toast.error(e?.message || "Greška pri izvozu");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setResults(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (mode === "replace" && !confirm("Zamena briše sve postojeće podatke (osim korisnika). Nastaviti?")) {
        setImporting(false);
        return;
      }
      const res = await importFn({ payload, mode });
      setResults(res.results);
      toast.success("Uvoz završen");
    } catch (e: any) {
      toast.error(e?.message || "Greška pri uvozu");
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Backup i vraćanje" description="Izvoz i uvoz svih podataka aplikacije (JSON)." />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Izvoz podataka</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Preuzmi JSON fajl sa svim tabelama: kategorije, lokacije, klijenti, oprema, fotografije, događaji,
            reversi, servisni nalozi, popisi, korisnici i uloge.
          </p>
          <Button onClick={handleExport} disabled={exporting} className="w-full">
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Preuzmi backup (.json)
          </Button>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Uvoz podataka</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Učitaj prethodno preuzet JSON fajl. Uvoz radi upsert po <code>id</code> polju.
          </p>

          <div className="space-y-2">
            <Label>Način uvoza</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("merge")}
                className={cn(
                  "text-left rounded-md border p-3 text-sm transition-colors",
                  mode === "merge" ? "border-primary bg-primary/10" : "hover:bg-muted"
                )}
              >
                <div className="font-medium">Merge</div>
                <div className="text-xs text-muted-foreground mt-0.5">Dodaje/ažurira zapise</div>
              </button>
              <button
                type="button"
                onClick={() => setMode("replace")}
                className={cn(
                  "text-left rounded-md border p-3 text-sm transition-colors",
                  mode === "replace" ? "border-destructive bg-destructive/10" : "hover:bg-muted"
                )}
              >
                <div className="font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Replace
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Briše i uvozi ispočetka</div>
              </button>
            </div>
          </div>


          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
          />
          <Button
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            variant={mode === "replace" ? "destructive" : "default"}
            className="w-full"
          >
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Izaberi backup fajl
          </Button>
        </Card>
      </div>

      {results && (
        <Card className="p-6 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Rezultat uvoza</h3>
          </div>
          <div className="space-y-1 text-sm font-mono">
            {Object.entries(results).map(([table, r]) => (
              <div key={table} className="flex justify-between border-b py-1">
                <span>{table}</span>
                <span className={r.error ? "text-destructive" : "text-muted-foreground"}>
                  {r.error ? `⚠ ${r.error}` : `+${r.inserted}${r.skipped ? ` (preskočeno ${r.skipped})` : ""}`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4 mt-4 bg-muted/40">
        <p className="text-xs text-muted-foreground">
          <strong>Napomena:</strong> Backup ne uključuje fajlove iz storage-a (fotografije opreme, potpisi, PDF reversi) —
          samo referentne zapise iz baze. Stavke menija su definisane u kodu i nisu deo backupa. Za punu migraciju
          na lokalni Supabase projekat, potrebno je preneti i storage bucket-e ručno.
        </p>
      </Card>
    </PageContainer>
  );
}
