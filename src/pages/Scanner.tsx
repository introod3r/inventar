import { Link, useNavigate } from "react-router-dom";
import { useCallback, useState } from "react";
import { CameraScanner, type ScanResult } from "@/components/scanner/CameraScanner";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Loader2, ScanLine, ChevronRight, AlertCircle, ShoppingCart, Plus, Trash2, X } from "lucide-react";
import { AssetStatusBadge } from "@/components/common/StatusBadge";
import { toast } from "sonner";
import { useScanCart } from "@/features/cart/use-scan-cart";
import { BulkCheckoutDialog } from "@/components/checkout/BulkCheckoutDialog";

type Asset = Database["public"]["Tables"]["assets"]["Row"];

export default function ScanPage() {
  const navigate = useNavigate();
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ asset: Asset | null; notFound?: string } | null>(null);
  const { items, add, remove, clear } = useScanCart();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const handleScan = useCallback(async (r: ScanResult) => {
    if (loading || r.code === lastCode) return;
    setLastCode(r.code);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .or(`code.eq.${r.code},qr_code.eq.${r.code},barcode.eq.${r.code},serial_number.eq.${r.code}`)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setResult({ asset: null, notFound: r.code });
      } else {
        setResult({ asset: data });
        toast.success(`Prepoznato: ${data.name}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
      setTimeout(() => setLastCode(null), 1500);
    }
  }, [loading, lastCode]);

  const addToCart = (a: Asset) => {
    const ok = add({ id: a.id, code: a.code, name: a.name, serial_number: a.serial_number });
    if (ok) {
      toast.success(`U korpu: ${a.name}`);
      setResult(null);
    } else {
      toast.info("Stavka je već u korpi");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Brzo skeniranje"
        description="Skeniraj više stavki i zaduži korpu jednim potpisom"
        actions={
          <Button
            variant={items.length > 0 ? "default" : "outline"}
            onClick={() => setBulkOpen(true)}
            disabled={items.length === 0}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Korpa
            {items.length > 0 && <Badge className="ml-2" variant="secondary">{items.length}</Badge>}
          </Button>
        }
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <CameraScanner onScan={handleScan} paused={!!result} />

        <div className="space-y-4">
          <Card className="card-elevated">
            <CardContent className="p-5 space-y-4">
              <form 
                className="flex gap-2 mb-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualCode.trim()) {
                    handleScan({ code: manualCode.trim(), format: "MANUAL" });
                    setManualCode("");
                  }
                }}
              >
                <Input 
                  placeholder="Unesi šifru ili bar-kod ručno..." 
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  autoFocus
                />
                <Button type="submit" variant="secondary">Traži</Button>
              </form>

              <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                <ScanLine className="h-4 w-4" /> Rezultat
              </div>

              {loading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Pretraga…
                </div>
              )}

              {!loading && !result && (
                <p className="text-sm text-muted-foreground">
                  Skenirana oprema će se pojaviti ovde. Dodaj je u korpu i nastavi sa skeniranjem.
                </p>
              )}

              {!loading && result?.asset && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">{result.asset.name}</h3>
                      <AssetStatusBadge status={result.asset.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Šifra: {result.asset.code}
                      {result.asset.serial_number && <> · S/N: {result.asset.serial_number}</>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => addToCart(result.asset!)}>
                      <Plus className="mr-2 h-4 w-4" /> Dodaj u korpu
                    </Button>
                    <Button variant="secondary" asChild>
                      <Link to={`/assets/${result.asset.id}`}>
                        Otvori karton <ChevronRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="outline" className="col-span-2" onClick={() => setResult(null)}>
                      Skeniraj sledeće
                    </Button>
                  </div>
                </div>
              )}

              {!loading && result && !result.asset && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-warning-foreground bg-warning/15 border border-warning/30 rounded-md p-3 text-sm">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <div>
                      <div className="font-medium">Šifra nije pronađena</div>
                      <div className="text-muted-foreground">Kod: <span className="font-mono">{result.notFound}</span></div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild>
                      <Link to={`/assets/new?code=${result.notFound}`}>
                        Kreiraj opremu
                      </Link>
                    </Button>
                    <Button variant="outline" onClick={() => setResult(null)}>
                      Skeniraj ponovo
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {items.length > 0 && (
            <Card className="card-elevated">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <ShoppingCart className="h-4 w-4" /> Korpa ({items.length})
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => setBulkOpen(true)}>Zaduži sve</Button>
                    <Button size="sm" variant="ghost" onClick={clear} aria-label="Isprazni"><X className="h-4 w-4" /></Button>
                  </div>
                </div>
                <ul className="divide-y border rounded-md max-h-64 overflow-y-auto">
                  {items.map((it) => (
                    <li key={it.id} className="flex items-center gap-2 p-2 px-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{it.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{it.code}</div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => remove(it.id)} aria-label="Ukloni">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <BulkCheckoutDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        items={items}
        onRemoveItem={remove}
        onDone={() => { clear(); navigate("/checkouts"); }}
      />
    </PageContainer>
  );
}
