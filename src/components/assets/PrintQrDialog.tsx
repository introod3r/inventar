import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Printer, QrCode, Layers, Eye, Check, Settings2 } from "lucide-react";
import { printQrSheet, generateQrDataUrl, type QrItem, type QrLayout, type QrPrintOptions } from "@/lib/qr-print";
import { useCompanySettings } from "@/features/company/use-company-settings";
import { toast } from "sonner";

interface PrintQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: QrItem[];
  title?: string;
}

export function PrintQrDialog({ open, onOpenChange, items, title }: PrintQrDialogProps) {
  const { settings: companySettings } = useCompanySettings();
  const [layout, setLayout] = useState<QrLayout>("a4_24");
  const [showCode, setShowCode] = useState(true);
  const [showName, setShowName] = useState(true);
  const [showSerial, setShowSerial] = useState(true);
  const [showCompany, setShowCompany] = useState(true);
  const [companyName, setCompanyName] = useState(
    companySettings.qr_label_company_text || companySettings.short_name || "INVENTAR"
  );
  const [isPrinting, setIsPrinting] = useState(false);
  const [previewQrUrl, setPreviewQrUrl] = useState<string>("");

  useEffect(() => {
    if (companySettings) {
      setCompanyName(companySettings.qr_label_company_text || companySettings.short_name || "INVENTAR");
    }
  }, [companySettings]);

  const sampleItem: QrItem = items[0] ?? {
    code: "EQ-PA-001",
    name: "L-Acoustics K2 Line Array Speaker",
    serial: "SN-9981-LA",
  };

  useEffect(() => {
    if (open) {
      generateQrDataUrl(sampleItem.code)
        .then((url) => setPreviewQrUrl(url))
        .catch((err) => console.error(err));
    }
  }, [open, sampleItem.code]);

  const handlePrint = async () => {
    if (!items.length) {
      toast.error("Nema izabrane opreme za štampu.");
      return;
    }

    setIsPrinting(true);
    try {
      const options: QrPrintOptions = {
        layout,
        showCode,
        showName,
        showSerial,
        showCompany,
        companyName: companyName.trim(),
      };
      await printQrSheet(items, options);
      toast.success(`Uspešno pripremljeno ${items.length} nalepnica za štampu.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Greška pri štampanju: ${(err as Error).message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-2xl p-0 overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151921]">
        {/* Top Header Banner */}
        <div className="p-6 bg-linear-to-r from-cyan-600 via-blue-600 to-indigo-600 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
            <QrCode className="w-64 h-64 text-white" />
          </div>
          
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="bg-white/20 text-white font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full backdrop-blur-md">
                  ŠTAMPA NALEPNICA
                </span>
                <Badge className="bg-emerald-500/90 text-white border-0 text-xs font-semibold">
                  {items.length} {items.length === 1 ? 'izabran komad' : 'izabrana komada'}
                </Badge>
              </div>
              <DialogTitle className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                {title || "Podešavanje Štampe QR Kodova"}
              </DialogTitle>
              <p className="text-xs text-cyan-100/90">
                Izaberite format lista ili termalne trake i prilagodite izgled i podatak na nalepnicama.
              </p>
            </div>
            
            <div className="hidden sm:flex h-12 w-12 rounded-xl bg-white/10 backdrop-blur-md items-center justify-center border border-white/20 shrink-0">
              <Printer className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Main Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Section 1: Choose Layout Format */}
          <div className="space-y-3">
            <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-500" />
              1. Izaberite format štampe / list
            </Label>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Option A: Standard A4 24 */}
              <button
                type="button"
                onClick={() => setLayout("a4_24")}
                className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-2 ${
                  layout === "a4_24"
                    ? "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/30 text-slate-900 dark:text-slate-100"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {layout === "a4_24" && (
                  <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-3" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-sm">A4 Standard (24/str)</div>
                  <div className="text-xs text-slate-500 mt-0.5">3 kolone x 8 redova</div>
                </div>
                <div className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  Dimenzija: ~70 x 37 mm
                </div>
              </button>

              {/* Option B: Compact A4 40 */}
              <button
                type="button"
                onClick={() => setLayout("a4_40")}
                className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-2 ${
                  layout === "a4_40"
                    ? "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/30 text-slate-900 dark:text-slate-100"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {layout === "a4_40" && (
                  <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-3" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-sm">A4 Kompakt (40/str)</div>
                  <div className="text-xs text-slate-500 mt-0.5">4 kolone x 10 redova</div>
                </div>
                <div className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  Dimenzija: ~52 x 25 mm
                </div>
              </button>

              {/* Option C: Thermal Single Label */}
              <button
                type="button"
                onClick={() => setLayout("thermal_single")}
                className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-2 ${
                  layout === "thermal_single"
                    ? "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/30 text-slate-900 dark:text-slate-100"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {layout === "thermal_single" && (
                  <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-3" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-sm">Termalni štampač</div>
                  <div className="text-xs text-slate-500 mt-0.5">Rolna (Zebra, Brother...)</div>
                </div>
                <div className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  Dimenzija: 58 x 40 mm
                </div>
              </button>
            </div>
          </div>

          {/* Section 2: Layout & Field Customization + Live Sticker Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Field Toggles */}
            <div className="space-y-4 bg-slate-50/70 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                <Settings2 className="w-4 h-4 text-cyan-500" />
                2. Podaci na nalepnici
              </Label>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <Checkbox checked={showCode} onCheckedChange={(v) => setShowCode(Boolean(v))} />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Šifra opreme (QR Code ID)</div>
                    <div className="text-xs text-slate-500">npr. EQ-PA-001</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <Checkbox checked={showName} onCheckedChange={(v) => setShowName(Boolean(v))} />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Naziv osnovnog sredstva</div>
                    <div className="text-xs text-slate-500">Puni naziv opreme ili uređaja</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <Checkbox checked={showSerial} onCheckedChange={(v) => setShowSerial(Boolean(v))} />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Serijski broj (S/N)</div>
                    <div className="text-xs text-slate-500">Fabrički serijski broj ukoliko postoji</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
                  <Checkbox checked={showCompany} onCheckedChange={(v) => setShowCompany(Boolean(v))} />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Naziv firme / Zaglavlje</div>
                    <div className="text-xs text-slate-500">Tekst iznad šifre na nalepnici</div>
                  </div>
                </label>

                {showCompany && (
                  <div className="pl-7 pt-1">
                    <Input 
                      value={companyName} 
                      onChange={(e) => setCompanyName(e.target.value)} 
                      placeholder="Naziv firme ili magacina"
                      className="h-8.5 text-xs bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Live Sticker Preview Box */}
            <div className="space-y-3 flex flex-col">
              <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-500" />
                3. Pregled izgleda nalepnice
              </Label>

              <div className="flex-1 min-h-40 bg-slate-200 dark:bg-slate-950 p-6 rounded-2xl border border-slate-300 dark:border-slate-800 flex items-center justify-center shadow-inner relative overflow-hidden">
                <div className="absolute top-2 right-2 text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-widest pointer-events-none">
                  UŽIVO PREGLED
                </div>

                {/* Sticker Mockup Card */}
                <div className="bg-white text-slate-900 p-4 rounded-xl shadow-xl border border-slate-300 flex items-center gap-4 max-w-sm w-full transition-all duration-300 transform hover:scale-102">
                  {previewQrUrl ? (
                    <img src={previewQrUrl} alt="QR Sample" className="w-20 h-20 object-contain shrink-0 rounded border border-slate-200 p-0.5" />
                  ) : (
                    <div className="w-20 h-20 bg-slate-100 rounded flex items-center justify-center text-slate-400 shrink-0">
                      <QrCode className="w-10 h-10" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0 space-y-1">
                    {showCompany && companyName && (
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                        {companyName}
                      </div>
                    )}
                    {showCode && (
                      <div className="text-sm font-mono font-bold text-cyan-600 truncate">
                        {sampleItem.code}
                      </div>
                    )}
                    {showName && (
                      <div className="text-xs font-semibold text-slate-900 leading-tight line-clamp-2">
                        {sampleItem.name}
                      </div>
                    )}
                    {showSerial && sampleItem.serial && (
                      <div className="text-[11px] text-slate-500 font-mono">
                        S/N: {sampleItem.serial}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dialog Footer Actions */}
        <DialogFooter className="p-4 sm:p-6 bg-slate-50 dark:bg-[#111318] border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Spremano za štampu: <span className="font-bold text-slate-800 dark:text-slate-200">{items.length} nalepnica</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none border-slate-300 dark:border-slate-700"
            >
              Odustani
            </Button>

            <Button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting || !items.length}
              className="flex-1 sm:flex-none bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold px-6 shadow-lg shadow-cyan-900/20"
            >
              <Printer className="w-4 h-4 mr-2" />
              {isPrinting ? "Pripremam štampu..." : `Štampaj nalepnice (${items.length})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
