import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Camera, X } from "lucide-react";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";
import { exportCsv } from "@/lib/csv";
import { FileDown } from "lucide-react";

export default function InventoryDetails() {
  const { inventoryId } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const { data: inv } = useQuery({
    queryKey: ["inventory", inventoryId!],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventories").select("*").eq("id", inventoryId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lines, isLoading } = useQuery({
    queryKey: ["inventory-lines", inventoryId!],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_lines")
        .select("*, assets:asset_id(id,code,name, locations:current_location_id(name))")
        .eq("inventory_id", inventoryId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const scanMut = useMutation({
    mutationFn: async (code: string) => {
      const { data: asset, error } = await supabase
        .from("assets").select("id,name").or(`code.eq.${code},qr_code.eq.${code},barcode.eq.${code},serial_number.eq.${code}`).maybeSingle();
      if (error) throw error;
      if (!asset) throw new Error(`Šifra ${code} nije pronađena`);
      const { data: { user } } = await supabase.auth.getUser();
      
      const existing = lines?.find((l) => l.asset_id === asset.id);
      if (existing) {
        if ((existing.counted_qty ?? 0) >= existing.expected_qty && existing.expected_qty > 0) {
           return asset.name; // already fully scanned
        }
        const { error: e2 } = await supabase.from("inventory_lines").update({
          counted_qty: (existing.counted_qty ?? 0) + 1,
          scanned_at: new Date().toISOString(),
          scanned_by: user?.id ?? null,
        }).eq("id", existing.id);
        if (e2) throw e2;
      } else {
        const { error: e2 } = await supabase.from("inventory_lines").insert({
          inventory_id: inventoryId!, 
          asset_id: asset.id,
          expected_qty: 0, 
          counted_qty: 1,
          scanned_at: new Date().toISOString(), 
          scanned_by: user?.id ?? null,
        });
        if (e2) throw e2;
      }
      return asset.name;
    },
    onSuccess: (name) => { 
      toast.success(`Skenirano: ${name}`); 
      qc.invalidateQueries({ queryKey: ["inventory-lines", inventoryId!] }); 
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const onScan = useCallback((r: { code: string }) => {
    if (r.code === lastCode) return;
    setLastCode(r.code);
    scanMut.mutate(r.code);
    setTimeout(() => setLastCode(null), 1500);
  }, [lastCode, scanMut]);

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventories")
        .update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", inventoryId!);
      if (error) throw error;
    },
    onSuccess: () => { 
      toast.success("Popis završen"); 
      qc.invalidateQueries({ queryKey: ["inventory", inventoryId!] }); 
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!inv) return <PageContainer><div className="p-8 text-slate-400">Učitavanje podataka...</div></PageContainer>;

  const isOpen = inv.status === "open";
  const expectedTotal = lines?.reduce((acc, l) => acc + (l.expected_qty || 0), 0) || 0;
  const countedTotal = lines?.reduce((acc, l) => acc + (l.counted_qty || 0), 0) || 0;
  const missingCount = Math.max(0, expectedTotal - countedTotal);

  return (
    <PageContainer>
        <div className="bg-[#151921] rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden text-slate-300 flex flex-col relative">
        
        {/* Header */}
        <div className="p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-800/60 bg-[#1A1F2A]/30">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="px-2.5 py-1 rounded bg-blue-950/40 border border-blue-900/50 text-blue-400 font-bold text-[10px] uppercase tracking-wider">
                REDOVNI POPIS
              </div>
              <div className={`px-2.5 py-1 rounded font-bold text-[10px] uppercase tracking-wider ${
                isOpen ? "bg-amber-950/40 border border-amber-900/50 text-amber-400" : "bg-emerald-950/40 border border-emerald-900/50 text-emerald-400"
              }`}>
                {isOpen ? "OTVOREN" : "ZAVRŠEN"}
              </div>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-100">{inv.name}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {isOpen && (
              <>
                <Button 
                  className={scanning ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"} 
                  onClick={() => setScanning((s) => !s)}
                >
                  {scanning ? <X className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}
                  {scanning ? "Zaustavi Kameru" : "Skenirajte Opremu Kamerom"}
                </Button>
                
                <ConfirmDelete 
                   title="Završi popis?" 
                   description="Ovo će trajno zatvoriti popis i zabeležiti trenutno stanje kao konačno."
                   onConfirm={() => complete.mutate()}
                   trigger={
                     <Button variant="outline" className="border-emerald-800/50 text-emerald-400 hover:bg-emerald-950/30">
                       <CheckCircle2 className="mr-2 h-4 w-4" /> Završi
                     </Button>
                   }
                />
              </>
            )}
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white rounded-full ml-auto md:ml-0" onClick={() => navigate("/inventories")}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Scanner Area */}
        {scanning && isOpen && (
          <div className="bg-slate-950 p-6 border-b border-slate-800/60">
            <div className="max-w-md mx-auto rounded-xl overflow-hidden border border-slate-800 shadow-xl">
              <CameraScanner onScan={onScan} />
            </div>
          </div>
        )}

        {/* Stats Section */}
        <div className="p-6 md:p-8 border-b border-slate-800/60 bg-[#151921]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Očekivano */}
            <div className="bg-[#1A1F2A] border border-slate-800/60 p-5 rounded-xl flex flex-col justify-center">
              <div className="text-xs text-slate-500 mb-1 font-medium">Ukupno Očekivano</div>
              <div className="text-2xl font-bold text-slate-100">{expectedTotal} kom</div>
            </div>

            {/* Pronađeno */}
            <div className="bg-[#13221C] border border-emerald-900/40 p-5 rounded-xl flex flex-col justify-center">
              <div className="text-xs text-emerald-600/80 mb-1 font-medium">Pronađeno Popisom</div>
              <div className="text-2xl font-bold text-emerald-400">{countedTotal} kom</div>
            </div>

            {/* Manjak */}
            <div className="bg-[#241315] border border-rose-900/40 p-5 rounded-xl flex flex-col justify-center">
              <div className="text-xs text-rose-600/80 mb-1 font-medium">Manjak / Neskenirano</div>
              <div className="text-2xl font-bold text-rose-500">{missingCount} kom</div>
            </div>

          </div>
        </div>

        {/* Table Section */}
        <div className="p-6 md:p-8">
          <h3 className="text-sm font-bold text-slate-200 mb-4">Spisak Artikala Obuhvaćenih Popisom</h3>
          
          <div className="border border-slate-800/60 rounded-xl overflow-hidden bg-[#1A1F2A]/30">
            {isLoading ? (
               <div className="p-8 text-center text-slate-500">Učitavanje stavki...</div>
            ) : !lines?.length ? (
               <div className="p-8 text-center text-slate-500">Ovaj popis trenutno ne sadrži artikle.</div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 text-xs font-semibold text-slate-500 bg-slate-900/40">
                  <div className="col-span-2">Šifra</div>
                  <div className="col-span-4">Naziv Artikla</div>
                  <div className="col-span-3">Očekivana Lokacija</div>
                  <div className="col-span-2 text-center">Status Popisa</div>
                  <div className="col-span-1 text-right">Akcija</div>
                </div>
                
                {lines.map((l) => {
                  const a = (l as unknown as { assets: { id: string; code: string; name: string; locations?: { name: string } } | null }).assets;
                  const counted = l.counted_qty ?? 0;
                  const expected = l.expected_qty ?? 0;
                  const locName = a?.locations?.name || "Nije dodeljeno";
                  const found = counted >= expected && expected > 0;
                  const over = counted > expected;

                  return (
                    <div key={l.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-5 py-4 items-center hover:bg-slate-800/30 transition-colors">
                      <div className="md:col-span-2 font-mono text-xs text-cyan-500 font-bold tracking-wider">
                        {a?.code || "BEZ ŠIFRE"}
                      </div>
                      
                      <div className="md:col-span-4">
                        <div className="font-bold text-slate-200 text-sm leading-tight">{a?.name || "Nepoznat artikal"}</div>
                        <div className="md:hidden text-xs text-slate-500 mt-1">{locName}</div>
                      </div>
                      
                      <div className="hidden md:block md:col-span-3 text-xs text-slate-500">
                        {locName}
                      </div>

                      <div className="md:col-span-2 md:text-center mt-2 md:mt-0">
                        {found ? (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-2 py-1 rounded tracking-wider">PRONAĐENO</span>
                        ) : over ? (
                          <span className="text-[10px] font-bold text-warning-foreground bg-warning/10 border border-warning/30 px-2 py-1 rounded tracking-wider">VIŠAK (+{counted - expected})</span>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-400 bg-rose-950/30 border border-rose-900/50 px-2 py-1 rounded tracking-wider">NEDOSTAJE</span>
                        )}
                      </div>

                      <div className="md:col-span-1 text-right flex justify-end md:block -mt-7 md:mt-0">
                        {found ? (
                          <div className="flex items-center justify-end gap-1.5 text-emerald-500 text-xs font-semibold">
                            <CheckCircle2 className="h-4 w-4" /> Potvrđeno
                          </div>
                        ) : isOpen ? (
                           <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 bg-slate-800 hover:bg-slate-700 text-slate-300" onClick={() => scanMut.mutate(a?.code || "")}>
                              Potvrdi ručno
                           </Button>
                        ) : (
                           <span className="text-xs text-slate-600">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            <Button 
              variant="outline" 
              onClick={() => {
                if (!lines || lines.length === 0) {
                  toast.error("Nema stavki za izvoz.");
                  return;
                }
                exportCsv(`popis-${inv.name}-${new Date().toISOString().slice(0, 10)}`, lines, [
                  { header: "Šifra", value: (l) => (l as any).assets?.code ?? "" },
                  { header: "Naziv", value: (l) => (l as any).assets?.name ?? "" },
                  { header: "Lokacija", value: (l) => (l as any).assets?.locations?.name ?? "" },
                  { header: "Očekivano", value: (l) => String(l.expected_qty ?? 0) },
                  { header: "Popisano", value: (l) => String(l.counted_qty ?? 0) },
                  { header: "Razlika", value: (l) => String((l.counted_qty ?? 0) - (l.expected_qty ?? 0)) },
                ]);
                toast.success("Izveštaj o popisu je preuzet");
              }}
            >
              <FileDown className="mr-2 h-4 w-4" /> Izvoz (CSV)
            </Button>
          </div>
        </div>

        </div>
    </PageContainer>
  );
}
