import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";



function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtDay(d: Date) {
  return d.toLocaleDateString("sr-RS", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export default function Calendar() {
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(anchor, i)), [anchor]);
  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);

  const { data: reservations, isLoading } = useQuery({
    queryKey: ["calendar-reservations", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_assets")
        .select("id,event_id,asset_id,reserved_from,reserved_to,quantity,status,assets:asset_id(code,name),events:event_id(name,status)")
        .lt("reserved_from", rangeEnd.toISOString())
        .gt("reserved_to", rangeStart.toISOString())
        .order("reserved_from", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // group by asset
  type Row = NonNullable<typeof reservations>[number];
  const byAsset = useMemo(() => {
    const map = new Map<string, { code: string; name: string; items: Row[] }>();
    for (const r of reservations ?? []) {
      const a = (r as unknown as { assets: { code: string; name: string } | null }).assets;
      if (!a) continue;
      if (!map.has(r.asset_id)) map.set(r.asset_id, { code: a.code, name: a.name, items: [] });
      map.get(r.asset_id)!.items.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [reservations]);

  const totalDays = days.length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <PageContainer>
        {/* Header */}
        <div className="glass-card rounded-2xl p-6 md:p-8 mesh-bg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">RASPORED</span>
              <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-400 text-[10px] font-mono font-bold tracking-wider uppercase">
                14-DNEVNI PREGLED
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight gradient-heading">
              Kalendar Opterećenja
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Pregled rezervacija opreme po događajima
            </p>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="icon" className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 backdrop-blur-sm" onClick={() => setAnchor(addDays(anchor, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold backdrop-blur-sm px-4" onClick={() => setAnchor(startOfWeek(new Date()))}>
              Danas
            </Button>
            <Button variant="outline" size="icon" className="border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 backdrop-blur-sm" onClick={() => setAnchor(addDays(anchor, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobilni prikaz: grupisano po danima, kompaktne kartice */}
        <div className="md:hidden space-y-4">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">Učitavanje kalendara…</div>
          ) : !reservations?.length ? (
            <div className="glass-card rounded-2xl p-10 text-center">
              <CalendarRange className="h-10 w-10 mx-auto text-slate-400 mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nema rezervacija u izabranom periodu.</p>
            </div>
          ) : (
            days.map((d) => {
              const dayStart = d.getTime();
              const dayEnd = addDays(d, 1).getTime();
              const items = (reservations ?? []).filter((r) => {
                const from = new Date(r.reserved_from).getTime();
                const to = new Date(r.reserved_to).getTime();
                return from < dayEnd && to > dayStart;
              });
              if (!items.length) return null;
              const isToday = d.getTime() === today.getTime();
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={d.toISOString()} className="space-y-2">
                  <div
                    className={`sticky top-14 z-10 -mx-1 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold backdrop-blur-md shadow-sm border ${
                      isToday
                        ? "bg-cyan-50/90 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800"
                        : weekend
                        ? "bg-slate-100/90 dark:bg-[#1A1F2A]/90 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800"
                        : "bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    {fmtDay(d)}
                    <span className="ml-auto text-[10px] font-bold opacity-70 bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full">
                      {items.length} {items.length === 1 ? "stavka" : "stavke"}
                    </span>
                  </div>
                  <ul className="space-y-2 px-1">
                    {items.map((r) => {
                      const a = (r as unknown as { assets: { code: string; name: string } | null }).assets;
                      const ev = (r as unknown as { events: { name: string; status: string } | null }).events;
                      const color =
                        r.status === "picked"
                          ? "border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100"
                          : r.status === "returned"
                          ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100"
                          : r.status === "missing"
                          ? "border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100"
                          : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100";
                      return (
                        <Link
                          key={r.id}
                          to={`/events/${r.event_id}`}
                          className={`block rounded-xl border-l-4 ${color} border border-slate-200 dark:border-slate-800 p-3 shadow-sm active:scale-[0.99] transition`}
                        >
                          <div className="text-sm font-bold truncate mb-1">{ev?.name ?? "Događaj"}</div>
                          <div className="text-xs opacity-80 truncate flex items-center justify-between">
                            <span>{a?.name ?? "—"}</span>
                            <span className="font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">{a?.code}</span>
                          </div>
                          {r.quantity > 1 && <div className="text-[10px] font-bold mt-1 opacity-70 uppercase">Količina: {r.quantity}</div>}
                        </Link>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop prikaz: Gantt */}
        <div className="glass-card rounded-2xl overflow-hidden hidden md:block">
          <div className="p-0 overflow-x-auto">
            <div className="min-w-200">
              {/* Header row */}
              <div
                className="grid border-b border-slate-200 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold text-slate-600 dark:text-slate-400"
                style={{ gridTemplateColumns: `250px repeat(${totalDays}, 1fr)` }}
              >
                <div className="px-4 py-3 border-r border-slate-200 dark:border-slate-800/60">Oprema i Barkod</div>
                {days.map((d) => {
                  const isToday = d.getTime() === today.getTime();
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={d.toISOString()}
                      className={`px-2 py-3 text-center border-r border-slate-200 dark:border-slate-800/60 last:border-r-0 ${isToday ? "bg-cyan-50 dark:bg-cyan-950/20 text-cyan-600 dark:text-cyan-400 font-bold" : weekend ? "bg-slate-100/50 dark:bg-[#1A1F2A]/50" : ""}`}
                    >
                      {fmtDay(d)}
                    </div>
                  );
                })}
              </div>

              {isLoading ? (
                <div className="p-12 text-center text-sm text-slate-500">Učitavanje kalendara…</div>
              ) : !byAsset.length ? (
                <div className="p-16 text-center">
                  <CalendarRange className="h-10 w-10 mx-auto text-slate-400 mb-3" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nema rezervacija u izabranom periodu.</p>
                </div>
              ) : (
                byAsset.map(([assetId, group]) => (
                  <div
                    key={assetId}
                    className="grid border-b border-slate-200 dark:border-slate-800/60 last:border-b-0 items-stretch hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    style={{ gridTemplateColumns: `250px repeat(${totalDays}, 1fr)` }}
                  >
                    <Link
                      to={`/assets/${assetId}`}
                      className="px-4 py-3 border-r border-slate-200 dark:border-slate-800/60 min-w-0 group"
                    >
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">{group.name}</div>
                      <div className="text-xs font-mono text-slate-500 truncate mt-0.5">{group.code}</div>
                    </Link>
                    <div
                      className="relative col-span-full"
                      style={{ gridColumn: `2 / span ${totalDays}` }}
                    >
                      {/* day cell backgrounds */}
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${totalDays}, 1fr)` }}>
                        {days.map((d) => {
                          const weekend = d.getDay() === 0 || d.getDay() === 6;
                          const isToday = d.getTime() === today.getTime();
                          return (
                            <div
                              key={d.toISOString()}
                              className={`border-r border-slate-200 dark:border-slate-800/60 last:border-r-0 ${isToday ? "bg-cyan-50/50 dark:bg-cyan-950/10" : weekend ? "bg-slate-50/50 dark:bg-[#1A1F2A]/30" : ""}`}
                            />
                          );
                        })}
                      </div>
                      {/* bars */}
                      <div className="relative py-2 space-y-1.5 min-h-12 flex flex-col justify-center">
                        {group.items.map((r) => {
                          const from = new Date(r.reserved_from);
                          const to = new Date(r.reserved_to);
                          const startIdx = Math.max(0, Math.floor((from.getTime() - rangeStart.getTime()) / 86400000));
                          const endIdx = Math.min(totalDays, Math.ceil((to.getTime() - rangeStart.getTime()) / 86400000));
                          const span = Math.max(1, endIdx - startIdx);
                          const ev = (r as unknown as { events: { name: string; status: string } | null }).events;
                          const color =
                            r.status === "picked"
                              ? "bg-blue-500/90 text-white shadow-blue-500/20"
                              : r.status === "returned"
                              ? "bg-emerald-500/90 text-white shadow-emerald-500/20"
                              : r.status === "missing"
                              ? "bg-rose-500/90 text-white shadow-rose-500/20"
                              : "bg-slate-700/90 dark:bg-slate-600/90 text-white shadow-slate-900/20";
                          return (
                            <Link
                              key={r.id}
                              to={`/events/${r.event_id }`}
                              className={`block rounded-md px-2 py-1 text-[11px] font-semibold truncate ${color} shadow-sm hover:opacity-100 hover:shadow-md transition mx-1`}
                              style={{
                                marginLeft: `calc(${(startIdx / totalDays) * 100}% + 4px)`,
                                width: `calc(${(span / totalDays) * 100}% - 8px)`,
                                opacity: 0.95,
                              }}
                              title={`${ev?.name ?? "—"} · ${from.toLocaleDateString("sr-RS")} → ${to.toLocaleDateString("sr-RS")}`}
                            >
                              {ev?.name ?? "Događaj"} {r.quantity > 1 ? `(×${r.quantity})` : ""}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="pt-4 flex flex-wrap gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
          <Legend color="bg-slate-700 dark:bg-slate-600" label="Rezervisano" />
          <Legend color="bg-blue-500" label="Preuzeto (Na terenu)" />
          <Legend color="bg-emerald-500" label="Vraćeno" />
          <Legend color="bg-rose-500" label="Nedostaje / Problem" />
        </div>
    </PageContainer>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-3 h-3 rounded ${color}`} />
      {label}
    </span>
  );
}
