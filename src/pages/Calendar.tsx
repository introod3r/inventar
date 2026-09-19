import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Plus, 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Boxes, 
  Layers, 
  ListOrdered, 
  MapPin, 
  User, 
  ArrowRight
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { CalendarEventDialog, type CalendarEventDetails } from "@/components/calendar/CalendarEventDialog";
import { QuickEventModal } from "@/components/calendar/QuickEventModal";

// Helper Date Utilities
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

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

const WEEKDAYS = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];

export default function CalendarPage() {
  // View mode: "month" | "timeline" | "agenda" (defaults to "agenda" on mobile for superior touch ergonomics)
  const [view, setView] = useState<"month" | "timeline" | "agenda">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return "agenda";
    }
    return "month";
  });

  // Current Month/Date Navigator State
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // Gantt Timeline Anchor (for equipment load view)
  const [timelineAnchor, setTimelineAnchor] = useState(() => startOfWeek(new Date()));
  const [timelineDaysCount, setTimelineDaysCount] = useState<number>(14);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Selected Event for Quick Details Modal
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Quick Event Creation Modal
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);

  // Month Range Calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthStart = useMemo(() => new Date(year, month, 1), [year, month]);
  const monthEnd = useMemo(() => new Date(year, month + 1, 0, 23, 59, 59, 999), [year, month]);

  // Calendar Grid Days (including padding from previous and next month)
  const monthGridDays = useMemo(() => {
    const startDayIndex = (monthStart.getDay() + 6) % 7; // Monday = 0
    const totalDaysInMonth = monthEnd.getDate();

    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    // Previous month padding
    for (let i = startDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month, -i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month padding to complete 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month, monthStart, monthEnd]);

  // Timeline Days (7, 14, 30 days)
  const timelineDays = useMemo(
    () => Array.from({ length: timelineDaysCount }, (_, i) => addDays(timelineAnchor, i)),
    [timelineAnchor, timelineDaysCount]
  );
  const timelineRangeStart = timelineDays[0];
  const timelineRangeEnd = addDays(timelineDays[timelineDays.length - 1], 1);

  // Query: All Events
  const { data: allEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(`
          id, name, start_at, end_at, status, location_text, notes,
          clients:client_id(name, contact, phone),
          locations:location_id(name),
          event_assets(id, quantity, status, assets:asset_id(code, name))
        `)
        .order("start_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as CalendarEventDetails[]) ?? [];
    },
  });

  // Query: Reservations for Gantt Timeline View
  const { data: timelineReservations, isLoading: reservationsLoading } = useQuery({
    queryKey: ["calendar-reservations", timelineRangeStart.toISOString(), timelineRangeEnd.toISOString()],
    enabled: view === "timeline",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_assets")
        .select(`
          id, event_id, asset_id, reserved_from, reserved_to, quantity, status,
          assets:asset_id(code, name),
          events:event_id(name, status)
        `)
        .lt("reserved_from", timelineRangeEnd.toISOString())
        .gt("reserved_to", timelineRangeStart.toISOString())
        .order("reserved_from", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Query: Overdue Checkouts (Items checked out where expected_return_at < now and returned_at is null)
  const { data: overdueCheckouts } = useQuery({
    queryKey: ["overdue-checkouts"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("checkouts")
        .select("id", { count: "exact", head: true })
        .is("returned_at", null)
        .lt("expected_return_at", new Date().toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Selected event object for dialog
  const selectedEvent = useMemo(() => {
    if (!selectedEventId || !allEvents) return null;
    return allEvents.find((e) => e.id === selectedEventId) || null;
  }, [selectedEventId, allEvents]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    if (!allEvents) return [];
    return allEvents.filter((ev) => {
      if (statusFilter !== "all" && ev.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = ev.name.toLowerCase().includes(q);
        const matchClient = ev.clients?.name?.toLowerCase().includes(q);
        const matchLoc = (ev.locations?.name || ev.location_text || "").toLowerCase().includes(q);
        if (!matchName && !matchClient && !matchLoc) return false;
      }
      return true;
    });
  }, [allEvents, statusFilter, search]);

  // KPIs
  const kpis = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();

    let activeToday = 0;
    let thisMonth = 0;
    let totalAssetsInField = 0;

    (allEvents ?? []).forEach((ev) => {
      const s = new Date(ev.start_at).getTime();
      const e = new Date(ev.end_at).getTime();

      // Active Today
      if (s <= todayEnd && e >= todayStart && ev.status !== "cancelled") {
        activeToday++;
      }

      // This Month
      if (new Date(ev.start_at).getMonth() === month && new Date(ev.start_at).getFullYear() === year) {
        if (ev.status !== "cancelled") thisMonth++;
      }

      // Count assets currently in the field
      if (ev.status === "in_progress" || (s <= todayEnd && e >= todayStart && ev.status === "confirmed")) {
        const assetsCount = ev.event_assets?.reduce((sum, a) => sum + (a.quantity || 1), 0) || 0;
        totalAssetsInField += assetsCount;
      }
    });

    return {
      activeToday,
      thisMonth,
      totalAssetsInField,
      overdueCount: overdueCheckouts ?? 0,
    };
  }, [allEvents, overdueCheckouts, month, year]);

  // Grouped Timeline Reservations by Asset
  type Row = NonNullable<typeof timelineReservations>[number];
  const byAsset = useMemo(() => {
    const map = new Map<string, { code: string; name: string; items: Row[] }>();
    for (const r of timelineReservations ?? []) {
      const a = (r as unknown as { assets: { code: string; name: string } | null }).assets;
      if (!a) continue;
      if (!map.has(r.asset_id)) map.set(r.asset_id, { code: a.code, name: a.name, items: [] });
      map.get(r.asset_id)!.items.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [timelineReservations]);

  // Agenda Groups
  const agendaEvents = useMemo(() => {
    if (!filteredEvents.length) return [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return filteredEvents
      .filter((ev) => new Date(ev.end_at).getTime() >= now.getTime() - 86400000) // from yesterday onwards
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [filteredEvents]);

  // Handlers for month navigation
  const handlePrev = () => {
    if (view === "timeline") {
      setTimelineAnchor((prev) => addDays(prev, -timelineDaysCount));
    } else {
      setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    }
  };

  const handleNext = () => {
    if (view === "timeline") {
      setTimelineAnchor((prev) => addDays(prev, timelineDaysCount));
    } else {
      setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setTimelineAnchor(startOfWeek(new Date()));
  };

  const monthTitle = currentDate.toLocaleDateString("sr-RS", { month: "long", year: "numeric" });
  const capitalizedMonthTitle = monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1);

  const todayDate = new Date();

  return (
    <PageContainer>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              Raspored i Planiranje
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Kalendar Događaja i Opreme
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Mesečni planer termina, angažovanja tehnike i rokova povrata
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            onClick={() => {
              setQuickAddDate(new Date());
              setQuickAddOpen(true);
            }}
            className="gap-2 shadow-md shadow-primary/20 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Novi događaj
          </Button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {/* Danas na terenu */}
        <Card className="glass-card">
          <CardContent className="p-4 md:p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Danas na terenu</p>
              <div className="flex items-center gap-2 mt-0.5">
                <h3 className="text-xl md:text-2xl font-bold text-foreground">{kpis.activeToday}</h3>
                {kpis.activeToday > 0 && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Događaji u ovom mesecu */}
        <Card className="glass-card">
          <CardContent className="p-4 md:p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Događaji u ovom mesecu</p>
              <h3 className="text-xl md:text-2xl font-bold text-foreground mt-0.5">{kpis.thisMonth}</h3>
            </div>
          </CardContent>
        </Card>

        {/* Angažovano opreme */}
        <Card className="glass-card">
          <CardContent className="p-4 md:p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 shrink-0">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Angažovano opreme</p>
              <h3 className="text-xl md:text-2xl font-bold text-foreground mt-0.5">{kpis.totalAssetsInField} kom</h3>
            </div>
          </CardContent>
        </Card>

        {/* Upozorenja na kašnjenja */}
        <Card className="glass-card">
          <CardContent className="p-4 md:p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              kpis.overdueCount > 0 
                ? "bg-rose-500/10 border border-rose-500/20 text-rose-500" 
                : "bg-muted border border-border text-muted-foreground"
            }`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Istekao rok povrata</p>
              <div className="flex items-center gap-2 mt-0.5">
                <h3 className={`text-xl md:text-2xl font-bold ${kpis.overdueCount > 0 ? "text-rose-500" : "text-foreground"}`}>
                  {kpis.overdueCount}
                </h3>
                {kpis.overdueCount > 0 && (
                  <Badge variant="outline" className="bg-rose-500/15 text-rose-500 border-rose-500/30 text-[10px]">
                    Kašnjenje
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Switcher, Period Navigator & Search Toolbar */}
      <Card className="glass-card mb-6">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* View Switcher Tabs */}
            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="w-full lg:w-auto">
              <TabsList className="grid grid-cols-3 w-full lg:w-auto">
                <TabsTrigger value="month" className="gap-1.5 text-xs font-semibold">
                  <CalendarIcon className="h-4 w-4" />
                  Mesečni prikaz
                </TabsTrigger>
                <TabsTrigger value="timeline" className="gap-1.5 text-xs font-semibold">
                  <Layers className="h-4 w-4" />
                  Gantt oprema
                </TabsTrigger>
                <TabsTrigger value="agenda" className="gap-1.5 text-xs font-semibold">
                  <ListOrdered className="h-4 w-4" />
                  Agenda
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Date Navigator Controls */}
            <div className="flex items-center justify-between sm:justify-center gap-3">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 bg-background/50"
                  onClick={handlePrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 bg-background/50 text-xs font-medium"
                  onClick={handleToday}
                >
                  Danas
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 bg-background/50"
                  onClick={handleNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="font-bold text-sm md:text-base text-foreground min-w-44 text-center">
                {view === "timeline" ? (
                  <span>
                    {timelineRangeStart.toLocaleDateString("sr-RS", { day: "numeric", month: "short" })} —{" "}
                    {timelineDays[timelineDays.length - 1].toLocaleDateString("sr-RS", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                ) : (
                  <span>{capitalizedMonthTitle}</span>
                )}
              </div>
            </div>

            {/* Filters (Search, Status, Gantt range) */}
            <div className="flex flex-wrap items-center gap-2.5">
              {view === "timeline" ? (
                <Select
                  value={String(timelineDaysCount)}
                  onValueChange={(v) => setTimelineDaysCount(Number(v))}
                >
                  <SelectTrigger className="w-32 h-9 text-xs bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 dana</SelectItem>
                    <SelectItem value="14">14 dana</SelectItem>
                    <SelectItem value="30">30 dana</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36 h-9 text-xs bg-background/50">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Svi statusi</SelectItem>
                    <SelectItem value="confirmed">Potvrđeno</SelectItem>
                    <SelectItem value="in_progress">U toku</SelectItem>
                    <SelectItem value="completed">Završeno</SelectItem>
                    <SelectItem value="draft">Nacrt</SelectItem>
                  </SelectContent>
                </Select>
              )}

              <div className="relative flex-1 sm:w-52">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Pretraži..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-xs bg-background/50"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 1. MONTH GRID VIEW                                                        */}
      {/* ========================================================================= */}
      {view === "month" && (
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-0">
            {/* Weekdays Header */}
            <div className="grid grid-cols-7 border-b border-border/80 bg-muted/40 text-center text-xs font-bold text-muted-foreground py-2.5 uppercase tracking-wider">
              {WEEKDAYS.map((day, idx) => (
                <div key={day} className={idx >= 5 ? "text-primary/80 font-bold" : ""}>
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-border/60">
              {monthGridDays.map(({ date, isCurrentMonth }, index) => {
                const isToday = isSameDay(date, todayDate);
                const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
                const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();

                // Events spanning or on this day
                const dayEvents = (filteredEvents || []).filter((ev) => {
                  const evStart = new Date(ev.start_at).getTime();
                  const evEnd = new Date(ev.end_at).getTime();
                  return evStart <= dayEnd && evEnd >= dayStart;
                });

                return (
                  <div
                    key={index}
                    onClick={() => {
                      setQuickAddDate(date);
                      setQuickAddOpen(true);
                    }}
                    className={`min-h-27.5 md:min-h-33.75 p-2 flex flex-col justify-between group transition-colors relative cursor-pointer ${
                      !isCurrentMonth
                        ? "bg-muted/15 opacity-40 hover:opacity-80"
                        : isToday
                        ? "bg-primary/3 hover:bg-primary/6"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    {/* Day Top Bar */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`text-xs font-semibold inline-flex items-center justify-center h-6 w-6 rounded-full transition-transform group-hover:scale-110 ${
                          isToday
                            ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/30"
                            : "text-foreground"
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      {/* Quick Add icon on hover */}
                      <span className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity p-1">
                        <Plus className="h-3.5 w-3.5" />
                      </span>
                    </div>

                    {/* Events List for Day */}
                    <div className="space-y-1 flex-1 overflow-hidden">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const isConfirmed = ev.status === "confirmed";
                        const isInProgress = ev.status === "in_progress";
                        const isCompleted = ev.status === "completed";
                        const isDraft = ev.status === "draft";

                        const colorClasses = isConfirmed
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                          : isInProgress
                          ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/25"
                          : isCompleted
                          ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/25"
                          : isDraft
                          ? "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30 hover:bg-slate-500/25"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/25";

                        return (
                          <div
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEventId(ev.id);
                            }}
                            className={`px-1.5 py-1 rounded border text-[11px] font-semibold truncate transition-all shadow-xs flex items-center justify-between gap-1 ${colorClasses}`}
                            title={`${ev.name} · ${formatDateTime(ev.start_at)}`}
                          >
                            <span className="truncate">{ev.name}</span>
                            {ev.event_assets && ev.event_assets.length > 0 && (
                              <span className="text-[9px] font-mono opacity-80 shrink-0">
                                {ev.event_assets.reduce((sum, a) => sum + (a.quantity || 1), 0)}
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {dayEvents.length > 3 && (
                        <div className="text-[10px] font-bold text-muted-foreground px-1 pt-0.5">
                          +{dayEvents.length - 3} još
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* 2. GANTT EQUIPMENT TIMELINE VIEW                                          */}
      {/* ========================================================================= */}
      {view === "timeline" && (
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-200">
              {/* Timeline Header */}
              <div
                className="grid border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground"
                style={{ gridTemplateColumns: `260px repeat(${timelineDays.length}, 1fr)` }}
              >
                <div className="px-4 py-3 border-r border-border font-bold">Oprema i Šifra</div>
                {timelineDays.map((d) => {
                  const isToday = isSameDay(d, todayDate);
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={d.toISOString()}
                      className={`px-1.5 py-3 text-center border-r border-border last:border-r-0 text-[11px] ${
                        isToday
                          ? "bg-primary/15 text-primary font-bold"
                          : isWeekend
                          ? "bg-muted/50 text-muted-foreground"
                          : ""
                      }`}
                    >
                      <div className="font-semibold">{d.toLocaleDateString("sr-RS", { weekday: "narrow" })}</div>
                      <div className="font-mono text-xs mt-0.5">{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>

              {/* Rows Grouped by Asset */}
              {reservationsLoading ? (
                <div className="p-12 text-center text-sm text-muted-foreground">Učitavanje rasporeda opreme...</div>
              ) : !byAsset.length ? (
                <div className="p-16 text-center space-y-2">
                  <CalendarIcon className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium text-foreground">Nema rezervacija opreme u izabranom periodu.</p>
                  <p className="text-xs text-muted-foreground">Pomerite kalendar ili izaberite veći opseg dana.</p>
                </div>
              ) : (
                byAsset.map(([assetId, group]) => (
                  <div
                    key={assetId}
                    className="grid border-b border-border/70 last:border-b-0 items-stretch hover:bg-muted/20 transition-colors"
                    style={{ gridTemplateColumns: `260px repeat(${timelineDays.length}, 1fr)` }}
                  >
                    {/* Asset Name & Code */}
                    <Link
                      to={`/assets/${assetId}`}
                      className="px-4 py-3 border-r border-border min-w-0 group block hover:bg-muted/40 transition-colors"
                    >
                      <div className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                        {group.name}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                        {group.code}
                      </div>
                    </Link>

                    {/* Timeline Days Cell Area */}
                    <div
                      className="relative col-span-full"
                      style={{ gridColumn: `2 / span ${timelineDays.length}` }}
                    >
                      {/* Grid background columns */}
                      <div
                        className="absolute inset-0 grid"
                        style={{ gridTemplateColumns: `repeat(${timelineDays.length}, 1fr)` }}
                      >
                        {timelineDays.map((d) => {
                          const isToday = isSameDay(d, todayDate);
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return (
                            <div
                              key={d.toISOString()}
                              className={`border-r border-border/50 last:border-r-0 ${
                                isToday ? "bg-primary/4" : isWeekend ? "bg-muted/20" : ""
                              }`}
                            />
                          );
                        })}
                      </div>

                      {/* Reservation Bars */}
                      <div className="relative py-2.5 space-y-1.5 min-h-12 flex flex-col justify-center">
                        {group.items.map((r) => {
                          const from = new Date(r.reserved_from);
                          const to = new Date(r.reserved_to);
                          const startIdx = Math.max(
                            0,
                            Math.floor((from.getTime() - timelineRangeStart.getTime()) / 86400000)
                          );
                          const endIdx = Math.min(
                            timelineDays.length,
                            Math.ceil((to.getTime() - timelineRangeStart.getTime()) / 86400000)
                          );
                          const span = Math.max(1, endIdx - startIdx);
                          const ev = (r as unknown as { events: { name: string; status: string } | null }).events;

                          const colorClass =
                            r.status === "picked"
                              ? "bg-blue-600 text-white shadow-blue-600/20"
                              : r.status === "returned"
                              ? "bg-emerald-600 text-white shadow-emerald-600/20"
                              : r.status === "missing"
                              ? "bg-rose-600 text-white shadow-rose-600/20"
                              : "bg-slate-700 text-white shadow-slate-700/20";

                          return (
                            <div
                              key={r.id}
                              onClick={() => setSelectedEventId(r.event_id)}
                              className={`block rounded-md px-2 py-1 text-[11px] font-semibold truncate ${colorClass} shadow-sm hover:opacity-100 hover:scale-[1.01] transition-all mx-1 cursor-pointer`}
                              style={{
                                marginLeft: `calc(${(startIdx / timelineDays.length) * 100}% + 2px)`,
                                width: `calc(${(span / timelineDays.length) * 100}% - 4px)`,
                              }}
                              title={`${ev?.name ?? "Događaj"} (${from.toLocaleDateString("sr-RS")} → ${to.toLocaleDateString("sr-RS")})`}
                            >
                              {ev?.name ?? "Događaj"} {r.quantity > 1 ? `(×${r.quantity})` : ""}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* 3. AGENDA LIST VIEW                                                       */}
      {/* ========================================================================= */}
      {view === "agenda" && (
        <div className="space-y-4">
          {eventsLoading ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center text-muted-foreground">Učitavanje agende...</CardContent>
            </Card>
          ) : !agendaEvents.length ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center space-y-3">
                <CalendarIcon className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="text-sm font-semibold text-foreground">Nema predstojećih događaja</p>
                <p className="text-xs text-muted-foreground">Kliknite na „Novi događaj” da dodate termin u kalendar.</p>
              </CardContent>
            </Card>
          ) : (
            agendaEvents.map((ev) => {
              const start = new Date(ev.start_at);
              const end = new Date(ev.end_at);
              const isToday = isSameDay(start, todayDate);
              const assetsCount = ev.event_assets?.reduce((sum, a) => sum + (a.quantity || 1), 0) || 0;

              return (
                <Card
                  key={ev.id}
                  onClick={() => setSelectedEventId(ev.id)}
                  className={`glass-card hover:border-primary/50 transition-all duration-200 cursor-pointer overflow-hidden ${
                    isToday ? "border-primary/40 bg-primary/2" : ""
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left: Date & Time Badge */}
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-muted/60 border border-border flex flex-col items-center justify-center shrink-0">
                          <span className="text-[10px] uppercase font-bold text-primary">
                            {start.toLocaleDateString("sr-RS", { month: "short" })}
                          </span>
                          <span className="text-xl font-black text-foreground">{start.getDate()}</span>
                          <span className="text-[9px] text-muted-foreground font-medium">
                            {start.toLocaleDateString("sr-RS", { weekday: "short" })}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                ev.status === "confirmed"
                                  ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] font-semibold"
                                  : ev.status === "in_progress"
                                  ? "bg-blue-500/15 text-blue-500 border-blue-500/30 text-[10px] font-semibold"
                                  : ev.status === "completed"
                                  ? "bg-purple-500/15 text-purple-500 border-purple-500/30 text-[10px] font-semibold"
                                  : "bg-slate-500/15 text-slate-400 border-slate-500/30 text-[10px]"
                              }
                            >
                              {ev.status === "confirmed" ? "POTVRĐENO" : ev.status === "in_progress" ? "U TOKU" : ev.status === "completed" ? "ZAVRŠENO" : "NACRT"}
                            </Badge>

                            {isToday && (
                              <Badge className="bg-primary text-primary-foreground text-[10px] font-bold">
                                DANAS
                              </Badge>
                            )}
                          </div>

                          <h3 className="text-base md:text-lg font-bold text-foreground hover:text-primary transition-colors">
                            {ev.name}
                          </h3>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-primary" />
                              {start.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" })} —{" "}
                              {end.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit" })}
                            </span>

                            {ev.clients?.name && (
                              <span className="flex items-center gap-1">
                                <User className="h-3.5 w-3.5" />
                                {ev.clients.name}
                              </span>
                            )}

                            {(ev.locations?.name || ev.location_text) && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" />
                                {ev.locations?.name || ev.location_text}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Assets count & Action */}
                      <div className="flex items-center gap-3 justify-end shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/50">
                        <Badge variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs font-mono">
                          <Boxes className="h-3.5 w-3.5 text-primary" />
                          {assetsCount} komada tehnike
                        </Badge>

                        <Button size="sm" variant="ghost" className="gap-1 text-xs">
                          Detalji
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Legend for Timeline View */}
      {view === "timeline" && (
        <div className="pt-4 flex flex-wrap gap-4 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-slate-700" /> Rezervisano
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-blue-600" /> Na terenu / Preuzeto
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-emerald-600" /> Vraćeno u magacin
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-rose-600" /> Nedostaje / Oštećeno
          </span>
        </div>
      )}

      {/* MODAL: Event Quick Details View */}
      <CalendarEventDialog
        event={selectedEvent}
        open={!!selectedEventId}
        onOpenChange={(open) => !open && setSelectedEventId(null)}
      />

      {/* MODAL: Quick Add Event */}
      <QuickEventModal
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        initialDate={quickAddDate}
        onEventCreated={(newId) => setSelectedEventId(newId)}
      />
    </PageContainer>
  );
}
