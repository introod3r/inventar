import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, CalendarRange, Clock, User, MapPin } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";
import { useAuth } from "@/features/auth/use-auth";
import { toast } from "sonner";
import { useMemo } from "react";

const STATUS_LABEL: Record<string, string> = {
  draft: "Skica", confirmed: "Potvrđen", in_progress: "U toku", completed: "Završen", cancelled: "Otkazan",
};

export default function EventsList() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("manage_events");

  const { data, isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: async () => (await supabase
      .from("events")
      .select("*, clients:client_id(name)")
      .order("start_at", { ascending: false })
      .limit(100)).data ?? [],
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Događaj obrisan");
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const { active, upcoming, completed } = useMemo(() => {
    if (!data) return { active: [], upcoming: [], completed: [] };
    const now = new Date().getTime();
    
    const active = [];
    const upcoming = [];
    const completed = [];
    
    for (const e of data) {
      if (e.status === 'completed' || e.status === 'cancelled') {
        completed.push(e);
        continue;
      }
      if (e.status === 'in_progress') {
        active.push(e);
        continue;
      }
      
      const start = new Date(e.start_at).getTime();
      const end = new Date(e.end_at).getTime();
      
      if (now >= start && now <= end) {
        active.push(e);
      } else if (now > end) {
        completed.push(e);
      } else {
        upcoming.push(e);
      }
    }
    
    return { active, upcoming, completed };
  }, [data]);

  const EventCard = ({ e, type }: { e: any, type: 'active' | 'upcoming' | 'completed' }) => {
    const client = e.clients;
    
    const baseStyle = type === 'active' 
      ? "glass-card border-blue-400/50 dark:border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)] ring-1 ring-blue-500/20" 
      : type === 'completed' 
      ? "bg-slate-100/50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800/40 opacity-75 hover:opacity-100 transition-opacity" 
      : "glass-card";
      
    const statusColor = 
      e.status === "in_progress" || type === 'active' ? "bg-blue-500 text-white" :
      e.status === "completed" ? "bg-emerald-500 text-white" :
      e.status === "cancelled" ? "bg-rose-500 text-white" :
      "bg-slate-500 text-white";

    return (
      <div className={`rounded-xl border overflow-hidden relative group transition-all duration-300 hover:shadow-lg ${baseStyle}`}>
        {type === 'active' && <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-cyan-400 to-blue-600" />}
        {type === 'completed' && <div className="absolute top-0 left-0 w-full h-1 bg-slate-300 dark:bg-slate-700" />}
        {type === 'upcoming' && <div className="absolute top-0 left-0 w-full h-1 bg-amber-400 dark:bg-amber-600" />}
        
        <div className="flex items-start justify-between p-4 border-b border-slate-200 dark:border-slate-800/60 bg-white/40 dark:bg-slate-900/40">
          <div className="min-w-0 pr-2">
            <Link to={`/events/${e.id}`} className="font-bold text-lg text-slate-800 dark:text-slate-100 wrap-break-word hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
              {e.name}
            </Link>
          </div>
          <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2">
            {canManage && (
              <ConfirmDelete
                title={`Obrisati događaj „${e.name}"?`}
                description="Sve povezane rezervacije opreme biće takođe uklonjene."
                onConfirm={() => remove.mutate(e.id)}
              />
            )}
          </div>
        </div>
        
        <div className="p-4 space-y-3 flex-1 text-sm bg-white/20 dark:bg-slate-950/20">
          <div className="mb-2">
            <Badge className={`${statusColor} font-semibold uppercase tracking-wider text-[10px]`}>
              {STATUS_LABEL[e.status] ?? (type === 'active' ? 'U toku' : e.status)}
            </Badge>
          </div>

          {client?.name && (
            <div className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
              <User className="h-4 w-4 shrink-0 mt-0.5 opacity-70" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest block opacity-70">Klijent</span>
                <span className="text-slate-900 dark:text-slate-200 font-medium">{client.name}</span>
              </div>
            </div>
          )}

          {e.location_text && (
            <div className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5 opacity-70" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest block opacity-70">Lokacija</span>
                <span className="text-slate-900 dark:text-slate-200 font-medium">{e.location_text}</span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
            <Clock className="h-4 w-4 shrink-0 mt-0.5 opacity-70" />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest block opacity-70">Vreme</span>
              <span className="text-slate-900 dark:text-slate-200 block font-medium">{formatDateTime(e.start_at)}</span>
              <span className="text-slate-500 dark:text-slate-400 block">{formatDateTime(e.end_at)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <PageContainer>
        
        {/* Header */}
        <div className="glass-card rounded-2xl p-6 md:p-8 mesh-bg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">MENADŽMENT</span>
              <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-400 text-[10px] font-mono font-bold tracking-wider uppercase">
                DOGAĐAJI
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight gradient-heading">
              Evidencija Događaja
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Spisak događaja. Kreirajte događaj kako biste planirali i unapred rezervisali opremu.
            </p>
          </div>
          
          <div className="shrink-0">
            {canManage && (
              <Button asChild className="bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-purple-500/25">
                <Link to="/events/new"><Plus className="mr-2 h-5 w-5" /> Novi događaj</Link>
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500 font-medium">Učitavanje događaja…</div>
        ) : !data?.length ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <CalendarRange className="h-12 w-12 mx-auto text-slate-400 mb-4" />
            <h3 className="font-bold text-lg text-slate-700 dark:text-slate-300">Još uvek nemate kreirane događaje</h3>
            <p className="text-slate-500 mt-2 max-w-lg mx-auto">
              Napravite prvi događaj kako biste isplanirali šta vam je sve potrebno. 
              Oprema koju dodate na događaj će automatski dobiti status "Rezervisano", što garantuje njenu dostupnost za taj datum.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {active.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Trenutno u toku</h2>
                  <Badge variant="outline" className="ml-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">{active.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {active.map(e => <EventCard key={e.id} e={e} type="active" />)}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Predstojeći događaji</h2>
                  <Badge variant="outline" className="ml-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700">{upcoming.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcoming.map(e => <EventCard key={e.id} e={e} type="upcoming" />)}
                </div>
              </section>
            )}

            {completed.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-2 w-2 rounded-full bg-slate-400" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Završeni događaji</h2>
                  <Badge variant="outline" className="ml-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700">{completed.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completed.map(e => <EventCard key={e.id} e={e} type="completed" />)}
                </div>
              </section>
            )}
          </div>
        )}
    </PageContainer>
  );
}
