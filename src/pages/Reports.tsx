import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FileSpreadsheet } from "lucide-react";
import { exportCsv } from "@/lib/csv";
import { toast } from "sonner";



import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieChartIcon, 
  Activity, 
  BarChart3 
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
    queryKey: ["report-checkouts-30d"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from("checkouts")
        .select("checked_out_at, returned_at")
        .gte("checked_out_at", since.toISOString());
      const days: Record<string, { date: string; out: number; in: number }> = {};
      for (let i = 29; i >= 0; i--) {
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
          <CardHeader className="bg-muted/40 border-b border-border pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /> Zaduženja i razduženja (30 dana)
            </CardTitle>
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
