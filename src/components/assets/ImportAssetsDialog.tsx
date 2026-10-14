import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Upload, FileDown } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import type { Database } from "@/integrations/supabase/types";

type AssetStatus = Database["public"]["Enums"]["asset_status"];

type Row = {
  code: string;
  name: string;
  serial_number?: string | null;
  description?: string | null;
  barcode?: string | null;
  qr_code?: string | null;
  purchase_date?: string | null;
  purchase_value?: number | null;
  quantity?: number | null;
  unit?: string | null;
  status?: AssetStatus | null;
  category_name?: string | null;
  location_name?: string | null;
};

const VALID_STATUSES: AssetStatus[] = ["available", "reserved", "at_event", "in_transit", "returned", "damaged", "in_service", "written_off"];

// --- CSV parsing (RFC4180-ish, supports ; or , separator, quoted fields) ---
function detectSep(headerLine: string): string {
  const semi = (headerLine.match(/;/g) ?? []).length;
  const com = (headerLine.match(/,/g) ?? []).length;
  return semi >= com ? ";" : ",";
}
function parseCsv(text: string): Record<string, string>[] {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = detectSep(firstLine);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) { cur.push(field); field = ""; }
      else if (c === "\r") { /* ignore */ }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1)
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function parseXml(text: string): Record<string, string>[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("Neispravan XML fajl");
  // Accept <assets><asset>...</asset></assets> or <items><item>...</item></items>
  const candidates = ["asset", "item", "row", "record"];
  let nodes: Element[] = [];
  for (const tag of candidates) {
    const found = Array.from(doc.getElementsByTagName(tag));
    if (found.length) { nodes = found; break; }
  }
  if (!nodes.length) {
    // fallback: children of root
    nodes = Array.from(doc.documentElement?.children ?? []);
  }
  return nodes.map((n) => {
    const obj: Record<string, string> = {};
    for (const child of Array.from(n.children)) {
      obj[child.tagName.toLowerCase()] = (child.textContent ?? "").trim();
    }
    // also include attributes
    for (const attr of Array.from(n.attributes)) {
      if (!(attr.name in obj)) obj[attr.name.toLowerCase()] = attr.value;
    }
    return obj;
  });
}

function normalize(raw: Record<string, string>): Row | null {
  const code = (raw.code || raw["šifra"] || raw.sifra || "").trim();
  const name = (raw.name || raw.naziv || "").trim();
  if (!code || !name) return null;
  const pv = (raw.purchase_value || raw.nabavna_vrednost || raw["nabavna vrednost"] || raw.trenutna_vrednost || raw["trenutna vrednost"] || raw.vrednost || "").replace(",", ".").trim();
  const qty = (raw.quantity || raw.kolicina || raw["količina"] || "").trim();
  const statusRaw = (raw.status || "").trim() as AssetStatus;
  const status = VALID_STATUSES.includes(statusRaw) ? statusRaw : null;
  return {
    code,
    name,
    serial_number: (raw.serial_number || raw.serijski_broj || raw["serijski broj"] || raw.sn || "").trim() || null,
    description: (raw.description || raw.opis || "").trim() || null,
    barcode: (raw.barcode || raw.barkod || "").trim() || null,
    qr_code: (raw.qr_code || raw.qr || "").trim() || null,
    purchase_date: (raw.purchase_date || raw.datum_nabavke || "").trim() || null,
    purchase_value: pv ? Number(pv) : null,
    quantity: qty ? Number(qty) : null,
    unit: (raw.unit || raw.jedinica || "").trim() || null,
    status,
    category_name: (raw.category || raw.kategorija || raw.category_name || "").trim() || null,
    location_name: (raw.location || raw.lokacija || raw.location_name || "").trim() || null,
  };
}

export function ImportAssetsDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const reset = () => { setRows([]); setFileName(""); setErrors([]); };

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);
    try {
      const text = await file.text();
      const isXml = /\.xml$/i.test(file.name) || text.trim().startsWith("<");
      const raws = isXml ? parseXml(text) : parseCsv(text);
      const localErrors: string[] = [];
      const norm: Row[] = [];
      raws.forEach((r, i) => {
        const n = normalize(r);
        if (!n) localErrors.push(`Red ${i + 2}: nedostaje šifra ili naziv`);
        else norm.push(n);
      });
      setRows(norm);
      setErrors(localErrors);
      if (!norm.length) toast.error("Nijedan validan red u fajlu");
      else toast.success(`Pronađeno ${norm.length} stavki za uvoz`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onImport = async () => {
    if (!rows.length) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Resolve categories/locations by name (case-insensitive)
      const catNames = Array.from(new Set(rows.map((r) => r.category_name).filter((v): v is string => !!v)));
      const locNames = Array.from(new Set(rows.map((r) => r.location_name).filter((v): v is string => !!v)));

      const [{ data: cats }, { data: locs }] = await Promise.all([
        catNames.length
          ? supabase.from("categories").select("id,name").in("name", catNames)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        locNames.length
          ? supabase.from("locations").select("id,name").in("name", locNames)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const catMap = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]));
      const locMap = new Map((locs ?? []).map((l) => [l.name.toLowerCase(), l.id]));

      // Auto-create missing categories
      const missingCats = catNames.filter((n) => !catMap.has(n.toLowerCase()));
      if (missingCats.length) {
        const { data: created, error } = await supabase
          .from("categories")
          .insert(missingCats.map((name) => ({ name })))
          .select("id,name");
        if (error) throw error;
        for (const c of created ?? []) catMap.set(c.name.toLowerCase(), c.id);
      }

      const payload = rows.map((r) => {
        const item: any = {
          code: r.code,
          name: r.name,
          serial_number: r.serial_number,
          description: r.description,
          barcode: r.barcode,
          qr_code: r.qr_code || r.code,
          purchase_date: r.purchase_date,
          purchase_value: r.purchase_value,
          current_value: r.purchase_value,
          quantity: r.quantity ?? 1,
          unit: r.unit ?? "kom",
          status: r.status ?? "available",
          created_by: user?.id ?? null,
        };
        
        const catId = r.category_name ? catMap.get(r.category_name.toLowerCase()) : null;
        if (catId) item.category_id = catId;
        
        const locId = r.location_name ? locMap.get(r.location_name.toLowerCase()) : null;
        if (locId) item.current_location_id = locId;
        
        // Remove any keys that are undefined or null to avoid schema cache issues
        Object.keys(item).forEach(key => {
          if (item[key] === null || item[key] === undefined) {
            delete item[key];
          }
        });
        
        return item;
      });

      // Insert in chunks of 200
      let inserted = 0;
      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200);
        const { error, count } = await supabase
          .from("assets")
          .insert(chunk, { count: "exact" });
        if (error) throw error;
        inserted += count ?? chunk.length;
      }

      toast.success(`Uvezeno ${inserted} stavki`);
      onImported();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const sample = [
      "Šifra;Naziv;Serijski broj;Status;Lokacija;Trenutna vrednost",
      "109-300-0066;MONITOR TFT 18.5 ASUS VH192D;SN109-300-0066;available;Glavni magacin;1000",
      "091-125-0001;BAŠTENSKI JASTUCI;SN091-125-0001;available;Glavni magacin;1000"
    ].join("\r\n");
    downloadCsv("sablon-oprema.csv", "\uFEFF" + sample);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Uvoz opreme</DialogTitle>
          <DialogDescription>
            Učitaj CSV (separator <code>;</code> ili <code>,</code>) ili XML fajl. Kategorije i lokacije se mapiraju po imenu;
            nepostojeće kategorije se automatski kreiraju.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
              <FileDown className="mr-2 h-4 w-4" /> Preuzmi CSV šablon
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Fajl (.csv ili .xml)</Label>
            <Input
              id="file"
              type="file"
              accept=".csv,.xml,text/csv,application/xml,text/xml"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            {fileName && <p className="text-xs text-muted-foreground">Fajl: {fileName}</p>}
          </div>

          {errors.length > 0 && (
            <Card className="p-3 text-xs text-destructive max-h-32 overflow-auto">
              {errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
              {errors.length > 20 && <div>… i još {errors.length - 20}</div>}
            </Card>
          )}

          {rows.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-3 py-2 text-sm font-medium border-b bg-muted/40">
                Pregled ({rows.length} {rows.length === 1 ? "stavka" : "stavki"})
              </div>
              <div className="max-h-64 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1">Šifra</th>
                      <th className="text-left px-2 py-1">Naziv</th>
                      <th className="text-left px-2 py-1">Kategorija</th>
                      <th className="text-left px-2 py-1">Lokacija</th>
                      <th className="text-right px-2 py-1">Kol.</th>
                      <th className="text-right px-2 py-1">Vred.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 font-mono">{r.code}</td>
                        <td className="px-2 py-1">{r.name}</td>
                        <td className="px-2 py-1 text-muted-foreground">{r.category_name ?? "—"}</td>
                        <td className="px-2 py-1 text-muted-foreground">{r.location_name ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{r.quantity ?? 1}</td>
                        <td className="px-2 py-1 text-right">{r.purchase_value ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <div className="px-2 py-1 text-muted-foreground">… i još {rows.length - 50} redova</div>
                )}
              </div>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Otkaži</Button>
          <Button onClick={onImport} disabled={busy || !rows.length}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Uvezi {rows.length ? `(${rows.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
