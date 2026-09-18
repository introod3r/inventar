import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import {
  Package,
  ScanLine,
  CalendarRange,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Clock,
  Receipt,
  Radio,
  Plus,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/use-auth";
import { formatDateTime } from "@/lib/format";
import { LocationMapDisplay } from "@/components/common/LocationMapDisplay";
const eventStatusMap: Record<string, string> = {
  draft: "Nacrt",
  confirmed: "Potvrđen",
  in_progress: "U toku",
  completed: "Završen",
  cancelled: "Otkazan",
};

const assetStatusMap: Record<string, string> = {
  reserved: "Rezervisano",
  picked: "Izdato",
  issued: "Izdato",
  returned: "Vraćeno",
  missing: "Nedostaje",
  cancelled: "Otkazano",
};

export default function Home() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [activityTab, setActivityTab] = useState<"overdue" | "recent">("overdue");

  useEffect(() => {
    const ch = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "assets" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "checkouts" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["dashboard-overdue"] });
        qc.invalidateQueries({ queryKey: ["dashboard-recent-checkouts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["dashboard-upcoming-events"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [total, available, atEvent, inService, damaged, openEvents] = await Promise.all([
        supabase.from("assets").select("*", { count: "exact", head: true }),
        supabase.from("assets").select("*", { count: "exact", head: true }).eq("status", "available"),
        supabase.from("assets").select("*", { count: "exact", head: true }).eq("status", "at_event"),
        supabase.from("assets").select("*", { count: "exact", head: true }).eq("status", "in_service"),
        supabase.from("assets").select("*", { count: "exact", head: true }).eq("status", "damaged"),
        supabase.from("events").select("*", { count: "exact", head: true }).in("status", ["confirmed", "in_progress"]),
      ]);
      return {
        total: total.count ?? 0,
        available: available.count ?? 0,
        atEvent: atEvent.count ?? 0,
        inService: inService.count ?? 0,
        damaged: damaged.count ?? 0,
        openEvents: openEvents.count ?? 0,
      };
    },
  });

  const { data: overdue } = useQuery({
    queryKey: ["dashboard-overdue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkouts")
        .select("id,asset_id,checked_out_to_name,expected_return_at,checked_out_at,assets:asset_id(code,name)")
        .is("returned_at", null)
        .not("expected_return_at", "is", null)
        .lt("expected_return_at", new Date().toISOString())
        .order("expected_return_at", { ascending: true })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["dashboard-recent-checkouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkouts")
        .select("id,asset_id,checked_out_to_name,checked_out_at,returned_at,assets:asset_id(code,name)")
        .order("checked_out_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: upcoming } = useQuery({
    queryKey: ["dashboard-upcoming-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id,name,start_at,end_at,status,location_text,event_assets(status,assets(name,code,status))")
        .gte("start_at", new Date().toISOString())
        .in("status", ["draft", "confirmed", "in_progress"])
        .order("start_at", { ascending: true })
        .limit(4); // Reduced limit slightly to accommodate larger cards
      if (error) throw error;
      return data ?? [];
    },
  });

  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return "Dobro veče";
    if (h < 12) return "Dobro jutro";
    if (h < 18) return "Dobar dan";
    return "Dobro veče";
  })();

  const primaryStats = [
    {
      label: "Dostupna Oprema",
      value: stats?.available ?? 0,
      total: stats?.total ?? 1,
      icon: CheckCircle2,
      accent: "emerald",
      border: "border-emerald-500/20 hover:border-emerald-500/50",
      bgIcon: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      progressBg: "bg-emerald-500",
      to: "/assets" as const,
    },
    {
      label: "Na Događaju",
      value: stats?.atEvent ?? 0,
      total: stats?.total ?? 1,
      icon: CalendarRange,
      accent: "blue",
      border: "border-blue-500/20 hover:border-blue-500/50",
      bgIcon: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      progressBg: "bg-blue-500",
      to: "/events" as const,
    },
    {
      label: "Na Servisu",
      value: stats?.inService ?? 0,
      total: stats?.total ?? 1,
      icon: Wrench,
      accent: "purple",
      border: "border-purple-500/20 hover:border-purple-500/50",
      bgIcon: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      progressBg: "bg-purple-500",
      to: "/service" as const,
    },
    {
      label: "Oštećeno",
      value: stats?.damaged ?? 0,
      total: stats?.total ?? 1,
      icon: AlertTriangle,
      accent: "rose",
      border: "border-rose-500/20 hover:border-rose-500/50",
      bgIcon: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      progressBg: "bg-rose-500",
      to: "/service" as const,
    },
  ];

  return (
    <PageContainer>
        
        {/* Polished Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl glass-card mesh-bg p-6 md:p-8">
          {/* Ambient Lighting Gradients */}
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none mix-blend-screen" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none mix-blend-screen" />
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800/50 dark:text-emerald-400 text-xs font-semibold tracking-wide backdrop-blur-sm">
                <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-600 dark:text-emerald-400" />
                <span>UŽIVO • SISTEM AKTIVAN</span>
              </div>
              
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight gradient-heading">
                {greeting}{firstName ? `, ${firstName}` : ""} 👋
              </h1>
              
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xl leading-relaxed">
                Dobrodošli na vaš pregled sistema. Trenutno je evidentirano{" "}
                <span className="text-slate-800 dark:text-slate-200 font-semibold">{stats?.total ?? "—"} komada opreme</span> i{" "}
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{stats?.openEvents ?? 0} aktivna događaja</span>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Button asChild size="lg" className="bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold shadow-lg shadow-cyan-500/25 h-12 px-6 rounded-xl transition-all hover:scale-[1.02]">
                <Link to="/scan">
                  <ScanLine className="mr-2 h-5 w-5" /> Skeniraj Opremu
                </Link>
              </Button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-6 pt-6 border-t border-slate-200/50 dark:border-slate-800/60 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Link
              to="/assets"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-cyan-500/40 hover:text-cyan-600 dark:hover:text-white transition backdrop-blur-sm"
            >
              <Package className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <span>Ukupno u inventaru:</span>
              <span className="font-bold text-slate-900 dark:text-white font-mono">{stats?.total ?? "—"}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
            </Link>

            {overdue && overdue.length > 0 && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/50 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 backdrop-blur-sm">
                <Clock className="h-4 w-4 text-rose-500 dark:text-rose-400 animate-pulse" />
                <span>Prekoračeni Reversi:</span>
                <span className="font-bold font-mono text-rose-700 dark:text-rose-200">{overdue.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Primary Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {primaryStats.map((c) => {
            const percentage = c.total > 0 ? Math.round((c.value / c.total) * 100) : 0;
            return (
              <Link
                key={c.label}
                to={c.to}
                className={`group relative overflow-hidden rounded-2xl glass-card p-5 card-hover-effect ${c.border}`}
              >
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] dark:opacity-[0.05] pointer-events-none transition-transform group-hover:scale-110 group-hover:-rotate-6">
                  <c.icon className="w-24 h-24" />
                </div>
                
                <div className="flex items-center justify-between mb-4 relative">
                  <div className={`p-2.5 rounded-xl border ${c.bgIcon} backdrop-blur-sm shadow-sm`}>
                    <c.icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs font-mono font-medium">
                    <span>{percentage}%</span>
                    <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition text-cyan-500" />
                  </div>
                </div>

                <div className="text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight font-mono mb-1 relative">
                  {c.value}
                </div>
                
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 relative">
                  {c.label}
                </div>

                {/* Progress bar line */}
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden relative">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${c.progressBg}`} 
                    style={{ width: `${Math.min(100, Math.max(5, percentage))}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Brze Akcije (Quick Actions Grid) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400" /> Brze Akcije i Pregled
            </h2>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickActionCard to="/scan" label="Skeniraj Opremu" desc="Kamera / QR Čitač" icon={ScanLine} iconBg="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20" />
            <QuickActionCard to="/assets/new" label="Nova Oprema" desc="Dodaj artikal u bazu" icon={Plus} iconBg="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" />
            <QuickActionCard to="/events/new" label="Novi Događaj" desc="Zakazivanje i oprema" icon={CalendarRange} iconBg="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" />
            <QuickActionCard to="/inventories" label="Pokreni Popis" desc="Provera magacina" icon={CheckCircle2} iconBg="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" />
          </div>
        </div>

        {/* Activity Logs (Mobile Tabs / Desktop Split) */}
        <div className="lg:hidden">
          <Tabs value={activityTab} onValueChange={(v) => setActivityTab(v as "overdue" | "recent")}>
            <TabsList className="grid grid-cols-2 w-full bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-1 rounded-xl">
              <TabsTrigger value="overdue" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white shadow-sm">
                <Clock className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                Prekoračenja
                {overdue && overdue.length > 0 && (
                  <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400">
                    {overdue.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="recent" className="gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-900 dark:data-[state=active]:text-white shadow-sm">
                <Receipt className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400" />
                Poslednji Reversi
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="overdue" className="mt-3">
              <div className="glass-card rounded-2xl p-4">
                <OverdueList items={overdue ?? []} />
              </div>
            </TabsContent>
            
            <TabsContent value="recent" className="mt-3">
              <div className="glass-card rounded-2xl p-4">
                <RecentList items={recent ?? []} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Desktop Split View */}
        <div className="hidden lg:grid grid-cols-2 gap-6">
          <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 backdrop-blur-sm">
                  <Clock className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Prekoračeni Reversi</h3>
              </div>
              {overdue && overdue.length > 0 && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400">
                  {overdue.length} stavki
                </span>
              )}
            </div>
            <OverdueList items={overdue ?? []} />
          </div>

          <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 backdrop-blur-sm">
                  <Receipt className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Poslednje Zadužene Stavke</h3>
              </div>
              <Link to="/checkouts" className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
                Prikaži sve <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <RecentList items={recent ?? []} />
          </div>
        </div>

        {/* Predstojeći Događaji */}
        <div className="glass-card rounded-2xl p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-200 dark:border-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 backdrop-blur-sm shrink-0">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg truncate">Predstojeći Događaji</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">Planirane aktivnosti i oprema</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs backdrop-blur-sm shrink-0">
              <Link to="/events">
                Svi Događaji <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          {!upcoming?.length ? (
            <div className="py-12 text-center text-slate-500">
              <CalendarRange className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2 opacity-60" />
              <p className="text-sm">Nema novih zakazanih događaja u narednom periodu.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {upcoming.map((e) => {
                const assets = e.event_assets || [];
                return (
                <Link
                  key={e.id}
                  to={`/events/${e.id}`}
                  className="group flex flex-col justify-between rounded-xl bg-white/40 dark:bg-[#1A1F2A]/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800 p-4 hover:border-cyan-500/40 hover:shadow-md transition-all hover:-translate-y-0.5 min-w-0 overflow-hidden"
                >
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors line-clamp-1 flex-1 min-w-0">
                        {e.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 shrink-0">
                        {eventStatusMap[e.status] || e.status}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5 mb-3 pt-2 border-t border-slate-200 dark:border-slate-800/60 text-[11px] font-mono text-slate-500 dark:text-slate-400 min-w-0">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="shrink-0">Početak:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate flex-1 text-right min-w-0">{formatDateTime(e.start_at)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="shrink-0">Kraj:</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate flex-1 text-right min-w-0">{formatDateTime(e.end_at)}</span>
                      </div>
                    </div>

                    {assets.length > 0 && (
                      <div className="mb-4 space-y-1.5">
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Oprema ({assets.length})</div>
                        <div className="space-y-1">
                          {assets.slice(0, 3).map((ea: any, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs bg-white/50 dark:bg-slate-900/50 px-2 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50 min-w-0 gap-2">
                              <span className="truncate text-slate-700 dark:text-slate-300 font-medium flex-1 min-w-0">{ea.assets?.name}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${ea.status === 'issued' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                                {assetStatusMap[ea.status] || ea.status}
                              </span>
                            </div>
                          ))}
                          {assets.length > 3 && (
                            <div className="text-[10px] text-center text-slate-400 italic">i još {assets.length - 3} kom...</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {e.location_text ? (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/60 min-w-0" onClick={(evt) => evt.preventDefault()}>
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mb-2">
                        📍 {e.location_text}
                      </div>
                      <LocationMapDisplay address={e.location_text} heightClass="h-32" hideHeader={true} />
                    </div>
                  ) : (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/60 text-xs text-slate-400 italic">
                      Lokacija nije navedena
                    </div>
                  )}
                </Link>
                );
              })}
            </div>
          )}
        </div>

    </PageContainer>
  );
}

function OverdueList({ items }: { items: Array<{ id: string; asset_id: string; checked_out_to_name: string | null; expected_return_at: string | null; assets: { code: string; name: string } | null }> }) {
  if (!items.length) {
    return (
      <div className="py-8 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500 dark:text-emerald-400 mx-auto mb-2 opacity-80" />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nema prekoračenih reversa 👌</p>
        <p className="text-xs text-slate-500 mt-1">Sva izdata oprema je u predviđenim rokovima.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            to={`/assets/${c.asset_id}`}
            className="flex items-center justify-between gap-3 rounded-xl bg-white/50 dark:bg-[#1A1F2A]/60 backdrop-blur-sm border border-slate-200 dark:border-slate-800/80 p-3 hover:border-rose-400/50 dark:hover:border-rose-500/40 hover:shadow-sm transition"
          >
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{c.assets?.name ?? "—"}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono mt-0.5">
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{c.assets?.code}</span> · {c.checked_out_to_name ?? "Nepoznato"}
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 shrink-0">
              {formatDateTime(c.expected_return_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentList({ items }: { items: Array<{ id: string; asset_id: string; checked_out_to_name: string | null; checked_out_at: string; returned_at: string | null; assets: { code: string; name: string } | null }> }) {
  if (!items.length) {
    return <p className="text-sm text-slate-500 py-8 text-center">Još nema evidencije reversa.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((c) => {
        const returned = !!c.returned_at;
        return (
          <li key={c.id}>
            <Link
              to={`/assets/${c.asset_id}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-card border border-border p-3 hover:border-cyan-500/40 hover:shadow-xs transition"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-foreground truncate">{c.assets?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                  <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{c.assets?.code}</span> · {c.checked_out_to_name ?? "Nepoznato"}
                </div>
              </div>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${
                  returned 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 dark:text-emerald-400" 
                    : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:border-blue-800/60 dark:text-blue-400"
                }`}
              >
                {returned ? "VRAĆENO" : "ZADUŽENO"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function QuickActionCard({
  to,
  label,
  desc,
  icon: Icon,
  iconBg,
}: {
  to: string;
  label: string;
  desc: string;
  icon: typeof Package;
  iconBg: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col justify-between rounded-2xl bg-card border border-border p-4 hover:border-cyan-500/40 hover:-translate-y-0.5 transition-all shadow-xs hover:shadow-md"
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-xl border ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
      </div>

      <div>
        <div className="font-bold text-sm text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
          {label}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {desc}
        </div>
      </div>
    </Link>
  );
}
