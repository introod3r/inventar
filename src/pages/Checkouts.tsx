import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Undo2, FileDown, FileSpreadsheet, Package, User, Clock, Search, LayoutGrid, List as ListIcon, X, CalendarDays, CheckCircle2, Printer, QrCode } from "lucide-react";
import { formatDateTime, formatDate } from "@/lib/format";
import { ReturnDialog } from "@/components/checkout/CheckoutDialog";
import { CheckoutWizard } from "@/components/checkout/CheckoutWizard";
import { ReturnWizard } from "@/components/checkout/ReturnWizard";
import { ThermalReversDialog } from "@/components/checkout/ThermalReversDialog";
import { type ThermalReceiptData } from "@/lib/thermal";
import { generateReversPdf, downloadBlob } from "@/lib/revers-pdf";
import { exportCsv } from "@/lib/csv";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";
import { useAuth } from "@/features/auth/use-auth";
import { Input } from "@/components/ui/input";
import { CameraScanner, type ScanResult } from "@/components/scanner/CameraScanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { playScanSuccess } from "@/lib/sound";

type Asset = { id: string; code: string; name: string; serial_number: string | null };
type CheckoutRow = {
  id: string;
  asset_id: string;
  event_id: string | null;
  checked_out_to_name: string | null;
  checked_out_at: string;
  expected_return_at: string | null;
  returned_at: string | null;
  condition_out: string | null;
  condition_in: string | null;
  notes: string | null;
  signature_path: string | null;
  return_signature_path: string | null;
  assets: Asset | null;
  events: { name: string; clients?: { name: string } | null } | null;
};

export default function CheckoutsPage() {
  const [returnFor, setReturnFor] = useState<CheckoutRow | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [returnWizardOpen, setReturnWizardOpen] = useState(false);
  const [sortOption, setSortOption] = useState("date_desc");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedGroup, setSelectedGroup] = useState<CheckoutRow[] | null>(null);
  const [thermalData, setThermalData] = useState<ThermalReceiptData | null>(null);
  const [thermalOpen, setThermalOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [params, setParams] = useSearchParams();

  const handleQuickScan = (r: ScanResult) => {
    const clean = r.code.trim();
    if (!clean) return;
    const term = clean.replace(/^REV-/i, "");
    setQ(term);
    setScanOpen(false);
    playScanSuccess();
    toast.success(`Filtrirano po šifri: ${clean}`);
  };

  useEffect(() => {
    if (params.get("new") === "1") {
      setWizardOpen(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canDelete = hasRole("admin");

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checkouts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revers obrisan");
      qc.invalidateQueries({ queryKey: ["checkouts"] });
      setSelectedGroup(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["checkouts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("checkouts")
        .select("*, assets:asset_id(id,code,name,serial_number), events:event_id(name, clients:client_id(name))")
        .order("checked_out_at", { ascending: false })
        .limit(300);
      return (data ?? []) as unknown as CheckoutRow[];
    },
  });

  const groupedData = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, CheckoutRow[]>();
    for (const c of data) {
      const key = c.signature_path || c.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    let arr = Array.from(groups.values());

    // Filter
    if (status === "open") {
      arr = arr.filter(g => g.some(x => !x.returned_at));
    } else if (status === "closed") {
      arr = arr.filter(g => g.every(x => x.returned_at));
    }

    if (q.trim()) {
      const term = q.toLowerCase();
      arr = arr.filter(g => {
        const c = g[0];
        const evtMatch = c.events?.name?.toLowerCase().includes(term);
        const clMatch = c.events?.clients?.name?.toLowerCase().includes(term);
        const nameMatch = c.checked_out_to_name?.toLowerCase().includes(term);
        const codeMatch = (c.signature_path || c.id).toLowerCase().includes(term);
        const assetMatch = g.some(row => row.assets?.name.toLowerCase().includes(term) || row.assets?.code.toLowerCase().includes(term));
        return evtMatch || clMatch || nameMatch || codeMatch || assetMatch;
      });
    }
    
    // Sort
    return arr.sort((a, b) => {
      const cA = a[0];
      const cB = b[0];
      if (sortOption === "date_desc") {
        return new Date(cB.checked_out_at).getTime() - new Date(cA.checked_out_at).getTime();
      }
      if (sortOption === "date_asc") {
        return new Date(cA.checked_out_at).getTime() - new Date(cB.checked_out_at).getTime();
      }
      if (sortOption === "event_asc") {
        const evA = cA.events?.name ?? "ZZZ";
        const evB = cB.events?.name ?? "ZZZ";
        return evA.localeCompare(evB);
      }
      return 0;
    });
  }, [data, sortOption, q, status]);

  const downloadPdfGroup = async (group: CheckoutRow[]) => {
    const c = group[0];
    const assets = group.map(row => row.assets).filter(Boolean) as Asset[];
    if (!assets.length) return;
    try {
      const gId = c.signature_path ? c.signature_path.split("-")[1]?.toUpperCase() : c.id.slice(0, 8);
      const pdf = await generateReversPdf({
        checkoutId: `REV-${gId}`,
        assets: assets,
        event: c.events ? { name: c.events.name } : null,
        client: c.events?.clients ? { name: c.events.clients.name } : null,
        checkedOutToName: c.checked_out_to_name,
        checkedOutAt: c.checked_out_at,
        expectedReturnAt: c.expected_return_at,
        returnedAt: group.every(x => x.returned_at) ? c.returned_at : null,
        conditionOut: c.condition_out,
        conditionIn: c.condition_in,
        notes: c.notes,
        signatureOutPath: c.signature_path,
        signatureInPath: c.return_signature_path,
      });
      downloadBlob(pdf, `revers-${c.checked_out_to_name?.replace(/\s+/g, '-') || "izvoz"}-${gId}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openThermalRevers = async (group: CheckoutRow[]) => {
    const c = group[0];
    const assets = group.map((row) => row.assets).filter(Boolean) as Asset[];
    if (!assets.length) return;
    const gId = c.signature_path
      ? c.signature_path.split("-")[1]?.toUpperCase()
      : c.id.slice(0, 8);

    let signatureUrl: string | null = null;
    if (c.signature_path) {
      try {
        const { data } = await supabase.storage
          .from("signatures")
          .createSignedUrl(c.signature_path, 3600);
        if (data?.signedUrl) signatureUrl = data.signedUrl;
      } catch {
        // ignore
      }
    }

    setThermalData({
      reversCode: `REV-${gId}`,
      eventName: c.events?.name,
      clientName: c.events?.clients?.name,
      checkedOutTo: c.checked_out_to_name || "Preuzimalac",
      checkedOutAt: formatDateTime(c.checked_out_at),
      expectedReturnAt: c.expected_return_at
        ? formatDateTime(c.expected_return_at)
        : null,
      conditionOut: c.condition_out,
      notes: c.notes,
      signatureDataUrl: signatureUrl,
      items: assets.map((a) => ({
        code: a.code,
        name: a.name,
        serialNumber: a.serial_number,
      })),
      company: {
        name: "EVENTASSET",
      },
    });
    setThermalOpen(true);
  };

  const onExportCsv = () => {
    const rows = data ?? [];
    if (!rows.length) {
      toast.error("Nema podataka za izvoz");
      return;
    }
    exportCsv(`reversi-${new Date().toISOString().slice(0, 10)}`, rows, [
      { header: "Šifra opreme", value: (c) => c.assets?.code ?? "" },
      { header: "Naziv opreme", value: (c) => c.assets?.name ?? "" },
      { header: "Serijski broj", value: (c) => c.assets?.serial_number ?? "" },
      { header: "Zaduženo na", value: (c) => c.checked_out_to_name ?? "" },
      { header: "Događaj", value: (c) => c.events?.name ?? "" },
      { header: "Klijent", value: (c) => c.events?.clients?.name ?? "" },
      { header: "Izdato", value: (c) => c.checked_out_at },
      { header: "Očekivani povratak", value: (c) => c.expected_return_at ?? "" },
      { header: "Vraćeno", value: (c) => c.returned_at ?? "" },
      { header: "Stanje pri izdavanju", value: (c) => c.condition_out ?? "" },
      { header: "Stanje pri vraćanju", value: (c) => c.condition_in ?? "" },
      { header: "Napomena", value: (c) => c.notes ?? "" },
    ]);
    toast.success(`Izvezeno ${rows.length} reversa`);
  };

  // DETAILS VIEW
  if (selectedGroup) {
    const c = selectedGroup[0];
    const gId = c.signature_path ? c.signature_path.split("-")[1]?.toUpperCase() : c.id.slice(0, 8);
    const revCode = `REV-${gId}`;
    const isOpen = selectedGroup.some(x => !x.returned_at);
    
    return (
      <PageContainer>
        <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden text-card-foreground flex flex-col">
          
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between p-5 border-b border-border bg-muted/40">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 rounded-md bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 text-cyan-700 dark:text-cyan-400 font-mono text-sm font-semibold tracking-wider">
                {revCode}
              </div>
              <div className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border ${
                isOpen ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:border-amber-500/40 dark:text-amber-300" : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:border-emerald-500/40 dark:text-emerald-300"
              }`}>
                <span className={`h-2 w-2 rounded-full ${isOpen ? "bg-amber-500 animate-pulse" : "bg-emerald-500"} `} />
                {isOpen ? "OTVORENO" : "ZATVORENO"}
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 sm:mt-0">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-full" onClick={() => setSelectedGroup(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Details Section */}
          <div className="p-6 md:p-8">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-2">
              Revers: {c.events?.name ?? "Bez događaja"}
            </h1>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Zaduženje opreme kreirano {formatDate(c.checked_out_at)}.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Klijent / Događaj */}
              <div className="bg-muted/40 dark:bg-[#1A1F2A] border border-border dark:border-slate-800/60 rounded-xl p-4 flex flex-col justify-center">
                <div className="text-xs text-muted-foreground mb-1">Događaj / Klijent</div>
                <div className="text-foreground font-medium line-clamp-1">{c.events?.name ?? "N/A"}</div>
                <div className="text-muted-foreground text-xs line-clamp-1">{c.events?.clients?.name ?? ""}</div>
              </div>
              
              {/* Odgovorno Lice */}
              <div className="bg-muted/40 dark:bg-[#1A1F2A] border border-border dark:border-slate-800/60 rounded-xl p-4 flex flex-col justify-center">
                <div className="text-xs text-muted-foreground mb-1">Zadužio</div>
                <div className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-medium">
                  <User className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c.checked_out_to_name || "Nepoznato"}</span>
                </div>
              </div>

              {/* Izdato */}
              <div className="bg-muted/40 dark:bg-[#1A1F2A] border border-border dark:border-slate-800/60 rounded-xl p-4 flex flex-col justify-center">
                <div className="text-xs text-muted-foreground mb-1">Datum Izdavanja</div>
                <div className="flex items-center gap-1.5 text-foreground font-medium">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{formatDateTime(c.checked_out_at)}</span>
                </div>
              </div>

              {/* Ocekivani Povratak */}
              <div className="bg-muted/40 dark:bg-[#1A1F2A] border border-border dark:border-slate-800/60 rounded-xl p-4 flex flex-col justify-center">
                <div className="text-xs text-muted-foreground mb-1">Očekivani Povratak</div>
                <div className="flex items-center gap-1.5 text-foreground font-medium">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{c.expected_return_at ? formatDateTime(c.expected_return_at) : "Nije definisano"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Spisak opreme */}
          <div className="px-6 md:px-8 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Spisak Opreme ({selectedGroup.length} Stavki)</h3>
              {isOpen && (
                <Button size="sm" variant="outline" className="h-8 border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/20" onClick={() => setReturnWizardOpen(true)}>
                  <Undo2 className="mr-2 h-3.5 w-3.5" /> Grupni Povrat
                </Button>
              )}
            </div>
            
            <div className="bg-card dark:bg-[#1A1F2A] border border-border dark:border-slate-800/60 rounded-xl overflow-hidden">
              <div className="divide-y divide-border dark:divide-slate-800/60">
                {selectedGroup.map(row => (
                  <div key={row.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground text-sm">{row.assets?.name}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-1 flex items-center gap-2">
                        <span>{row.assets?.code}</span>
                        {row.assets?.serial_number && <span>• S/N: {row.assets.serial_number}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {row.returned_at ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-medium px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Vraćeno
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" className="h-8" onClick={() => setReturnFor(row)}>
                          Razduži
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer / PDF Download */}
          <div className="bg-muted/30 dark:bg-[#111318] border-t border-border dark:border-slate-800/60 p-6 md:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <div className="text-xs font-bold text-cyan-700 dark:text-cyan-400 uppercase tracking-widest mb-1">Dokumentacija</div>
              <div className="text-sm text-muted-foreground">Preuzmi revers u PDF formatu za potpisivanje ili arhivu.</div>
            </div>
            <div className="flex items-center gap-3">
              {canDelete && (
                <ConfirmDelete
                  title="Obrisati revers?"
                  description="Trajno uklanja zapis o zaduženju za sve stavke u ovom reversu."
                  onConfirm={() => {
                    for (const row of selectedGroup) remove.mutate(row.id);
                  }}
                />
              )}
              <Button
                variant="outline"
                className="border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-bold shrink-0 shadow-xs"
                onClick={() => openThermalRevers(selectedGroup)}
              >
                <Printer className="mr-2 h-4 w-4 text-amber-500" /> Termalni Revers
              </Button>
              <Button 
                className="bg-cyan-600 hover:bg-cyan-700 text-white shadow-lg shadow-cyan-900/20 shrink-0"
                onClick={() => downloadPdfGroup(selectedGroup)}
              >
                <FileDown className="mr-2 h-4 w-4" /> Preuzmi PDF Revers
              </Button>
            </div>
          </div>
        </div>

        {returnFor && returnFor.assets && (
          <ReturnDialog
            open={!!returnFor}
            onOpenChange={(v) => { if (!v) setReturnFor(null); qc.invalidateQueries({ queryKey: ["checkouts"] }); }}
            checkout={returnFor}
            asset={returnFor.assets}
          />
        )}
        <ReturnWizard open={returnWizardOpen} onOpenChange={(v) => { setReturnWizardOpen(v); qc.invalidateQueries({ queryKey: ["checkouts"] }); }} />
        <ThermalReversDialog
          open={thermalOpen}
          onOpenChange={setThermalOpen}
          data={thermalData}
        />
      </PageContainer>
    );
  }

  // LIST / GRID VIEW
  return (
    <PageContainer>
      <PageHeader
        title="Reversi (zaduženja)"
        description="Aktuelna i istorijska zaduženja opreme sa potpisima"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setWizardOpen(true)}>
              <Package className="mr-2 h-4 w-4" /> Izdavanje opreme
            </Button>
            <Button variant="outline" onClick={() => setReturnWizardOpen(true)}>
              <Undo2 className="mr-2 h-4 w-4" /> Povrat opreme
            </Button>
            <Button variant="outline" onClick={onExportCsv}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Izvoz
            </Button>
          </div>
        }
      />

      {/* Top Filter & Toolbar Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pretraži po događaju, licu, šifri ili skeniraj..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 pr-28 bg-card border-input focus-visible:ring-primary/50 text-sm h-10 rounded-lg shadow-xs"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {q && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setQ("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setScanOpen(true)}
              className="h-7 px-2.5 text-xs font-semibold gap-1 text-primary hover:text-primary shadow-xs"
              title="Skeniraj revers QR ili barkod opreme"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>Skeniraj</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Select value={status} onValueChange={(v) => setStatus(v as "all" | "open" | "closed")}>
            <SelectTrigger className="w-full sm:w-44 bg-card border-input h-10 rounded-lg text-sm shadow-xs">
              <SelectValue placeholder="Svi Statusi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi Reversi</SelectItem>
              <SelectItem value="open">Otvoreni (Zaduženo)</SelectItem>
              <SelectItem value="closed">Zatvoreni (Vraćeno)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className="w-full sm:w-44 bg-card border-input h-10 rounded-lg text-sm shadow-xs">
              <SelectValue placeholder="Sortiraj" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Novije prvo</SelectItem>
              <SelectItem value="date_asc">Starije prvo</SelectItem>
              <SelectItem value="event_asc">Po događaju (A-Z)</SelectItem>
            </SelectContent>
          </Select>

          {/* View Mode Toggle Switcher */}
          <div className="flex items-center bg-muted/60 border border-border rounded-lg p-1 h-10 gap-1 ml-auto sm:ml-0">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className={`h-8 w-8 rounded-md transition ${
                viewMode === "grid" ? "bg-card text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode("grid")}
              title="Prikaz u mreži (Grid)"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className={`h-8 w-8 rounded-md transition ${
                viewMode === "list" ? "bg-card text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode("list")}
              title="Prikaz u listi (Tabela)"
            >
              <ListIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Učitavanje…</div>
      ) : !groupedData.length ? (
        <div className="py-12 text-center bg-card border border-border rounded-2xl shadow-xs">
          <Receipt className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium text-foreground">Nema reversa</h3>
          <p className="text-sm text-muted-foreground mt-1">Nismo pronašli revers za odabrane filtere.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4.5">
          {groupedData.map((group) => {
            const c = group[0];
            const isOpen = group.some(x => !x.returned_at);
            const totalAssets = group.length;
            const gId = c.signature_path ? c.signature_path.split("-")[1]?.toUpperCase() : c.id.slice(0, 8);
            const revCode = `REV-${gId}`;

            return (
              <div 
                key={c.signature_path || c.id} 
                className="group relative flex flex-col justify-between rounded-2xl overflow-hidden border bg-card hover:bg-card/90 transition-all duration-300 hover:border-primary/40 hover:shadow-md cursor-pointer border-border"
                onClick={() => setSelectedGroup(group)}
              >
                <div className="relative w-full bg-muted/30 p-5 border-b border-border flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="px-2 py-1 rounded bg-muted border border-border text-foreground font-mono text-[10px] font-semibold tracking-wider">
                      {revCode}
                    </div>
                    <div className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
                      isOpen ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:border-amber-500/40 dark:text-amber-300" : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:border-emerald-500/40 dark:text-emerald-300"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-amber-500 animate-pulse" : "bg-emerald-500"} `} />
                      {isOpen ? "OTVORENO" : "ZATVORENO"}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-lg tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
                      {c.events?.name ?? "Bez događaja"}
                    </h3>
                    {c.events?.clients?.name && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.events.clients.name}</div>
                    )}
                  </div>
                </div>

                <div className="p-5 flex flex-col gap-3 flex-1">
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center gap-2.5 text-foreground">
                      <User className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                      <span className="font-medium truncate">{c.checked_out_to_name || "Nepoznato lice"}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-muted-foreground">
                      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>Izdato: {formatDate(c.checked_out_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-border bg-muted/20 flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">{totalAssets} {totalAssets === 1 ? "Stavka" : "Stavki"}</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">Detalji <span className="text-lg leading-none">&rarr;</span></span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden card-elevated border-border bg-card">
          <div className="divide-y divide-border">
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground bg-muted/40 font-semibold border-b border-border">
              <div className="col-span-2">Šifra Reversa</div>
              <div className="col-span-3">Događaj</div>
              <div className="col-span-2">Zadužio</div>
              <div className="col-span-2">Izdato</div>
              <div className="col-span-1 text-center">Stavki</div>
              <div className="col-span-2 text-right">Status</div>
            </div>
            {groupedData.map((group) => {
              const c = group[0];
              const isOpen = group.some(x => !x.returned_at);
              const gId = c.signature_path ? c.signature_path.split("-")[1]?.toUpperCase() : c.id.slice(0, 8);
              const revCode = `REV-${gId}`;

              return (
                <div
                  key={c.signature_path || c.id}
                  className="grid grid-cols-12 gap-3 md:gap-4 px-5 py-3.5 items-center cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setSelectedGroup(group)}
                >
                  <div className="col-span-12 md:col-span-2 font-mono text-sm text-foreground font-medium">{revCode}</div>
                  <div className="col-span-12 md:col-span-3">
                    <div className="font-medium text-foreground line-clamp-1">{c.events?.name ?? "Bez događaja"}</div>
                    {c.events?.clients?.name && <div className="text-xs text-muted-foreground line-clamp-1">{c.events.clients.name}</div>}
                  </div>
                  <div className="hidden md:block col-span-2 text-sm text-foreground line-clamp-1">{c.checked_out_to_name || "—"}</div>
                  <div className="hidden md:block col-span-2 text-sm text-muted-foreground">{formatDate(c.checked_out_at)}</div>
                  <div className="hidden md:block col-span-1 text-sm text-center text-foreground font-medium">{group.length}</div>
                  <div className="hidden md:block col-span-2 text-right">
                    <div className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider items-center gap-1.5 border ${
                      isOpen ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:border-amber-500/40 dark:text-amber-300" : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:border-emerald-500/40 dark:text-emerald-300"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-amber-500 animate-pulse" : "bg-emerald-500"} `} />
                      {isOpen ? "OTVORENO" : "ZATVORENO"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <CheckoutWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <ReturnWizard open={returnWizardOpen} onOpenChange={setReturnWizardOpen} />
      <ThermalReversDialog
        open={thermalOpen}
        onOpenChange={setThermalOpen}
        data={thermalData}
      />

      {/* Quick QR & Barcode Scanner Dialog for Checkouts Search */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md p-4">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              Skeniraj Revers ili Opremu
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <CameraScanner onScan={handleQuickScan} />
            <p className="text-xs text-muted-foreground text-center">
              Usmite kameru prema QR kodu na reversu ili barkodu opreme za instant pronalazak.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
