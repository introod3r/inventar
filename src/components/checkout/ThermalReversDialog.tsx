import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Printer,
  Usb,
  Bluetooth,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  type ThermalReceiptData,
  type ThermalRollWidth,
  buildThermalReceiptEscPos,
  printThermalReceiptViaBrowser,
  printViaWebSerial,
  printViaWebBluetooth,
  isWebSerialSupported,
  isWebBluetoothSupported,
} from "@/lib/thermal";
import { useCompanySettings } from "@/features/company/use-company-settings";

interface ThermalReversDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ThermalReceiptData | null;
}

export function ThermalReversDialog({
  open,
  onOpenChange,
  data,
}: ThermalReversDialogProps) {
  const { settings: companySettings } = useCompanySettings();
  const [rollWidth, setRollWidth] = useState<ThermalRollWidth>(
    (companySettings.thermal_roll_width as ThermalRollWidth) || 80
  );
  const [previewQrUrl, setPreviewQrUrl] = useState<string>("");
  const [isPrinting, setIsPrinting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (data?.reversCode) {
      QRCode.toDataURL(data.reversCode, {
        margin: 1,
        width: rollWidth === 58 ? 160 : 220,
      })
        .then((url) => setPreviewQrUrl(url))
        .catch((err) => console.error(err));
    }
  }, [data?.reversCode, rollWidth]);

  if (!data) return null;

  // Enrich data with company settings if empty
  const activeData: ThermalReceiptData = {
    ...data,
    company: {
      name: data.company.name || companySettings.name || "EVENTASSET",
      pib: data.company.pib || companySettings.pib,
      mb: data.company.mb || companySettings.mb,
      address: data.company.address || companySettings.address,
      city: data.company.city || companySettings.city,
      phone: data.company.phone || companySettings.phone,
      disclaimer: data.company.disclaimer || companySettings.revers_disclaimer,
    },
  };

  const handleBrowserPrint = async () => {
    setIsPrinting(true);
    try {
      await printThermalReceiptViaBrowser(activeData, rollWidth);
      toast.success("Otvoren dijalog za termalnu štampu reversa.");
    } catch (err) {
      toast.error(`Greška pri štampanju: ${(err as Error).message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSerialPrint = async () => {
    if (!isWebSerialSupported()) {
      toast.error(
        "Web Serial API nije podržan u ovom pregledaču. Koristite Chrome ili Edge za direktnu USB štampu."
      );
      return;
    }

    setIsPrinting(true);
    try {
      const bytes = buildThermalReceiptEscPos(activeData, rollWidth);
      const res = await printViaWebSerial(bytes);
      if (res.success) {
        toast.success(res.message || "Revers uspešno poslat na USB štampač.");
      } else if (res.message) {
        toast.info(res.message);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleBluetoothPrint = async () => {
    if (!isWebBluetoothSupported()) {
      toast.error(
        "Web Bluetooth nije podržan u ovom pregledaču. Koristite Google Chrome ili Android."
      );
      return;
    }

    setIsPrinting(true);
    try {
      const bytes = buildThermalReceiptEscPos(activeData, rollWidth);
      const res = await printViaWebBluetooth(bytes);
      if (res.success) {
        toast.success(res.message || "Revers poslat na Bluetooth štampač.");
      } else if (res.message) {
        toast.info(res.message);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleCopyText = () => {
    const lines = [
      `*** REVERS ${activeData.reversCode} ***`,
      activeData.company.name,
      activeData.company.phone ? `Tel: ${activeData.company.phone}` : "",
      "--------------------------------",
      activeData.eventName ? `Dogadjaj: ${activeData.eventName}` : "",
      activeData.clientName ? `Klijent: ${activeData.clientName}` : "",
      `Preuzima: ${activeData.checkedOutTo}`,
      `Datum: ${activeData.checkedOutAt}`,
      activeData.expectedReturnAt ? `Rok povrata: ${activeData.expectedReturnAt}` : "",
      "--------------------------------",
      ...activeData.items.map(
        (it, i) => `${i + 1}. [${it.code}] ${it.name} ${it.serialNumber ? `(S/N: ${it.serialNumber})` : ""}`
      ),
      "--------------------------------",
      `Ukupno stavki: ${activeData.items.length}`,
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    toast.success("Tekst reversa kopiran u privremenu memoriju.");
    setTimeout(() => setCopied(false), 2000);
  };

  const serialSupported = isWebSerialSupported();
  const bluetoothSupported = isWebBluetoothSupported();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-3xl rounded-2xl p-0 overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-[#12151b]">
        {/* Header Bar */}
        <div className="p-5 bg-linear-to-r from-slate-900 via-zinc-900 to-neutral-900 text-white border-b border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-amber-500/30">
                  TERMALNI REVERS
                </span>
                <Badge className="bg-cyan-500 text-white font-mono text-xs">
                  {activeData.reversCode}
                </Badge>
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight text-white">
                Štampa POS Slip Reversa
              </DialogTitle>
              <p className="text-xs text-zinc-400">
                Pregled i instant štampa na termalnom POS štampaču od 58mm ili 80mm.
              </p>
            </div>

            {/* Roll width selector */}
            <div className="flex items-center bg-zinc-800/80 p-1 rounded-xl border border-zinc-700">
              <button
                type="button"
                onClick={() => setRollWidth(58)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  rollWidth === 58
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                58 mm (Uski)
              </button>
              <button
                type="button"
                onClick={() => setRollWidth(80)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  rollWidth === 80
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                80 mm (Standard)
              </button>
            </div>
          </div>
        </div>

        {/* Content Body with Realistic Thermal Receipt Simulation */}
        <div className="p-6 bg-slate-100 dark:bg-[#0c0e12] max-h-[68vh] overflow-y-auto flex flex-col items-center">
          {/* Thermal Paper Slip Graphic */}
          <div
            className={`w-full transition-all duration-300 bg-white text-black p-5 sm:p-7 shadow-2xl rounded-sm border-t-8 border-b-8 border-dashed border-zinc-300 font-mono relative select-none ${
              rollWidth === 58 ? "max-w-85 text-xs" : "max-w-115 text-sm"
            }`}
            style={{
              fontFamily: "'Courier New', Courier, Monaco, monospace",
            }}
          >
            {/* Paper tear jagged effect top */}
            <div className="absolute -top-3 left-0 right-0 h-3 bg-repeating-linear-gradient" />

            {/* Company Memorandum */}
            <div className="text-center space-y-0.5">
              <div className="font-extrabold text-base sm:text-lg tracking-wider">
                {activeData.company.name.toUpperCase()}
              </div>
              {(activeData.company.address || activeData.company.city) && (
                <div className="text-[11px] text-zinc-700">
                  {[activeData.company.address, activeData.company.city]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              )}
              {(activeData.company.pib || activeData.company.mb) && (
                <div className="text-[10px] text-zinc-600">
                  {[
                    activeData.company.pib ? `PIB: ${activeData.company.pib}` : "",
                    activeData.company.mb ? `MB: ${activeData.company.mb}` : "",
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </div>
              )}
              {activeData.company.phone && (
                <div className="text-[11px] text-zinc-700">
                  Tel: {activeData.company.phone}
                </div>
              )}
            </div>

            <div className="my-3 border-t-2 border-black border-dashed" />

            {/* Revers Code & QR Scan */}
            <div className="text-center my-2 space-y-1">
              <div className="font-extrabold text-sm sm:text-base tracking-widest bg-black text-white py-1 px-2 inline-block">
                REVERS: {activeData.reversCode}
              </div>
              {previewQrUrl && (
                <div className="flex flex-col items-center justify-center my-2">
                  <img
                    src={previewQrUrl}
                    alt="QR Revers"
                    className="w-28 h-28 object-contain border border-zinc-300 p-1"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <span className="text-[9px] text-zinc-500 mt-1">
                    * skeniraj za brzi povrat opreme *
                  </span>
                </div>
              )}
            </div>

            <div className="my-3 border-t border-black border-dashed" />

            {/* Metadata Fields */}
            <div className="space-y-1 text-xs">
              {activeData.eventName && (
                <div className="flex justify-between gap-2">
                  <span className="font-bold shrink-0">Događaj:</span>
                  <span className="text-right truncate font-bold">
                    {activeData.eventName}
                  </span>
                </div>
              )}
              {activeData.clientName && (
                <div className="flex justify-between gap-2">
                  <span className="font-bold shrink-0">Klijent:</span>
                  <span className="text-right truncate">{activeData.clientName}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="font-bold shrink-0">Preuzima:</span>
                <span className="text-right font-extrabold truncate">
                  {activeData.checkedOutTo}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-bold shrink-0">Izdato:</span>
                <span className="text-right">{activeData.checkedOutAt}</span>
              </div>
              {activeData.expectedReturnAt && (
                <div className="flex justify-between gap-2">
                  <span className="font-bold shrink-0">Rok povrata:</span>
                  <span className="text-right font-bold text-red-700">
                    {activeData.expectedReturnAt}
                  </span>
                </div>
              )}
              {activeData.conditionOut && (
                <div className="flex justify-between gap-2">
                  <span className="font-bold shrink-0">Stanje:</span>
                  <span className="text-right">{activeData.conditionOut}</span>
                </div>
              )}
              {activeData.notes && (
                <div className="text-[11px] pt-1 text-zinc-600">
                  <span className="font-bold">Napomena:</span> {activeData.notes}
                </div>
              )}
            </div>

            <div className="my-3 border-t-2 border-black border-dashed" />

            {/* Equipment Items List */}
            <div>
              <div className="flex justify-between font-bold text-xs pb-1 border-b border-black">
                <span>ŠIFRA / NAZIV</span>
                <span>KOM</span>
              </div>
              <div className="divide-y divide-zinc-200 py-1 space-y-1">
                {activeData.items.map((it, idx) => (
                  <div key={idx} className="pt-1 text-xs">
                    <div className="flex justify-between">
                      <span className="font-bold font-mono">{it.code}</span>
                      <span className="font-bold">1</span>
                    </div>
                    <div className="text-zinc-800 line-clamp-1">{it.name}</div>
                    {it.serialNumber && (
                      <div className="text-[10px] text-zinc-500 font-mono">
                        S/N: {it.serialNumber}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="my-3 border-t border-black border-dashed" />

            <div className="flex justify-between font-extrabold text-xs sm:text-sm">
              <span>UKUPNO STAVKI:</span>
              <span>{activeData.items.length} KOM</span>
            </div>

            <div className="my-3 border-t-2 border-black border-dashed" />

            {/* Legal Disclaimer */}
            <div className="text-[9px] leading-tight text-zinc-700 text-justify">
              {activeData.company.disclaimer ||
                "Preuzimalac potpisom potvrđuje prijem navedene opreme u ispravnom stanju i prihvata materijalnu odgovornost."}
            </div>

            {/* Signature Area */}
            <div className="mt-6 text-center space-y-1">
              {activeData.signatureDataUrl ? (
                <div className="flex justify-center">
                  <img
                    src={activeData.signatureDataUrl}
                    alt="Potpis"
                    className="max-h-16 object-contain"
                  />
                </div>
              ) : (
                <div className="w-3/4 mx-auto border-b border-dotted border-black h-8" />
              )}
              <div className="text-[10px] text-zinc-600">
                Potpis preuzimaoca: <strong>{activeData.checkedOutTo}</strong>
              </div>
            </div>

            {/* Footer Slip Time */}
            <div className="mt-6 pt-3 border-t border-dashed border-zinc-400 text-center text-[9px] text-zinc-500 space-y-0.5">
              <div>Štampano: {new Date().toLocaleString("sr-RS")}</div>
              <div className="font-bold tracking-widest text-zinc-700">
                * INVENTAR POS REVERS *
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white dark:bg-[#151921] border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyText}
              className="text-xs gap-1.5"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Kopirano!" : "Kopiraj Tekst"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Direct Bluetooth button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleBluetoothPrint}
              disabled={isPrinting}
              className={`text-xs gap-1.5 ${
                bluetoothSupported
                  ? "border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                  : "opacity-70"
              }`}
              title={
                bluetoothSupported
                  ? "Štampa direktno na prenosni Bluetooth POS štampač"
                  : "Zahteva pregledač sa Web Bluetooth podrškom (Chrome/Edge/Android)"
              }
            >
              <Bluetooth className="w-3.5 h-3.5 text-blue-500" />
              Bluetooth POS
            </Button>

            {/* Direct USB Serial button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSerialPrint}
              disabled={isPrinting}
              className={`text-xs gap-1.5 ${
                serialSupported
                  ? "border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  : "opacity-70"
              }`}
              title={
                serialSupported
                  ? "1-klik direktna štampa preko USB kabla (ESC/POS)"
                  : "Zahteva pregledač sa Web Serial podrškom (Chrome/Edge)"
              }
            >
              <Usb className="w-3.5 h-3.5 text-amber-500" />
              Direktno USB
            </Button>

            {/* Universal Browser Print button */}
            <Button
              size="sm"
              onClick={handleBrowserPrint}
              disabled={isPrinting}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs gap-1.5 shadow-md"
            >
              {isPrinting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              Štampaj Slip ({rollWidth}mm)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
