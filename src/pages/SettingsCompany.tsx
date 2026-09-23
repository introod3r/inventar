import { useState, useEffect } from "react";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/features/auth/use-auth";
import {
  useCompanySettings,
  type CompanySettings,
  DEFAULT_COMPANY_SETTINGS,
} from "@/features/company/use-company-settings";
import {
  Building2,
  Palette,
  PackageCheck,
  Upload,
  Trash2,
  Loader2,
  Save,
  RotateCcw,
  ShieldAlert,
  Check,
  Receipt,
  Printer,
  Usb,
  Bluetooth,
  Award,
  Globe,
  Mail,
  Phone,
  ExternalLink,
  Sparkles,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import {
  type ThermalRollWidth,
  buildTestSlipEscPos,
  printThermalReceiptViaBrowser,
  printViaWebSerial,
  printViaWebBluetooth,
  isWebSerialSupported,
  isWebBluetoothSupported,
} from "@/lib/thermal";

const BRAND_PALETTES = [
  { label: "Sky Blue", value: "#0ea5e9", class: "bg-sky-500" },
  { label: "Indigo", value: "#6366f1", class: "bg-indigo-500" },
  { label: "Emerald", value: "#10b981", class: "bg-emerald-500" },
  { label: "Violet", value: "#8b5cf6", class: "bg-violet-500" },
  { label: "Amber", value: "#f59e0b", class: "bg-amber-500" },
  { label: "Crimson", value: "#f43f5e", class: "bg-rose-500" },
  { label: "Cyan", value: "#06b6d4", class: "bg-cyan-500" },
  { label: "Slate", value: "#64748b", class: "bg-slate-500" },
];

const CURRENCIES = [
  { code: "RSD", label: "RSD — Srpski dinar" },
  { code: "EUR", label: "EUR — Evro (€)" },
  { code: "USD", label: "USD — Američki dolar ($)" },
  { code: "CHF", label: "CHF — Švajcarski franak" },
  { code: "BAM", label: "BAM — Konvertibilna marka" },
];

export default function SettingsCompany() {
  const { hasRole, hasPermission } = useAuth();
  const { settings, updateSettings, isUpdating, uploadLogo, isUploadingLogo } = useCompanySettings();

  const [form, setForm] = useState<CompanySettings>(settings);
  const [activeTab, setActiveTab] = useState("profile");
  const [isTestingSlip, setIsTestingSlip] = useState(false);
  const [isUploadingVendorLogo, setIsUploadingVendorLogo] = useState(false);

  // Keep form in sync when settings load
  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  // Restrict access strictly to administrators
  if (!hasRole("admin") && !hasPermission("admin")) {
    return (
      <PageContainer>
        <Card className="max-w-md mx-auto mt-16 text-center p-8 border-destructive/30 shadow-lg">
          <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">Pristup Odbijen</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Podešavanjima profila firme i brendinga može pristupiti isključivo administrator sistema.
          </p>
        </Card>
      </PageContainer>
    );
  }

  const handleChange = (key: keyof CompanySettings, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(form);
  };

  const handlePrintTestSlip = async (mode: "browser" | "serial" | "bluetooth") => {
    setIsTestingSlip(true);
    try {
      const rollWidth = (form.thermal_roll_width as ThermalRollWidth) || 80;
      if (mode === "serial") {
        if (!isWebSerialSupported()) {
          toast.error("Web Serial API nije podržan u ovom pregledaču. Koristite Chrome ili Edge.");
          return;
        }
        const bytes = buildTestSlipEscPos(form.name, rollWidth);
        const res = await printViaWebSerial(bytes);
        if (res.success) toast.success(res.message);
        else if (res.message) toast.info(res.message);
      } else if (mode === "bluetooth") {
        if (!isWebBluetoothSupported()) {
          toast.error("Web Bluetooth nije podržan u ovom pregledaču. Koristite Chrome ili Android.");
          return;
        }
        const bytes = buildTestSlipEscPos(form.name, rollWidth);
        const res = await printViaWebBluetooth(bytes);
        if (res.success) toast.success(res.message);
        else if (res.message) toast.info(res.message);
      } else {
        // Universal browser print test slip
        await printThermalReceiptViaBrowser(
          {
            reversCode: "TEST-PROBA",
            eventName: "Kalibracija Termalnog Štampača",
            clientName: form.name,
            checkedOutTo: "Magacioner / Tehničar",
            checkedOutAt: new Date().toLocaleString("sr-RS"),
            expectedReturnAt: "Uspešan test",
            conditionOut: "Novo / Testirano",
            items: [
              { code: "EQ-TEST-001", name: "Primer Opreme: Aktivni Zvučnik", serialNumber: "SN-998811" },
              { code: "EQ-TEST-002", name: "Primer Opreme: DMX Signalni Kabl 10m", serialNumber: "KBL-01" },
            ],
            company: {
              name: form.name,
              pib: form.pib,
              mb: form.mb,
              address: form.address,
              city: form.city,
              phone: form.phone,
              disclaimer: "Ovo je zvanični probni termalni slip za kalibraciju širine rolne, kontrasta i čitljivosti barkoda.",
            },
          },
          rollWidth
        );
        toast.success("Pokrenuta probna štampa testnog slipa.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsTestingSlip(false);
    }
  };

  const handleResetDefaults = () => {
    if (confirm("Da li ste sigurni da želite da vratite podešavanja firme na podrazumevane vrednosti?")) {
      setForm(DEFAULT_COMPANY_SETTINGS);
      updateSettings(DEFAULT_COMPANY_SETTINGS);
      toast.info("Vraćeno na podrazumevana podešavanja.");
    }
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Izabrana datoteka mora biti slika (PNG, SVG, JPG).");
      return;
    }

    try {
      const publicUrl = await uploadLogo(file, "logo");
      if (publicUrl) {
        handleChange("logo_url", publicUrl);
        toast.success("Logotip je uspešno otpremljen!");
      }
    } catch (err) {
      toast.error((err as Error).message || "Greška pri otpremanju logotipa.");
    }
  };

  const handleVendorLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Izabrana datoteka mora biti slika (PNG, SVG, JPG).");
      return;
    }

    setIsUploadingVendorLogo(true);
    try {
      const publicUrl = await uploadLogo(file, "vendor-logo");
      if (publicUrl) {
        handleChange("vendor_logo_url", publicUrl);
        toast.success("Logotip proizvođača je uspešno otpremljen!");
      }
    } catch (err) {
      toast.error((err as Error).message || "Greška pri otpremanju logotipa proizvođača.");
    } finally {
      setIsUploadingVendorLogo(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Prilagođavanje Firme & Brending"
        description="Podešavanje identiteta, logotipa, pravnih klauzula reversa i parametara inventara po meri vašeg preduzeća"
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetDefaults}
              disabled={isUpdating}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Resetuj
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isUpdating}
              className="shadow-sm font-medium"
            >
              {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Sačuvaj izmene
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSave} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full h-auto p-1 gap-1">
            <TabsTrigger value="profile" className="flex items-center gap-2 py-2.5 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" />
              <span>Profil & Pravno lice</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="flex items-center gap-2 py-2.5 text-xs sm:text-sm">
              <Palette className="h-4 w-4" />
              <span>Logotip & Boje</span>
            </TabsTrigger>
            <TabsTrigger value="revers" className="flex items-center gap-2 py-2.5 text-xs sm:text-sm">
              <Receipt className="h-4 w-4" />
              <span>Revers & Klauzule</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-2 py-2.5 text-xs sm:text-sm">
              <PackageCheck className="h-4 w-4" />
              <span>Šifarnik & Oprema</span>
            </TabsTrigger>
            <TabsTrigger value="thermal" className="flex items-center gap-2 py-2.5 text-xs sm:text-sm">
              <Printer className="h-4 w-4 text-amber-500" />
              <span>Termalni štampač</span>
            </TabsTrigger>
            <TabsTrigger value="vendor" className="flex items-center gap-2 py-2.5 text-xs sm:text-sm">
              <Award className="h-4 w-4 text-sky-500" />
              <span>Proizvođač & Copyright</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Poslovni Profil i Pravni Podaci */}
          <TabsContent value="profile" className="mt-6 space-y-6">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" /> Osnovni Podaci o Preduzeću
                </CardTitle>
                <CardDescription>
                  Ovi podaci se automatski štampaju u zvaničnim memorandumima reversa i popisnim listama.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="companyName">Puni naziv firme / preduzeća *</Label>
                    <Input
                      id="companyName"
                      value={form.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="npr. Sky Solutions d.o.o."
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="shortName">Komercijalni / Brend naziv *</Label>
                    <Input
                      id="shortName"
                      value={form.short_name}
                      onChange={(e) => handleChange("short_name", e.target.value)}
                      placeholder="npr. SKYMUSIC ili EVENTASSET"
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Prikazuje se u gornjem meniju aplikacije i na mobilnim uređajima.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pib">PIB (Poreski identifikacioni broj)</Label>
                    <Input
                      id="pib"
                      value={form.pib}
                      onChange={(e) => handleChange("pib", e.target.value)}
                      placeholder="npr. 108954321"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="mb">Matični broj (MB)</Label>
                    <Input
                      id="mb"
                      value={form.mb}
                      onChange={(e) => handleChange("mb", e.target.value)}
                      placeholder="npr. 21045678"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="bankAccount">Tekući račun i banka</Label>
                    <Input
                      id="bankAccount"
                      value={form.bank_account}
                      onChange={(e) => handleChange("bank_account", e.target.value)}
                      placeholder="npr. 160-0000000123456-78 (Banca Intesa)"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg">Sedište i Zvanični Kontakti</CardTitle>
                <CardDescription>
                  Adresa i kontakt podaci za klijente, magacinski kontakt i izveštaje.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="address">Ulica i broj</Label>
                    <Input
                      id="address"
                      value={form.address}
                      onChange={(e) => handleChange("address", e.target.value)}
                      placeholder="npr. Bulevar Mihajla Pupina 10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="city">Grad</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => handleChange("city", e.target.value)}
                      placeholder="npr. Beograd"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode">Poštanski broj</Label>
                    <Input
                      id="postalCode"
                      value={form.postal_code}
                      onChange={(e) => handleChange("postal_code", e.target.value)}
                      placeholder="npr. 11070"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="country">Država</Label>
                    <Input
                      id="country"
                      value={form.country}
                      onChange={(e) => handleChange("country", e.target.value)}
                      placeholder="npr. Srbija"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Zvanični telefon</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      placeholder="npr. +381 11 123 4567"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email za revers i upite</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder="npr. office@firma.rs"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="website">Web sajt</Label>
                    <Input
                      id="website"
                      value={form.website}
                      onChange={(e) => handleChange("website", e.target.value)}
                      placeholder="npr. https://firma.rs"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: Logotip i Brending */}
          <TabsContent value="branding" className="mt-6 space-y-6">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" /> Logotip Preduzeća
                </CardTitle>
                <CardDescription>
                  Otpremite zvanični logo vaše firme. Logo se automatski koristi u navigaciji i na PDF dokumentima.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl border bg-muted/20">
                  <div className="w-32 h-32 rounded-2xl bg-card border-2 border-dashed border-border flex items-center justify-center p-3 overflow-hidden shadow-xs relative group">
                    {form.logo_url ? (
                      <img
                        src={form.logo_url}
                        alt="Company Logo"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center space-y-1 text-muted-foreground">
                        <Building2 className="w-8 h-8 mx-auto opacity-50" />
                        <span className="text-[10px] block">Nema logotipa</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 flex-1 text-center sm:text-left">
                    <div>
                      <h4 className="font-semibold text-sm">Datoteka logotipa</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Preporučujemo PNG ili SVG format sa transparentnom pozadinom (minimalno 400x120px).
                      </p>
                    </div>

                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="relative cursor-pointer"
                        disabled={isUploadingLogo}
                      >
                        {isUploadingLogo ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Izaberi novu sliku
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoFile}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          disabled={isUploadingLogo}
                        />
                      </Button>

                      {form.logo_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleChange("logo_url", null)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Ukloni logo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="logoUrl">Direktan URL logotipa (opciono)</Label>
                  <Input
                    id="logoUrl"
                    value={form.logo_url || ""}
                    onChange={(e) => handleChange("logo_url", e.target.value || null)}
                    placeholder="https://vaš-domen.rs/assets/logo.png"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg">Primarna Boja Brenda</CardTitle>
                <CardDescription>
                  Izaberite akcentnu boju koja najbolje reprezentuje vizuelni identitet vaše kompanije.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                  {BRAND_PALETTES.map((p) => {
                    const isSelected = form.brand_color.toLowerCase() === p.value.toLowerCase();
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => handleChange("brand_color", p.value)}
                        className={`group flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${
                          isSelected
                            ? "border-foreground bg-accent/30 shadow-xs scale-105"
                            : "border-transparent hover:bg-muted"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-full ${p.class} shadow-sm flex items-center justify-center text-white transition-transform group-hover:scale-110`}
                        >
                          {isSelected && <Check className="w-4 h-4 stroke-3" />}
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {p.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Label htmlFor="customColor" className="text-xs">
                    Prilagođeni HEX kod:
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      id="customColor"
                      value={form.brand_color}
                      onChange={(e) => handleChange("brand_color", e.target.value)}
                      className="w-9 h-9 rounded-md cursor-pointer border p-0.5 bg-background"
                    />
                    <Input
                      value={form.brand_color}
                      onChange={(e) => handleChange("brand_color", e.target.value)}
                      className="w-28 font-mono text-xs uppercase"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: Podešavanja Reversa i Zaduživanja */}
          <TabsContent value="revers" className="mt-6 space-y-6">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" /> Parametri PDF Reversa
                </CardTitle>
                <CardDescription>
                  Prilagodite naslov, numeraciju i pravne odredbe koje se štampaju pri svakom zaduživanju opreme.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reversTitle">Zvanični naslov dokumenta *</Label>
                    <Input
                      id="reversTitle"
                      value={form.revers_title}
                      onChange={(e) => handleChange("revers_title", e.target.value)}
                      placeholder="npr. REVERS - ZADUŽENJE OPREME"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reversPrefix">Prefiks broja reversa</Label>
                    <Input
                      id="reversPrefix"
                      value={form.revers_prefix}
                      onChange={(e) => handleChange("revers_prefix", e.target.value)}
                      placeholder="npr. REV ili IZL"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="defaultDays">Podrazumevani rok povrata (u danima)</Label>
                    <Input
                      id="defaultDays"
                      type="number"
                      min={1}
                      max={365}
                      value={form.default_return_days}
                      onChange={(e) => handleChange("default_return_days", Number(e.target.value))}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Automatski postavlja očekivani datum povrata pri kreiranju zaduženja.
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                    <div className="space-y-0.5 pr-2">
                      <Label htmlFor="showValue" className="text-sm font-medium cursor-pointer">
                        Prikaži finansijsku vrednost
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Da li revers prikazuje nabavnu/procenjenu cenu opreme.
                      </p>
                    </div>
                    <Checkbox
                      id="showValue"
                      checked={form.show_value_on_revers}
                      onCheckedChange={(checked) => handleChange("show_value_on_revers", Boolean(checked))}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="reversDisclaimer">
                        Pravna klauzula / Izjava o odgovornosti primaoca *
                      </Label>
                      <span className="text-[11px] text-muted-foreground">
                        {form.revers_disclaimer.length} karaktera
                      </span>
                    </div>
                    <Textarea
                      id="reversDisclaimer"
                      rows={4}
                      value={form.revers_disclaimer}
                      onChange={(e) => handleChange("revers_disclaimer", e.target.value)}
                      placeholder="Tekst koji preuzimalac potpisuje..."
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Ovaj tekst se štampa na dnu reversa direktno iznad digitalnog potpisa preuzimaoca.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Pravila Inventara i Šifarnika */}
          <TabsContent value="inventory" className="mt-6 space-y-6">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-primary" /> Šifriranje i Finansije Inventara
                </CardTitle>
                <CardDescription>
                  Podrazumevane vrednosti za katalog opreme, štampu QR nalepnica i amortizaciju.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="assetPrefix">Prefiks automatskih šifara opreme</Label>
                    <Input
                      id="assetPrefix"
                      value={form.asset_code_prefix}
                      onChange={(e) => handleChange("asset_code_prefix", e.target.value)}
                      placeholder="npr. AST ili EQ"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Primer generisane šifre: {form.asset_code_prefix}-1001
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Zvanična valuta sistema</Label>
                    <Select
                      value={form.currency}
                      onValueChange={(v) => handleChange("currency", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Izaberi valutu" />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="depreciationRate">
                      Podrazumevana godišnja stopa amortizacije (%)
                    </Label>
                    <Input
                      id="depreciationRate"
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={form.depreciation_rate}
                      onChange={(e) => handleChange("depreciation_rate", Number(e.target.value))}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Procenat za linearni proračun godišnjeg otpisa vrednosti opreme.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="qrCompany">Podrazumevani tekst na QR nalepnicama</Label>
                    <Input
                      id="qrCompany"
                      value={form.qr_label_company_text}
                      onChange={(e) => handleChange("qr_label_company_text", e.target.value)}
                      placeholder="npr. SKYMUSIC ili EVENTASSET"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Štampa se u zaglavlju svake nalepnice kofera ili kabla.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: Termalni Štampač */}
          <TabsContent value="thermal" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Printer className="h-5 w-5 text-amber-500" />
                  Konfiguracija Termalnih Štampača
                </CardTitle>
                <CardDescription>
                  Podešavanja za brzu štampu POS revers računa (58mm i 80mm) i nalepnica za opremu (rolna).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Širina POS Rolne */}
                  <div className="space-y-1.5">
                    <Label htmlFor="thermalRollWidth">Podrazumevana širina rolne za POS revers</Label>
                    <Select
                      value={String(form.thermal_roll_width || 80)}
                      onValueChange={(v) => handleChange("thermal_roll_width", Number(v))}
                    >
                      <SelectTrigger id="thermalRollWidth">
                        <SelectValue placeholder="Izaberite širinu rolne" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="80">80 mm — Standardni stoni POS štampač (Epson, Star, Bixolon)</SelectItem>
                        <SelectItem value="58">58 mm — Mobilni / kompaktni štampač (Sunmi, Rongta, Bluetooth)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Određuje raspored kolona i format štampe za slip zaduženja opreme.
                    </p>
                  </div>

                  {/* Format nalepnice */}
                  <div className="space-y-1.5">
                    <Label htmlFor="thermalLabelSize">Podrazumevana dimenzija nalepnice za opremu</Label>
                    <Select
                      value={form.thermal_label_size || "50x30"}
                      onValueChange={(v) => handleChange("thermal_label_size", v)}
                    >
                      <SelectTrigger id="thermalLabelSize">
                        <SelectValue placeholder="Izaberite format nalepnice" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50x30">50 × 30 mm — Industrijski standard za magacin</SelectItem>
                        <SelectItem value="58x40">58 × 40 mm — Standardna artikl nalepnica</SelectItem>
                        <SelectItem value="60x40">60 × 40 mm — Koferi i rek ormani</SelectItem>
                        <SelectItem value="40x25">40 × 25 mm — Kompaktna etiketa za kablove</SelectItem>
                        <SelectItem value="80x50">80 × 50 mm — Velika detaljna etiketa</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Dimenzija rolne etiketa koja se automatski predlaže pri štampi barkodova.
                    </p>
                  </div>

                  {/* Način konekcije */}
                  <div className="space-y-1.5">
                    <Label htmlFor="thermalConn">Podrazumevani način štampe</Label>
                    <Select
                      value={form.thermal_connection_mode || "browser"}
                      onValueChange={(v) => handleChange("thermal_connection_mode", v)}
                    >
                      <SelectTrigger id="thermalConn">
                        <SelectValue placeholder="Izaberite način konekcije" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="browser">Sistemski dijalog pregledača (Radi na svim uređajima i iOS)</SelectItem>
                        <SelectItem value="serial">Direktno USB / Virtual COM (Web Serial API)</SelectItem>
                        <SelectItem value="bluetooth">Bluetooth POS štampač (Web Bluetooth API)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Direktne USB i Bluetooth opcije omogućavaju 1-klik štampu bez sistemskih prozora na Chrome/Edge.
                    </p>
                  </div>

                  {/* Opcije štampe */}
                  <div className="space-y-3 pt-2">
                    <Label>Napredne opcije hardvera</Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="thermalAutocut"
                          checked={form.thermal_autocut !== false}
                          onCheckedChange={(v) => handleChange("thermal_autocut", Boolean(v))}
                        />
                        <Label htmlFor="thermalAutocut" className="text-sm font-normal cursor-pointer">
                          Automatsko sečenje papira (ESC/POS Auto-cut)
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Test Slip Section */}
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/15 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Printer className="h-4 w-4 text-amber-500" /> Probna Štampa (Test Slip)
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Odštampajte probni račun da proverite širinu, kontrast i čitljivost barkoda na vašem štampaču.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrintTestSlip("browser")}
                      disabled={isTestingSlip}
                      className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                    >
                      {isTestingSlip ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Printer className="w-3.5 h-3.5 mr-1.5" />}
                      Štampaj Test Slip (Sistemski)
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrintTestSlip("serial")}
                      disabled={isTestingSlip}
                      className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                    >
                      <Usb className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                      Test USB Serial
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrintTestSlip("bluetooth")}
                      disabled={isTestingSlip}
                      className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                    >
                      <Bluetooth className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                      Test Bluetooth
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 6: Proizvođač Aplikacije i Copyright */}
          <TabsContent value="vendor" className="mt-6 space-y-6">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Award className="h-5 w-5 text-sky-500" /> Podaci o Proizvođaču / Autoru Aplikacije
                </CardTitle>
                <CardDescription>
                  Definišite podatke o razvojnom timu, kompaniji proizvođača, verziji softvera i tehničkoj podršci.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="vendorName">Naziv proizvođača / kompanije *</Label>
                    <Input
                      id="vendorName"
                      value={form.vendor_name || ""}
                      onChange={(e) => handleChange("vendor_name", e.target.value)}
                      placeholder="npr. Introod3r Software"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="vendorUrl">Web sajt proizvođača</Label>
                    <div className="relative">
                      <Input
                        id="vendorUrl"
                        value={form.vendor_url || ""}
                        onChange={(e) => handleChange("vendor_url", e.target.value)}
                        placeholder="npr. https://introod3r.com"
                        className="pl-9"
                      />
                      <Globe className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="vendorEmail">Email za tehničku podršku</Label>
                    <div className="relative">
                      <Input
                        id="vendorEmail"
                        type="email"
                        value={form.vendor_support_email || ""}
                        onChange={(e) => handleChange("vendor_support_email", e.target.value)}
                        placeholder="npr. support@introod3r.com"
                        className="pl-9"
                      />
                      <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="vendorPhone">Telefon tehničke podrške</Label>
                    <div className="relative">
                      <Input
                        id="vendorPhone"
                        value={form.vendor_support_phone || ""}
                        onChange={(e) => handleChange("vendor_support_phone", e.target.value)}
                        placeholder="npr. +381 11 123 4567"
                        className="pl-9"
                      />
                      <Phone className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="appVersion">Oznaka verzije sistema</Label>
                    <div className="relative">
                      <Input
                        id="appVersion"
                        value={form.app_version_label || ""}
                        onChange={(e) => handleChange("app_version_label", e.target.value)}
                        placeholder="npr. Inventar Enterprise v2.6"
                        className="pl-9"
                      />
                      <Code2 className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Logotip Proizvođača */}
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" /> Logotip Proizvođača Softvera
                </CardTitle>
                <CardDescription>
                  Otpremite zvanični amblem ili logotip proizvođača ove aplikacije. Logotip se prikazuje u podnožju bočne trake i na ekranu za prijavu.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl border bg-muted/20">
                  <div className="w-32 h-32 rounded-2xl bg-card border-2 border-dashed border-border flex items-center justify-center p-3 overflow-hidden shadow-xs relative group">
                    {form.vendor_logo_url ? (
                      <img
                        src={form.vendor_logo_url}
                        alt="Vendor Logo"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center space-y-1 text-muted-foreground">
                        <Award className="w-8 h-8 mx-auto opacity-50 text-sky-500" />
                        <span className="text-[10px] block">Nema logotipa</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 flex-1 text-center sm:text-left">
                    <div>
                      <h4 className="font-semibold text-sm">Datoteka logotipa proizvođača</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Preporučujemo PNG ili SVG format sa transparentnom pozadinom (horizontalni odnos strana).
                      </p>
                    </div>

                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="relative cursor-pointer"
                        disabled={isUploadingVendorLogo}
                      >
                        {isUploadingVendorLogo ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Izaberi sliku logotipa
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleVendorLogoFile}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          disabled={isUploadingVendorLogo}
                        />
                      </Button>

                      {form.vendor_logo_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleChange("vendor_logo_url", null)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Ukloni logo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="vendorLogoUrl">Direktan URL logotipa proizvođača (opciono)</Label>
                  <Input
                    id="vendorLogoUrl"
                    value={form.vendor_logo_url || ""}
                    onChange={(e) => handleChange("vendor_logo_url", e.target.value || null)}
                    placeholder="https://introod3r.com/assets/logo.png"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Copyright i Prikaz */}
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-primary" /> Autorska Prava (Copyright) & Vidljivost
                </CardTitle>
                <CardDescription>
                  Podesite tekst autorskih prava i odredite mesta na kojima će se prikazivati oznaka proizvođača.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="copyrightText">Copyright tekst *</Label>
                  <Input
                    id="copyrightText"
                    value={form.copyright_text || ""}
                    onChange={(e) => handleChange("copyright_text", e.target.value)}
                    placeholder="npr. © 2026 Introod3r. Sva prava zadržana."
                  />
                  <p className="text-xs text-muted-foreground">
                    Ovaj tekst se prikazuje u podnožju aplikacije, na ekranu za prijavu i PDF dokumentima.
                  </p>
                </div>

                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between p-3.5 rounded-lg border bg-muted/20">
                    <div className="space-y-0.5">
                      <Label htmlFor="showVendorBadge" className="text-sm font-medium cursor-pointer">
                        Prikaži copyright i oznaku proizvođača u navigaciji i na prijavi
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Prikazuje diskretnu traku sa logotipom i copyright potpisom u dnu bočne trake i na login stranici.
                      </p>
                    </div>
                    <Checkbox
                      id="showVendorBadge"
                      checked={form.show_vendor_badge ?? true}
                      onCheckedChange={(checked) => handleChange("show_vendor_badge", !!checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-lg border bg-muted/20">
                    <div className="space-y-0.5">
                      <Label htmlFor="showVendorPdf" className="text-sm font-medium cursor-pointer">
                        Uključi oznaku softvera i proizvođača na PDF reversima
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Dodaje copyright napomenu u fusnotu generisanih PDF reversa i reversnih slipova.
                      </p>
                    </div>
                    <Checkbox
                      id="showVendorPdf"
                      checked={form.show_vendor_on_pdf ?? true}
                      onCheckedChange={(checked) => handleChange("show_vendor_on_pdf", !!checked)}
                    />
                  </div>
                </div>

                {/* Live Preview Card */}
                <div className="mt-4 p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Pregled Uživo (Kako izgleda u sistemu)
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-lg bg-card border shadow-xs text-xs">
                    <div className="flex items-center gap-2.5">
                      {form.vendor_logo_url ? (
                        <img
                          src={form.vendor_logo_url}
                          alt={form.vendor_name || "Vendor"}
                          className="h-5 w-auto max-w-20 object-contain rounded"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded bg-sky-500/15 text-sky-600 flex items-center justify-center font-bold text-[10px]">
                          {form.vendor_name?.[0] || "I"}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-foreground">{form.vendor_name || "Introod3r"}</span>
                        <span className="text-muted-foreground ml-2">{form.app_version_label || "v2.6"}</span>
                      </div>
                    </div>
                    <div className="text-muted-foreground font-mono text-[11px] truncate">
                      {form.copyright_text || "© 2026 Introod3r. Sva prava zadržana."}
                    </div>
                    {form.vendor_url && (
                      <a
                        href={form.vendor_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 text-[11px] font-medium shrink-0"
                      >
                        Web sajt <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Bottom Save Bar */}
        <div className="flex items-center justify-between p-4 rounded-xl border bg-card shadow-xs">
          <div className="text-xs text-muted-foreground">
            Izmene stupaju na snagu odmah nakon čuvanja u svim modulima i PDF dokumentima.
          </div>
          <Button type="submit" disabled={isUpdating} className="font-semibold shadow-sm">
            {isUpdating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Sačuvaj podešavanja firme
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
