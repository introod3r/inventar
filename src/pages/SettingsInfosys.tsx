import { useState } from "react";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useInfosysSettings } from "@/features/integrations/use-infosys-settings";
import { INFOSYS_MODULE_DESCRIPTORS } from "@/lib/integrations/infosys/types";
import type { InfosysModuleId } from "@/lib/integrations/infosys/types";
import {
  generateInfosysAssetsCsv,
  generateInfosysClientsCsv,
  downloadFile,
} from "@/lib/integrations/infosys/imp-txt-converter";
import {
  Server,
  Key,
  Database,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  EyeOff,
  Radio,
  FileSpreadsheet,
  Layers,
  ArrowRightLeft,
  ExternalLink,
  ShieldCheck,
  Save,
  Trash2,
  Cpu,
  Info,
} from "lucide-react";

export default function SettingsInfosys() {
  const {
    config,
    updateConfig,
    toggleModule,
    client,
    logs,
    addLog,
    clearLogs,
  } = useInfosysSettings();

  const [activeTab, setActiveTab] = useState("server");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncingAssets, setIsSyncingAssets] = useState(false);
  const [isSyncingClients, setIsSyncingClients] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    serverVersion?: string;
  } | null>(null);

  // Connection Test
  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const res = await client.testConnection();
      setTestResult(res);

      addLog({
        module: "OS",
        direction: "TEST",
        title: "Testiranje veze sa API serverom",
        status: res.success ? "success" : "error",
        details: res.message + (res.latencyMs ? ` (odziv: ${res.latencyMs}ms)` : ""),
      });

      if (res.success) {
        toast.success(res.message, {
          description: `Odziv: ${res.latencyMs}ms | Verzija: ${res.serverVersion || "v2026.1"}`,
        });
      } else {
        toast.error("Neuspešno povezivanje", {
          description: res.message,
        });
      }
    } catch (err: any) {
      const msg = err.message || "Greška pri komunikaciji sa serverom";
      setTestResult({ success: false, message: msg });
      addLog({
        module: "OS",
        direction: "TEST",
        title: "Greška u konekciji",
        status: "error",
        details: msg,
      });
      toast.error(msg);
    } finally {
      setIsTesting(false);
    }
  };

  // Sync Partners/Clients from InfoSys into Supabase
  const handleSyncClients = async () => {
    setIsSyncingClients(true);
    try {
      const result = await client.syncClientsToSupabase(supabase as any);
      addLog({
        module: "FIN_KD",
        direction: "INBOUND",
        title: "Sinhronizacija partnera (FIN_KD)",
        status: "success",
        details: `Uvezeno novih: ${result.imported}, ažurirano postojećih: ${result.updated}`,
        itemsCount: result.imported + result.updated,
      });
      toast.success("Sinhronizacija partnera završena", {
        description: `Dodato ${result.imported} novih, ažurirano ${result.updated} partnera u bazi.`,
      });
    } catch (err: any) {
      addLog({
        module: "FIN_KD",
        direction: "INBOUND",
        title: "Neuspešna sinhronizacija partnera",
        status: "error",
        details: err.message || "Nepoznata greška",
      });
      toast.error("Greška pri sinhronizaciji partnera", {
        description: err.message,
      });
    } finally {
      setIsSyncingClients(false);
    }
  };

  // Sync Fixed Assets from InfoSys into Supabase assets
  const handleSyncAssets = async () => {
    setIsSyncingAssets(true);
    try {
      const result = await client.syncAssetsToSupabase(supabase as any);
      addLog({
        module: "OS",
        direction: "INBOUND",
        title: "Sinhronizacija osnovnih sredstava (OS)",
        status: "success",
        details: `Pronađeno u katalogu: ${result.matched}, ažurirano vrednosti: ${result.updated}`,
        itemsCount: result.matched,
      });
      toast.success("Sinhronizacija osnovnih sredstava završena", {
        description: `Usklađeno ${result.matched} artikala sa InfoSys knjigovodstvom.`,
      });
    } catch (err: any) {
      addLog({
        module: "OS",
        direction: "INBOUND",
        title: "Neuspešna sinhronizacija osnovnih sredstava",
        status: "error",
        details: err.message || "Nepoznata greška",
      });
      toast.error("Greška pri sinhronizaciji osnovnih sredstava", {
        description: err.message,
      });
    } finally {
      setIsSyncingAssets(false);
    }
  };

  // Export Assets to IMP_TXT CSV
  const handleExportAssetsCsv = async () => {
    try {
      const { data: assets, error } = await supabase
        .from("assets")
        .select("code, name, serial_number, purchase_value, current_value, depreciation_rate, purchase_date, status");

      if (error) throw error;

      const csv = generateInfosysAssetsCsv(assets || []);
      const filename = `INFOSYS_OS_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadFile(filename, csv);

      addLog({
        module: "IMP_TXT",
        direction: "OUTBOUND",
        title: "Eksport osnovnih sredstava (IMP_TXT)",
        status: "success",
        details: `Generisan fajl ${filename} sa ${(assets || []).length} stavki.`,
        itemsCount: (assets || []).length,
      });

      toast.success("Eksport uspešan", {
        description: `Preuzet fajl ${filename} sa ${assets?.length || 0} stavki.`,
      });
    } catch (err: any) {
      toast.error("Greška pri eksportu osnovnih sredstava", {
        description: err.message,
      });
    }
  };

  // Export Clients to IMP_TXT CSV
  const handleExportClientsCsv = async () => {
    try {
      const { data: clients, error } = await supabase
        .from("clients")
        .select("id, name, address, phone, email, contact");

      if (error) throw error;

      const csv = generateInfosysClientsCsv(clients || []);
      const filename = `INFOSYS_PARTNERI_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadFile(filename, csv);

      addLog({
        module: "IMP_TXT",
        direction: "OUTBOUND",
        title: "Eksport baze partnera (IMP_TXT)",
        status: "success",
        details: `Generisan fajl ${filename} sa ${(clients || []).length} partnera.`,
        itemsCount: (clients || []).length,
      });

      toast.success("Eksport uspešan", {
        description: `Preuzet fajl ${filename} sa ${clients?.length || 0} partnera.`,
      });
    } catch (err: any) {
      toast.error("Greška pri eksportu klijenata", {
        description: err.message,
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="InfoSys ERP Integracija"
        description="Povezivanje sa knjigovodstvenim softverom InfoSys (Visual FoxPro / .NET 4.0 IIS API Server)."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? "animate-spin text-primary" : ""}`} />
              Testiraj vezu
            </Button>
            <Button
              size="sm"
              onClick={() => toast.success("Podešavanja su sačuvana u memoriji sistema.")}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Sačuvano
            </Button>
          </div>
        }
      />

      {/* Top Connection Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                config.isMockMode
                  ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                  : config.enabled
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Server className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                  Status Servera
                </span>
                {config.isMockMode && (
                  <Badge variant="secondary" className="text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20">
                    MOCK / DEMO
                  </Badge>
                )}
              </div>
              <div className="text-base font-semibold truncate flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    config.isMockMode
                      ? "bg-sky-500 animate-pulse"
                      : config.enabled
                      ? "bg-emerald-500"
                      : "bg-rose-500"
                  }`}
                />
                {config.isMockMode
                  ? "Lokalna simulacija aktivna"
                  : config.enabled
                  ? "Povezano sa serverom"
                  : "Integracija isključena"}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {config.serverUrl || "Adresa nije konfigurisana"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                InfoSys Baza Podataka
              </span>
              <div className="text-base font-semibold truncate mt-0.5">
                {config.databaseId || "DEFAULT"}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                Aktivnih modula: {config.activeModules.length} od 5
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Radio className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                Brzina Odziva (Ping)
              </span>
              <div className="text-base font-semibold truncate mt-0.5">
                {testResult?.latencyMs != null ? `${testResult.latencyMs} ms` : "Nije izmereno"}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {testResult ? testResult.message : "Kliknite na 'Testiraj vezu' za merenje"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 max-w-md w-full">
          <TabsTrigger value="server" className="gap-2">
            <Server className="w-4 h-4" />
            Server
          </TabsTrigger>
          <TabsTrigger value="modules" className="gap-2">
            <Layers className="w-4 h-4" />
            Moduli
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Dnevnik ({logs.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: SERVER & CREDENTIALS */}
        <TabsContent value="server" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" />
                    Pristupni Parametri InfoSys API Servera
                  </CardTitle>
                  <CardDescription>
                    Povežite sistem sa lokalnim ili udaljenim InfoSys API serverom koji upravlja Visual FoxPro bazama podataka.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 rounded-lg border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label htmlFor="enabled" className="text-sm font-medium cursor-pointer">
                        Omogući integraciju sa InfoSys sistemom
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Dozvoljava razmenu podataka i automatsku komunikaciju.
                      </p>
                    </div>
                    <Checkbox
                      id="enabled"
                      checked={config.enabled}
                      onCheckedChange={(checked) => updateConfig({ enabled: !!checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3.5 rounded-lg border bg-sky-500/5 border-sky-500/20">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="mock" className="text-sm font-medium cursor-pointer text-sky-700 dark:text-sky-300">
                          Režim simulacije (Demo / Offline Mock)
                        </Label>
                        <Badge variant="outline" className="text-[10px] border-sky-400 text-sky-600">
                          Preporučeno za test
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Omogućava testiranje sinhronizacije osnovnih sredstava i partnera bez fizičkog Windows IIS servera.
                      </p>
                    </div>
                    <Checkbox
                      id="mock"
                      checked={config.isMockMode}
                      onCheckedChange={(checked) => updateConfig({ isMockMode: !!checked })}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="serverUrl">Adresa InfoSys API Servera (URL / IP)</Label>
                      <div className="relative">
                        <Input
                          id="serverUrl"
                          placeholder="http://192.168.1.50:8080 ili https://erp.firma.rs:8443"
                          value={config.serverUrl}
                          onChange={(e) => updateConfig({ serverUrl: e.target.value })}
                          className="font-mono text-sm pl-9"
                        />
                        <Server className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Unesite internu LAN IP adresu Windows servera ili javni domen sa otvorenim portom za IIS/Abyss server.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="apiKey">InfoSys API Ključ (Bearer Token)</Label>
                      <div className="relative">
                        <Input
                          id="apiKey"
                          type={showApiKey ? "text" : "password"}
                          placeholder="is_live_sec_..."
                          value={config.apiKey}
                          onChange={(e) => updateConfig({ apiKey: e.target.value })}
                          className="font-mono text-sm pl-9 pr-10"
                        />
                        <Key className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded"
                          tabIndex={-1}
                        >
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="databaseId">Identifikator Baze Podataka (FoxWin ID)</Label>
                      <div className="relative">
                        <Input
                          id="databaseId"
                          placeholder="INFOSYS_2026 ili DEFAULT"
                          value={config.databaseId}
                          onChange={(e) => updateConfig({ databaseId: e.target.value })}
                          className="font-mono text-sm pl-9"
                        />
                        <Database className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Protokol: <strong>REST / JSON preko HTTP(S)</strong>
                    </div>
                    <Button
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isTesting ? "animate-spin" : ""}`} />
                      {isTesting ? "Povezivanje u toku..." : "Testiraj i autorizuj vezu"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Automation card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-primary" />
                    Automatska Sinhronizacija u Pozadini
                  </CardTitle>
                  <CardDescription>
                    Podesite automatsko osvežavanje stanja osnovnih sredstava i partnera u definisanim intervalima.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-0.5">
                      <Label htmlFor="autoSync" className="text-sm font-medium cursor-pointer">
                        Periodična pozadinska sinhronizacija
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatski usklađuje amortizaciju i promene partnera.
                      </p>
                    </div>
                    <Checkbox
                      id="autoSync"
                      checked={config.autoSync}
                      onCheckedChange={(checked) => updateConfig({ autoSync: !!checked })}
                    />
                  </div>

                  {config.autoSync && (
                    <div className="flex items-center gap-4 pt-2">
                      <Label className="text-sm whitespace-nowrap">Interval sinhronizacije:</Label>
                      <Select
                        value={String(config.autoSyncIntervalHours)}
                        onValueChange={(val) => updateConfig({ autoSyncIntervalHours: Number(val) })}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Svakih 1 sat</SelectItem>
                          <SelectItem value="3">Svaka 3 sata</SelectItem>
                          <SelectItem value="6">Svakih 6 sati</SelectItem>
                          <SelectItem value="12">Svakih 12 sati</SelectItem>
                          <SelectItem value="24">Jednom dnevno (24h)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar technical details */}
            <div className="space-y-6">
              <Card className="bg-muted/30 border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Zahtevi za InfoSys Server
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                  <p>
                    Za direktno povezivanje potrebno je da u firmi na računaru gde se nalazi glavna baza InfoSys-a budu instalirani:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-foreground/80">
                    <li>Windows operativni sistem (Server ili 10/11 Pro)</li>
                    <li><strong>Microsoft .NET Framework 4.0 Full</strong></li>
                    <li><strong>IIS</strong> ili <strong>Abyss Web Server</strong></li>
                    <li>Fiksna javna IP adresa (ili statički VPN tunel za LAN)</li>
                    <li>Modul <strong>InfoSys API Server</strong> sa aktivnim licenciranim aplikativnim modulima</li>
                  </ul>
                  <div className="pt-2 border-t">
                    <a
                      href="https://www.infosys.rs/programi/?module_task=infoapi"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
                    >
                      Zvanična InfoSys API specifikacija <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/30 border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-4 h-4 text-sky-500" />
                    Offline i Ručni Rad (IMP_TXT)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground leading-relaxed space-y-2">
                  <p>
                    Ukoliko nemate fiksnu IP adresu ili API server modul, koristite tab <strong>Moduli</strong> za preuzimanje CSV fajlova sa separatorom tačka-zarez (<code>;</code>).
                  </p>
                  <p>
                    InfoSys kroz modul <strong>IMP_TXT</strong> direktno uvozi ove fajlove u tabele bez potrebe za internetom.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: MODULES & DIRECT ACTIONS */}
        <TabsContent value="modules" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {INFOSYS_MODULE_DESCRIPTORS.map((mod) => {
              const isActive = config.activeModules.includes(mod.id as InfosysModuleId);
              return (
                <Card
                  key={mod.id}
                  className={`transition-all ${
                    isActive ? "border-primary/40 bg-card shadow-sm" : "border-border/40 opacity-70 bg-muted/20"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                          {mod.code}
                        </span>
                        <div>
                          <CardTitle className="text-base">{mod.name}</CardTitle>
                          <span className="text-xs text-muted-foreground">{mod.category}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={isActive}
                          onCheckedChange={() => toggleModule(mod.id as InfosysModuleId)}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <p className="text-muted-foreground leading-relaxed">{mod.description}</p>

                    <div className="pt-2 border-t flex flex-wrap items-center gap-2">
                      {mod.id === "OS" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={handleSyncAssets}
                            disabled={isSyncingAssets || !config.enabled}
                            className="gap-1.5 h-8 text-xs"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAssets ? "animate-spin" : ""}`} />
                            Usklađivanje vrednosti (OS)
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportAssetsCsv}
                            className="gap-1.5 h-8 text-xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Preuzmi CSV za IMP_TXT
                          </Button>
                        </>
                      )}

                      {mod.id === "FIN_KD" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={handleSyncClients}
                            disabled={isSyncingClients || !config.enabled}
                            className="gap-1.5 h-8 text-xs"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingClients ? "animate-spin" : ""}`} />
                            Preuzmi partnere u Klijente
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportClientsCsv}
                            className="gap-1.5 h-8 text-xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Preuzmi CSV za IMP_TXT
                          </Button>
                        </>
                      )}

                      {mod.id === "ROB" && (
                        <div className="text-muted-foreground italic flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          Reversi se automatski šalju pri zaduživanju ako je uključen modul.
                        </div>
                      )}

                      {mod.id === "IMP_TXT" && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportAssetsCsv}
                            className="gap-1.5 h-8 text-xs"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                            OS Tabela
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleExportClientsCsv}
                            className="gap-1.5 h-8 text-xs"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                            Partneri Tabela
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* TAB 3: AUDIT LOGS */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-primary" />
                  Istorija Razmene Podataka sa InfoSys-om
                </CardTitle>
                <CardDescription>
                  Hronološki pregled svih sinhronizacija, uvoza i slanja dokumenata.
                </CardDescription>
              </div>
              {logs.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearLogs}
                  className="gap-1 text-xs text-muted-foreground hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Obriši dnevnik
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  Dnevnik je prazan. Izvršite test veze ili sinhronizaciju za prikaz zapisa.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="border-b bg-muted/40 text-muted-foreground uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Vreme</th>
                        <th className="py-2.5 px-3">Modul</th>
                        <th className="py-2.5 px-3">Smer</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Aktivnost & Detalji</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {logs.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-muted-foreground">
                            {new Date(item.timestamp).toLocaleString("sr-RS", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-foreground">
                            {item.module}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                item.direction === "INBOUND"
                                  ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
                                  : item.direction === "OUTBOUND"
                                  ? "border-blue-500/30 text-blue-600 bg-blue-500/10"
                                  : "border-slate-500/30 text-slate-600 bg-slate-500/10"
                              }`}
                            >
                              {item.direction}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3">
                            {item.status === "success" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Uspešno
                              </span>
                            ) : item.status === "error" ? (
                              <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                                <XCircle className="w-3.5 h-3.5" /> Greška
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" /> Upozorenje
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-foreground">{item.title}</div>
                            {item.details && (
                              <div className="text-muted-foreground text-[11px] mt-0.5">
                                {item.details}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
