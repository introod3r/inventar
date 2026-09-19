import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Printer, QrCode, Layers, Eye, Check, Settings2, Usb, Ruler, Info } from "lucide-react";
import { printQrSheet, generateQrDataUrl, type QrItem, type QrLayout, type QrPrintOptions } from "@/lib/qr-print";
import {
  THERMAL_LABEL_DIMENSIONS,
  type ThermalLabelSize,
  buildTsplLabels,
  printViaWebSerial,
  isWebSerialSupported,
} from "@/lib/thermal";
import { useCompanySettings } from "@/features/company/use-company-settings";
import { toast } from "sonner";

interface PrintQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: QrItem[];
  title?: string;
}

interface LabelPreviewConfig {
  name: string;
  formatType: "sheet" | "thermal";
  widthMm: number;
  heightMm: number;
  aspectRatio: number;
  maxWidthPx: number;
  qrSizeClass: string;
  paddingClass: string;
  gapClass: string;
  fontScale: {
    company: string;
    code: string;
    name: string;
    serial: string;
  };
  badgeLabel: string;
  badgeDetail: string;
  description: string;
}

export function PrintQrDialog({ open, onOpenChange, items, title }: PrintQrDialogProps) {
  const { settings: companySettings } = useCompanySettings();
  const [layout, setLayout] = useState<QrLayout>("a4_24");
  const [thermalSize, setThermalSize] = useState<ThermalLabelSize>(
    (companySettings.thermal_label_size as ThermalLabelSize) || "50x30"
  );
  const [showCode, setShowCode] = useState(true);
  const [showName, setShowName] = useState(true);
  const [showSerial, setShowSerial] = useState(true);
  const [showCompany, setShowCompany] = useState(true);
  const [companyName, setCompanyName] = useState(
    companySettings.qr_label_company_text || companySettings.short_name || "INVENTAR"
  );
  const [isPrinting, setIsPrinting] = useState(false);
  const [previewQrUrl, setPreviewQrUrl] = useState<string>("");

  const isThermal = layout.startsWith("thermal_");

  useEffect(() => {
    if (companySettings) {
      setCompanyName(companySettings.qr_label_company_text || companySettings.short_name || "INVENTAR");
      if (companySettings.thermal_label_size) {
        setThermalSize(companySettings.thermal_label_size as ThermalLabelSize);
      }
    }
  }, [companySettings]);

  const sampleItem: QrItem = items[0] ?? {
    code: "EQ-PA-001",
    name: "L-Acoustics K2 Line Array Speaker",
    serial: "SN-9981-LA",
  };

  const activeConfig: LabelPreviewConfig = useMemo(() => {
    if (isThermal) {
      switch (thermalSize) {
        case "40x25":
          return {
            name: "Termalna nalepnica 40 × 25 mm",
            formatType: "thermal",
            widthMm: 40,
            heightMm: 25,
            aspectRatio: 40 / 25,
            maxWidthPx: 290,
            qrSizeClass: "w-13 h-13 sm:w-14 sm:h-14",
            paddingClass: "p-2 sm:p-2.5",
            gapClass: "gap-2 sm:gap-2.5",
            fontScale: {
              company: "text-[9px]",
              code: "text-xs font-bold font-mono",
              name: "text-[11px] leading-tight line-clamp-1 font-semibold",
              serial: "text-[9px] font-mono",
            },
            badgeLabel: "40 × 25 mm (Kompaktna)",
            badgeDetail: "Termalna rolna · Kompaktna etiketa",
            description: "Optimizovano za kablove, mikrofone, bežične bubice i sitnu opremu.",
          };
        case "80x50":
          return {
            name: "Termalna nalepnica 80 × 50 mm",
            formatType: "thermal",
            widthMm: 80,
            heightMm: 50,
            aspectRatio: 80 / 50,
            maxWidthPx: 430,
            qrSizeClass: "w-22 h-22 sm:w-26 sm:h-26",
            paddingClass: "p-4 sm:p-5",
            gapClass: "gap-4 sm:gap-5",
            fontScale: {
              company: "text-xs font-bold tracking-wider",
              code: "text-base font-bold font-mono",
              name: "text-sm sm:text-base leading-snug line-clamp-2 font-bold",
              serial: "text-xs font-mono",
            },
            badgeLabel: "80 × 50 mm (Velika)",
            badgeDetail: "Termalna rolna · Veliki format",
            description: "Maksimalna čitljivost iz daljine za transportne sanduke, binske konstrukcije i rek ormane.",
          };
        case "60x40":
          return {
            name: "Termalna nalepnica 60 × 40 mm",
            formatType: "thermal",
            widthMm: 60,
            heightMm: 40,
            aspectRatio: 60 / 40,
            maxWidthPx: 370,
            qrSizeClass: "w-18 h-18 sm:w-20 sm:h-20",
            paddingClass: "p-3 sm:p-3.5",
            gapClass: "gap-3 sm:gap-3.5",
            fontScale: {
              company: "text-[10px] font-bold",
              code: "text-sm font-bold font-mono",
              name: "text-xs sm:text-sm leading-snug line-clamp-2 font-semibold",
              serial: "text-[11px] font-mono",
            },
            badgeLabel: "60 × 40 mm (Kofer/Rek)",
            badgeDetail: "Termalna rolna · Koferi i rekovi",
            description: "Format za flight case kofere, rek ormane, pojačala i zvučničke kutije.",
          };
        case "58x40":
          return {
            name: "Termalna nalepnica 58 × 40 mm",
            formatType: "thermal",
            widthMm: 58,
            heightMm: 40,
            aspectRatio: 58 / 40,
            maxWidthPx: 360,
            qrSizeClass: "w-18 h-18 sm:w-20 sm:h-20",
            paddingClass: "p-3 sm:p-3.5",
            gapClass: "gap-3 sm:gap-3.5",
            fontScale: {
              company: "text-[10px] font-bold",
              code: "text-sm font-bold font-mono",
              name: "text-xs sm:text-sm leading-snug line-clamp-2 font-semibold",
              serial: "text-[11px] font-mono",
            },
            badgeLabel: "58 × 40 mm (Standard)",
            badgeDetail: "Termalna rolna · Standardna",
            description: "Standardna artikl nalepnica sa više vertikalnog prostora za puni naziv.",
          };
        case "50x30":
        default:
          return {
            name: "Termalna nalepnica 50 × 30 mm",
            formatType: "thermal",
            widthMm: 50,
            heightMm: 30,
            aspectRatio: 50 / 30,
            maxWidthPx: 330,
            qrSizeClass: "w-16 h-16 sm:w-17 sm:h-17",
            paddingClass: "p-2.5 sm:p-3",
            gapClass: "gap-2.5 sm:gap-3",
            fontScale: {
              company: "text-[10px] font-bold",
              code: "text-xs sm:text-sm font-bold font-mono",
              name: "text-xs leading-tight line-clamp-2 font-semibold",
              serial: "text-[10px] font-mono",
            },
            badgeLabel: "50 × 30 mm (Industrijski)",
            badgeDetail: "Termalna rolna · Industrijski standard",
            description: "Najzastupljeniji magacinski standard za rasvetu, audio tehniku i monitore.",
          };
      }
    } else if (layout === "a4_40") {
      return {
        name: "A4 Tabak · 40 nalepnica/list",
        formatType: "sheet",
        widthMm: 52,
        heightMm: 25,
        aspectRatio: 52 / 25,
        maxWidthPx: 370,
        qrSizeClass: "w-13 h-13 sm:w-15 sm:h-15",
        paddingClass: "p-2 sm:p-2.5",
        gapClass: "gap-2 sm:gap-2.5",
        fontScale: {
          company: "text-[9px] font-bold",
          code: "text-xs font-bold font-mono",
          name: "text-[11px] leading-tight line-clamp-1 font-semibold",
          serial: "text-[10px] font-mono",
        },
        badgeLabel: "52 × 25 mm (A4 40/str)",
        badgeDetail: "A4 samolepljivi tabak · 4 kolone × 10 redova",
        description: "Ekonomičan list sa velikim brojem etiketa za standardne kancelarijske štampače.",
      };
    } else {
      // Default: a4_24
      return {
        name: "A4 Tabak · 24 nalepnice/list",
        formatType: "sheet",
        widthMm: 70,
        heightMm: 37,
        aspectRatio: 70 / 37,
        maxWidthPx: 390,
        qrSizeClass: "w-17 h-17 sm:w-19 sm:h-19",
        paddingClass: "p-3 sm:p-3.5",
        gapClass: "gap-3 sm:gap-3.5",
        fontScale: {
          company: "text-[10px] font-bold",
          code: "text-sm font-bold font-mono",
          name: "text-xs sm:text-sm leading-snug line-clamp-2 font-semibold",
          serial: "text-[11px] font-mono",
        },
        badgeLabel: "70 × 37 mm (A4 24/str)",
        badgeDetail: "A4 samolepljivi tabak · 3 kolone × 8 redova",
        description: "Standardne Avery/Herma samolepljive nalepnice za laserske i inkjet štampače.",
      };
    }
  }, [isThermal, thermalSize, layout]);

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
        layout: isThermal ? (`thermal_${thermalSize}` as QrLayout) : layout,
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

  const handleTsplPrint = async () => {
    if (!items.length) return;
    if (!isWebSerialSupported()) {
      toast.error("Web Serial API nije podržan u ovom pregledaču. Koristite Chrome ili Edge.");
      return;
    }

    setIsPrinting(true);
    try {
      const bytes = buildTsplLabels(
        items.map((it) => ({
          code: it.code || "BEZ-KODA",
          name: it.name || "Artikl",
          serialNumber: it.serial,
          companyName: companyName.trim(),
        })),
        { size: thermalSize }
      );
      const res = await printViaWebSerial(bytes);
      if (res.success) {
        toast.success(res.message || "Uspešno poslato na štampač nalepnica.");
        onOpenChange(false);
      } else if (res.message) {
        toast.info(res.message);
      }
    } catch (err) {
      toast.error((err as Error).message);
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
                onClick={() => {
                  setLayout(`thermal_${thermalSize}` as QrLayout);
                }}
                className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between gap-2 ${
                  isThermal
                    ? "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/30 text-slate-900 dark:text-slate-100"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {isThermal && (
                  <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-cyan-500 text-white flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-3" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-sm">Termalni štampač</div>
                  <div className="text-xs text-slate-500 mt-0.5">Rolna (TSC, Xprinter, Zebra...)</div>
                </div>
                <div className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  Dimenzija: {THERMAL_LABEL_DIMENSIONS[thermalSize].name}
                </div>
              </button>
            </div>

            {/* Sub-selector for standard thermal label sizes */}
            {isThermal && (
              <div className="pt-2 p-3.5 bg-cyan-50/50 dark:bg-cyan-950/20 rounded-xl border border-cyan-200/60 dark:border-cyan-900/40">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                  <span>Izaberite standardnu dimenziju nalepnice:</span>
                  <span className="font-mono text-cyan-700 dark:text-cyan-400 font-bold">
                    {THERMAL_LABEL_DIMENSIONS[thermalSize].widthMm} × {THERMAL_LABEL_DIMENSIONS[thermalSize].heightMm} mm
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(Object.keys(THERMAL_LABEL_DIMENSIONS) as ThermalLabelSize[]).map((sz) => {
                    const dim = THERMAL_LABEL_DIMENSIONS[sz];
                    const selected = thermalSize === sz;
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => {
                          setThermalSize(sz);
                          setLayout(`thermal_${sz}` as QrLayout);
                        }}
                        className={`p-2.5 rounded-lg border text-center transition-all ${
                          selected
                            ? "border-cyan-500 bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 font-bold ring-1 ring-cyan-500/40 shadow-xs"
                            : "border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 hover:border-slate-300 text-slate-700 dark:text-slate-300 text-xs"
                        }`}
                      >
                        <div className="text-xs font-mono font-bold">{dim.name}</div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">{dim.description.split(" ")[0]}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-500" />
                  3. Pregled izgleda nalepnice
                </Label>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-cyan-500/30 text-cyan-700 dark:text-cyan-300 bg-cyan-500/10"
                >
                  {activeConfig.badgeLabel}
                </Badge>
              </div>

              {/* Main Preview Frame */}
              <div className="flex-1 min-h-80 bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 rounded-2xl border border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center shadow-inner relative overflow-hidden transition-all">
                {/* Background Blueprint / Grid Pattern */}
                <div
                  className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
                  style={{
                    backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
                    backgroundSize: "16px 16px",
                  }}
                />

                {/* Top Info Bar inside frame */}
                <div className="w-full flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-3 pb-2 border-b border-slate-200/80 dark:border-slate-800/80">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse shrink-0" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {activeConfig.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 font-mono text-[10px] text-slate-500">
                    <Ruler className="w-3 h-3 text-cyan-500" />
                    <span>{(activeConfig.widthMm / activeConfig.heightMm).toFixed(2)} : 1</span>
                  </div>
                </div>

                {/* Sticker Mockup with Dimension Lines (Kotiranje) */}
                <div
                  className="w-full flex flex-col items-center justify-center transition-all duration-300 ease-out"
                  style={{ maxWidth: `${activeConfig.maxWidthPx}px` }}
                >
                  {/* Horizontal Width Dimension Ruler */}
                  <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 mb-1.5 px-0.5 select-none">
                    <div className="flex-1 flex items-center">
                      <div className="h-2.5 w-0.5 bg-cyan-500/60 rounded-full" />
                      <div className="flex-1 border-t border-dashed border-cyan-500/40" />
                    </div>
                    <span className="px-2 py-0.5 mx-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-cyan-700 dark:text-cyan-400 shadow-2xs">
                      {activeConfig.widthMm} mm
                    </span>
                    <div className="flex-1 flex items-center">
                      <div className="flex-1 border-t border-dashed border-cyan-500/40" />
                      <div className="h-2.5 w-0.5 bg-cyan-500/60 rounded-full" />
                    </div>
                  </div>

                  {/* Sticker Container with Height Ruler on the right */}
                  <div className="w-full flex items-center gap-2">
                    {/* The Physical Sticker Mockup */}
                    <div
                      className={`relative w-full bg-white text-slate-900 rounded-xl shadow-lg border border-slate-300/90 flex items-center ${activeConfig.gapClass} ${activeConfig.paddingClass} transition-all duration-300 ease-out transform hover:scale-[1.01]`}
                      style={{
                        aspectRatio: `${activeConfig.widthMm} / ${activeConfig.heightMm}`,
                      }}
                    >
                      {/* Media Backing Indicator (Thermal Roll Peel or A4 Label) */}
                      {activeConfig.formatType === "thermal" ? (
                        <div
                          className="absolute -inset-1.5 -z-10 rounded-xl bg-[#faf6eb] dark:bg-[#1e1c17] border border-amber-800/15 dark:border-amber-700/20 shadow-xs pointer-events-none opacity-90 transition-all"
                          title="Termalna papirna traka (Rolna)"
                        >
                          {/* Notch simulation */}
                          <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-4 rounded-r-full bg-slate-100 dark:bg-slate-950 border-r border-amber-800/20" />
                          <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-4 rounded-l-full bg-slate-100 dark:bg-slate-950 border-l border-amber-800/20" />
                        </div>
                      ) : (
                        <div
                          className="absolute -inset-1.5 -z-10 rounded-xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 pointer-events-none opacity-60 transition-all"
                          title="A4 Samolepljivi tabak"
                        />
                      )}

                      {/* QR Code Container */}
                      <div
                        className={`${activeConfig.qrSizeClass} bg-white rounded-lg border border-slate-200 p-1 flex items-center justify-center shrink-0 shadow-2xs transition-all duration-300`}
                      >
                        {previewQrUrl ? (
                          <img
                            src={previewQrUrl}
                            alt="QR Kod"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <QrCode className="w-full h-full text-slate-400" />
                        )}
                      </div>

                      {/* Label Text Metadata */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center space-y-0.5 transition-all">
                        {showCompany && companyName && (
                          <div
                            className={`${activeConfig.fontScale.company} font-bold text-slate-500 uppercase tracking-wider truncate`}
                          >
                            {companyName}
                          </div>
                        )}
                        {showCode && (
                          <div
                            className={`${activeConfig.fontScale.code} font-mono text-cyan-600 dark:text-cyan-600 truncate`}
                          >
                            {sampleItem.code}
                          </div>
                        )}
                        {showName && (
                          <div
                            className={`${activeConfig.fontScale.name} font-semibold text-slate-900 leading-tight`}
                          >
                            {sampleItem.name}
                          </div>
                        )}
                        {showSerial && sampleItem.serial && (
                          <div
                            className={`${activeConfig.fontScale.serial} text-slate-500 font-mono truncate`}
                          >
                            S/N: {sampleItem.serial}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vertical Height Dimension Ruler */}
                    <div className="h-full flex flex-col items-center justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 py-0.5 select-none shrink-0">
                      <div className="w-2.5 h-0.5 bg-cyan-500/60 rounded-full" />
                      <div className="flex-1 border-r border-dashed border-cyan-500/40 my-1" />
                      <span className="px-1 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-cyan-700 dark:text-cyan-400 shadow-2xs [writing-mode:vertical-lr] rotate-180">
                        {activeConfig.heightMm} mm
                      </span>
                      <div className="flex-1 border-r border-dashed border-cyan-500/40 my-1" />
                      <div className="w-2.5 h-0.5 bg-cyan-500/60 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Bottom Use Case Helper */}
                <div className="w-full mt-4 pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 flex items-start gap-2 text-left text-xs text-slate-500 dark:text-slate-400">
                  <Info className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
                  <div className="flex-1 text-[11px] leading-relaxed">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {activeConfig.badgeDetail}:{" "}
                    </span>
                    <span>{activeConfig.description}</span>
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

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none border-slate-300 dark:border-slate-700"
            >
              Odustani
            </Button>

            {isThermal && isWebSerialSupported() && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTsplPrint}
                disabled={isPrinting || !items.length}
                className="flex-1 sm:flex-none border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 font-semibold text-xs gap-1.5"
                title="Direktno USB slanje TSPL komandi"
              >
                <Usb className="w-3.5 h-3.5 text-amber-500" />
                Direktno TSPL (USB)
              </Button>
            )}

            <Button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting || !items.length}
              className="flex-1 sm:flex-none bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold px-5 shadow-lg shadow-cyan-900/20"
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
