import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Printer, FileText } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useCompanySettings } from "@/features/company/use-company-settings";

export interface InventoryReportLine {
  id: string;
  expected_qty: number;
  counted_qty: number | null;
  note?: string | null;
  scanned_at?: string | null;
  assets?: {
    id: string;
    code: string;
    name: string;
    serial_number?: string | null;
    categories?: { name: string } | null;
    locations?: { name: string } | null;
  } | null;
}

export interface InventoryReportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventory: {
    id: string;
    name: string;
    type: "regular" | "ad_hoc";
    status: "open" | "completed" | "cancelled";
    started_at: string;
    completed_at?: string | null;
    notes?: string | null;
    locations?: { name: string } | null;
  };
  lines: InventoryReportLine[];
}

export function InventoryPrintReport({ open, onOpenChange, inventory, lines }: InventoryReportProps) {
  const { settings: companySettings } = useCompanySettings();
  const printContentRef = useRef<HTMLDivElement>(null);

  const totalExpected = lines.reduce((acc, l) => acc + (l.expected_qty || 0), 0);
  const totalCounted = lines.reduce((acc, l) => acc + (l.counted_qty || 0), 0);
  const totalMissing = lines.reduce((acc, l) => {
    const diff = (l.expected_qty || 0) - (l.counted_qty || 0);
    return acc + (diff > 0 ? diff : 0);
  }, 0);
  const totalSurplus = lines.reduce((acc, l) => {
    const diff = (l.counted_qty || 0) - (l.expected_qty || 0);
    return acc + (diff > 0 ? diff : 0);
  }, 0);

  const accuracyRate = totalExpected > 0 
    ? Math.max(0, Math.round(((totalExpected - totalMissing) / totalExpected) * 100)) 
    : 100;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 print:p-0 print:border-none print:shadow-none print:max-w-none print:max-h-none">
        {/* Modal Action Bar (Hidden on print) */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-primary" />
            Zapisnik o popisu opreme
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              Štampaj / Preuzmi PDF
            </Button>
          </div>
        </div>

        {/* Printable Document Area */}
        <div ref={printContentRef} className="p-8 md:p-10 bg-white text-slate-900 font-sans text-xs print:p-0">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * { visibility: hidden; }
              #printable-audit-report, #printable-audit-report * { visibility: visible; }
              #printable-audit-report { position: absolute; left: 0; top: 0; width: 100%; }
              @page { size: A4; margin: 12mm 15mm; }
            }
          `}} />

          <div id="printable-audit-report" className="space-y-6">
            {/* Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-start">
              <div>
                <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-1">
                  {companySettings.name} {companySettings.pib ? `| PIB: ${companySettings.pib}` : ""} {companySettings.city ? `(${companySettings.city})` : ""}
                </div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  Zapisnik o Popisu Opreme
                </h1>
                <p className="text-[11px] text-slate-600 mt-1 font-medium">
                  {inventory.type === "regular" ? "REDOVNI GODIŠNJI / PERIODIČNI POPIS" : "VANREDNI KONTROLNI POPIS"}
                </p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  ID: {inventory.id.slice(0, 8)}...
                </p>
              </div>

              <div className="text-right space-y-1">
                <div className="inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-300 bg-slate-100">
                  {inventory.status === "completed" ? "ZAVRŠEN I ZAKLJUČEN" : inventory.status === "cancelled" ? "OTKAZAN" : "U TOKU (RADNA VERZIJA)"}
                </div>
                <div className="text-[10px] text-slate-500">
                  Lokacija: <strong className="text-slate-800">{inventory.locations?.name || "Sve lokacije"}</strong>
                </div>
                <div className="text-[10px] text-slate-500">
                  Započeto: <span className="text-slate-800">{formatDateTime(inventory.started_at)}</span>
                </div>
                {inventory.completed_at && (
                  <div className="text-[10px] text-slate-500">
                    Zaključeno: <span className="text-slate-800">{formatDateTime(inventory.completed_at)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Inventory Notes if any */}
            {inventory.notes && (
              <div className="bg-slate-50 border border-slate-200 p-3 rounded text-[11px] text-slate-700">
                <span className="font-bold text-slate-900">Napomena / Zadatak komisije: </span>
                {inventory.notes}
              </div>
            )}

            {/* Summary Statistics Cards */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="border border-slate-200 bg-slate-50/50 p-3 rounded">
                <div className="text-[10px] uppercase font-bold text-slate-500">Knjigovodstveno (Očekivano)</div>
                <div className="text-lg font-black text-slate-900 mt-0.5">{totalExpected} kom</div>
              </div>
              <div className="border border-emerald-200 bg-emerald-50/50 p-3 rounded">
                <div className="text-[10px] uppercase font-bold text-emerald-800">Popisano (Stvarno stanje)</div>
                <div className="text-lg font-black text-emerald-700 mt-0.5">{totalCounted} kom</div>
              </div>
              <div className={`border p-3 rounded ${totalMissing > 0 ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-slate-50/50"}`}>
                <div className={`text-[10px] uppercase font-bold ${totalMissing > 0 ? "text-rose-800" : "text-slate-500"}`}>Utvrđeni Manjak</div>
                <div className={`text-lg font-black mt-0.5 ${totalMissing > 0 ? "text-rose-600" : "text-slate-700"}`}>{totalMissing} kom</div>
              </div>
              <div className={`border p-3 rounded ${totalSurplus > 0 ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-slate-50/50"}`}>
                <div className={`text-[10px] uppercase font-bold ${totalSurplus > 0 ? "text-amber-800" : "text-slate-500"}`}>Utvrđeni Višak</div>
                <div className={`text-lg font-black mt-0.5 ${totalSurplus > 0 ? "text-amber-600" : "text-slate-700"}`}>{totalSurplus} kom</div>
              </div>
            </div>

            {/* Reconciliation Accuracy Bar */}
            <div className="flex items-center justify-between text-[11px] border border-slate-200 px-3 py-2 rounded bg-slate-50">
              <span className="font-semibold text-slate-700">Stopa podudaranja popisanog stanja:</span>
              <span className="font-bold font-mono text-slate-900">{accuracyRate}% tačnosti</span>
            </div>

            {/* Items Table */}
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
                Specifikacija popisnih stavki ({lines.length} artikala)
              </div>
              <table className="w-full border-collapse border border-slate-300 text-[10px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 uppercase font-bold border-b border-slate-300">
                    <th className="p-2 border border-slate-300 text-center w-8">#</th>
                    <th className="p-2 border border-slate-300 text-left w-20">Šifra</th>
                    <th className="p-2 border border-slate-300 text-left">Naziv Opreme i Karakteristike</th>
                    <th className="p-2 border border-slate-300 text-left w-28">Lokacija</th>
                    <th className="p-2 border border-slate-300 text-center w-14">Knjig.</th>
                    <th className="p-2 border border-slate-300 text-center w-14">Stvarno</th>
                    <th className="p-2 border border-slate-300 text-center w-14">Razlika</th>
                    <th className="p-2 border border-slate-300 text-left w-28">Napomena</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, index) => {
                    const expected = l.expected_qty || 0;
                    const counted = l.counted_qty || 0;
                    const diff = counted - expected;
                    const asset = l.assets;

                    return (
                      <tr 
                        key={l.id} 
                        className={`border-b border-slate-200 ${
                          diff < 0 ? "bg-rose-50/40" : diff > 0 ? "bg-amber-50/40" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="p-2 border border-slate-300 text-center text-slate-500">{index + 1}</td>
                        <td className="p-2 border border-slate-300 font-mono font-bold text-slate-800">{asset?.code || "—"}</td>
                        <td className="p-2 border border-slate-300">
                          <div className="font-bold text-slate-900">{asset?.name || "Nepoznat artikal"}</div>
                          {asset?.serial_number && (
                            <div className="text-[9px] text-slate-500 font-mono">S/N: {asset.serial_number}</div>
                          )}
                        </td>
                        <td className="p-2 border border-slate-300 text-slate-600">{asset?.locations?.name || "—"}</td>
                        <td className="p-2 border border-slate-300 text-center font-mono font-medium">{expected}</td>
                        <td className="p-2 border border-slate-300 text-center font-mono font-bold text-slate-900">{counted}</td>
                        <td className="p-2 border border-slate-300 text-center font-mono font-bold">
                          {diff === 0 ? (
                            <span className="text-slate-400">0</span>
                          ) : diff > 0 ? (
                            <span className="text-amber-700">+{diff}</span>
                          ) : (
                            <span className="text-rose-700">{diff}</span>
                          )}
                        </td>
                        <td className="p-2 border border-slate-300 text-slate-600 italic">
                          {l.note || (diff < 0 ? "Nedostaje" : diff > 0 ? "Višak" : "U redu")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Signature & Commission Section */}
            <div className="pt-8 border-t border-slate-300 mt-8 page-break-inside-avoid">
              <div className="text-[11px] font-bold text-slate-800 mb-6 uppercase tracking-wider">
                Izjava i potpisi članova popisne komisije:
              </div>
              <p className="text-[10px] text-slate-600 mb-8 leading-relaxed">
                Komisija za popis ovim potvrđuje da je izvršila fizičko brojanje i utvrđivanje stanja opreme na terenu,
                te da su svi podaci uneti u ovaj zapisnik tačni, potpuni i verodostojni.
              </p>

              <div className="grid grid-cols-3 gap-8 pt-4">
                <div className="text-center space-y-8">
                  <div className="border-b border-slate-400 pb-1 h-6"></div>
                  <div className="text-[10px] text-slate-600">
                    <strong className="block text-slate-800">Predsednik komisije</strong>
                    (Ime, prezime i potpis)
                  </div>
                </div>

                <div className="text-center space-y-8">
                  <div className="border-b border-slate-400 pb-1 h-6"></div>
                  <div className="text-[10px] text-slate-600">
                    <strong className="block text-slate-800">Član komisije</strong>
                    (Ime, prezime i potpis)
                  </div>
                </div>

                <div className="text-center space-y-8">
                  <div className="border-b border-slate-400 pb-1 h-6"></div>
                  <div className="text-[10px] text-slate-600">
                    <strong className="block text-slate-800">Odgovorno lice magacina</strong>
                    (Ime, prezime i potpis)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
