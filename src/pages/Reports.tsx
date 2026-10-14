import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { formatRSD } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { exportCsv } from "@/lib/csv";
import { toast } from "sonner";

import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieChartIcon, 
  Activity, 
  BarChart3,
  Layers,
  FileSpreadsheet
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  available: "#10b981", // emerald-500
  reserved: "#f59e0b", // amber-500
  at_event: "#3b82f6", // blue-500
  in_transit: "#06b6d4", // cyan-500
  returned: "#8b5cf6", // violet-500
  damaged: "#f43f5e", // rose-500
  in_service: "#d946ef", // fuchsia-500
  written_off: "#64748b", // slate-500
};

const STATUS_LABELS: Record<string, string> = {
  available: "Dostupno",
  reserved: "Rezervisano",
  at_event: "Na događaju",
  in_transit: "U transportu",
  returned: "Vraćeno",
  damaged: "Oštećeno",
  in_service: "Na servisu",
  written_off: "Otpisano",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover/95 border border-border p-3 rounded-xl shadow-xl backdrop-blur-md text-popover-foreground">
        <p className="font-semibold mb-2">{label || payload[0]?.name}</p>
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-bold text-foreground">{p.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Reports() {
  const [rangeDays, setRangeDays] = useState<number>(30);

  const { data: statusData } = useQuery({
    queryKey: ["report-status"],
    queryFn: async () => {
      const { data } = await supabase.from("assets").select("status");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((a) => {
        counts[a.status] = (counts[a.status] ?? 0) + 1;
      });
      return Object.entries(counts).map(([k, v]) => ({
        name: STATUS_LABELS[k] ?? k,
        value: v,
        key: k,
      }));
    },
  });

  const { data: valueData } = useQuery({
    queryKey: ["report-value"],
    queryFn: async () => {
      const { data } = await supabase
        .from("assets")
        .select("purchase_value, current_value, status");
      const total = (data ?? []).reduce(
        (acc, a) => {
          acc.purchase += Number(a.purchase_value ?? 0);
          acc.current += Number(a.current_value ?? a.purchase_value ?? 0);
          return acc;
        },
        { purchase: 0, current: 0 }
      );
      return total;
    },
  });

  const { data: checkoutData } = useQuery({
    queryKey: ["report-checkouts", rangeDays],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - rangeDays);
      const { data } = await supabase
        .from("checkouts")
        .select("checked_out_at, returned_at")
        .gte("checked_out_at", since.toISOString());

      if (rangeDays <= 30) {
        const days: Record<string, { date: string; out: number; in: number }> = {};
        for (let i = rangeDays - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          days[key] = { date: key.slice(5), out: 0, in: 0 };
        }
        (data ?? []).forEach((c) => {
          const ko = c.checked_out_at?.slice(0, 10);
          if (ko && days[ko]) days[ko].out += 1;
          const kr = c.returned_at?.slice(0, 10);
          if (kr && days[kr]) days[kr].in += 1;
        });
        return Object.values(days);
      } else if (rangeDays <= 90) {
        const buckets: Record<string, { date: string; out: number; in: number }> = {};
        for (let i = 11; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i * 7);
          const key = `Ned. ${12 - i}`;
          buckets[key] = { date: key, out: 0, in: 0 };
        }
        (data ?? []).forEach((c) => {
          if (c.checked_out_at) {
            const daysAgo = Math.floor((Date.now() - new Date(c.checked_out_at).getTime()) / (1000 * 60 * 60 * 24));
            const weekIdx = 11 - Math.min(11, Math.floor(daysAgo / 7));
            const key = `Ned. ${weekIdx + 1}`;
            if (buckets[key]) buckets[key].out += 1;
          }
          if (c.returned_at) {
            const daysAgo = Math.floor((Date.now() - new Date(c.returned_at).getTime()) / (1000 * 60 * 60 * 24));
            const weekIdx = 11 - Math.min(11, Math.floor(daysAgo / 7));
            const key = `Ned. ${weekIdx + 1}`;
            if (buckets[key]) buckets[key].in += 1;
          }
        });
        return Object.values(buckets);
      } else {
        const months: Record<string, { date: string; out: number; in: number }> = {};
        for (let i = 11; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const key = d.toLocaleDateString("sr-RS", { month: "short" });
          months[key] = { date: key, out: 0, in: 0 };
        }
        (data ?? []).forEach((c) => {
          if (c.checked_out_at) {
            const key = new Date(c.checked_out_at).toLocaleDateString("sr-RS", { month: "short" });
            if (months[key]) months[key].out += 1;
          }
          if (c.returned_at) {
            const key = new Date(c.returned_at).toLocaleDateString("sr-RS", { month: "short" });
            if (months[key]) months[key].in += 1;
          }
        });
        return Object.values(months);
      }
    },
  });

  const { data: categoryUtilization } = useQuery({
    queryKey: ["report-category-utilization"],
    queryFn: async () => {
      const { data: categories } = await supabase.from("categories").select("id, name");
      const { data: assets } = await supabase.from("assets").select("id, category_id, status");

      if (!categories || !assets) return [];

      return categories
        .map((cat) => {
          const catAssets = assets.filter((a) => a.category_id === cat.id);
          const total = catAssets.length;
          const active = catAssets.filter(
            (a) => a.status === "at_event" || a.status === "in_transit" || a.status === "reserved"
          ).length;
          const inService = catAssets.filter((a) => a.status === "in_service" || a.status === "damaged").length;
          const available = catAssets.filter((a) => a.status === "available").length;
          const rate = total > 0 ? Math.round((active / total) * 100) : 0;

          return {
            id: cat.id,
            name: cat.name,
            total,
            active,
            available,
            inService,
            rate,
          };
        })
        .filter((c) => c.total > 0)
        .sort((a, b) => b.rate - a.rate);
    },
  });

  const { data: topData } = useQuery({
    queryKey: ["report-top-assets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("checkouts")
        .select("asset_id, assets(name, code)")
        .limit(1000);
      const counts: Record<string, { name: string; count: number }> = {};
      (data ?? []).forEach((c: any) => {
        const id = c.asset_id;
        const name = c.assets?.name ?? c.assets?.code ?? id;
        if (!counts[id]) counts[id] = { name, count: 0 };
        counts[id].count += 1;
      });
      return Object.values(counts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
  });

  const onExportFinance = async () => {
    const { data, error } = await supabase
      .from("assets")
      .select("code,name,serial_number,status,purchase_date,purchase_value,current_value,depreciation_rate,depreciation_method");
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = data ?? [];
    if (!rows.length) {
      toast.error("Nema podataka");
      return;
    }
    exportCsv(`finansijski-izvestaj-${new Date().toISOString().slice(0, 10)}`, rows, [
      { header: "Šifra", value: (a) => a.code },
      { header: "Naziv", value: (a) => a.name },
      { header: "Serijski broj", value: (a) => a.serial_number ?? "" },
      { header: "Status", value: (a) => a.status },
      { header: "Datum nabavke", value: (a) => a.purchase_date ?? "" },
      { header: "Nabavna vrednost", value: (a) => a.purchase_value ?? "" },
      { header: "Trenutna vrednost", value: (a) => a.current_value ?? "" },
      { header: "Stopa amortizacije", value: (a) => a.depreciation_rate ?? "" },
      { header: "Metod amortizacije", value: (a) => a.depreciation_method ?? "" },
    ]);
    toast.success(`Izvezeno ${rows.length} stavki`);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Izveštaji i analitika"
        description="Pregled stanja, kretanja i finansija opreme"
        actions={
          <Button variant="outline" onClick={onExportFinance}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Finansijski CSV
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="relative overflow-hidden rounded-2xl glass-card p-5 border border-cyan-500/20 card-hover-effect">
          <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none">
            <DollarSign className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-wide font-medium">Nabavna vrednost</div>
          </div>
          <div className="text-3xl font-bold text-slate-100 tracking-tight">{formatRSD(valueData?.purchase ?? 0)}</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl glass-card p-5 border border-blue-500/20 card-hover-effect">
          <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none">
            <TrendingUp className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-wide font-medium">Trenutna vrednost</div>
          </div>
          <div className="text-3xl font-bold text-slate-100 tracking-tight">{formatRSD(valueData?.current ?? 0)}</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl glass-card p-5 border border-rose-500/20 card-hover-effect">
          <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none">
            <TrendingDown className="w-24 h-24" />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-wide font-medium">Amortizacija</div>
          </div>
          <div className="text-3xl font-bold text-slate-100 tracking-tight">
            {formatRSD((valueData?.purchase ?? 0) - (valueData?.current ?? 0))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card overflow-hidden">
          <CardHeader className="bg-muted/40 border-b border-border pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-emerald-500" /> Stanje opreme po statusu
            </CardTitle>
          </CardHeader>
          <CardContent className="h-85 pt-6 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={statusData ?? []} 
                  dataKey="value" 
                  nameKey="name" 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={80} 
                  outerRadius={110}
                  stroke="none"
                >
                  {(statusData ?? []).map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.key] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card overflow-hidden">
          <CardHeader className="bg-muted/40 border-b border-border pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
              <span>Zaduženja i razduženja</span>
            </CardTitle>
            <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-lg border">
              <Button
                variant={rangeDays === 7 ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setRangeDays(7)}
              >
                7d
              </Button>
              <Button
                variant={rangeDays === 30 ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setRangeDays(30)}
              >
                30d
              </Button>
              <Button
                variant={rangeDays === 90 ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setRangeDays(90)}
              >
                90d
              </Button>
              <Button
                variant={rangeDays === 365 ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setRangeDays(365)}
              >
                1 god.
              </Button>
            </div>
          </CardHeader>
          <CardContent className="h-85 pt-6 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={checkoutData ?? []} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-200 dark:stroke-slate-800" />
                <XAxis dataKey="date" fontSize={11} stroke="#64748b" tickLine={false} axisLine={false} />
                <YAxis fontSize={11} allowDecimals={false} stroke="#64748b" tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="out" name="Zaduženo" stroke="#06b6d4" strokeWidth={3} dot={{ r: 3, fill: '#06b6d4', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="in" name="Vraćeno" stroke="#10b981" strokeWidth={3} dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Iskorišćenost opreme po kategorijama */}
        <Card className="glass-card overflow-hidden lg:col-span-2">
          <CardHeader className="bg-muted/40 border-b border-border pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                Iskorišćenost opreme po kategorijama
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                Procenat angažovanih resursa (na terenu ili rezervisano) naspram ukupnog broja komada
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {!categoryUtilization?.length ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Nema podataka o kategorijama.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryUtilization.map((cat) => (
                  <div key={cat.id} className="p-3.5 rounded-xl border bg-card/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">{cat.name}</span>
                      <Badge
                        variant={cat.rate > 60 ? "default" : cat.rate > 25 ? "secondary" : "outline"}
                        className="text-xs font-mono font-bold"
                      >
                        {cat.rate}% angažovano
                      </Badge>
                    </div>
                    <Progress value={cat.rate} className="h-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pt-0.5">
                      <span>Ukupno: <strong className="text-foreground">{cat.total} kom.</strong></span>
                      <span className="text-blue-600 dark:text-blue-400">Na terenu: {cat.active}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">Dostupno: {cat.available}</span>
                      {cat.inService > 0 && (
                        <span className="text-rose-600 dark:text-rose-400">Servis: {cat.inService}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card overflow-hidden lg:col-span-2">
          <CardHeader className="bg-muted/40 border-b border-border pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Top 10 najkorišćenije opreme
            </CardTitle>
          </CardHeader>
          <CardContent className="h-95 pt-6 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topData ?? []} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#1e293b" />
                <XAxis type="number" fontSize={11} allowDecimals={false} stroke="#64748b" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" fontSize={11} width={180} stroke="#cbd5e1" tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                <Bar dataKey="count" name="Broj zaduženja" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
