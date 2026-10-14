import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bell, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/format";

export function NotificationsBell() {
  const { data } = useQuery({
    queryKey: ["notifications-summary"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [overdueRes, damagedRes, soonRes] = await Promise.all([
        supabase
          .from("checkouts")
          .select("id,asset_id,checked_out_to_name,expected_return_at,assets:asset_id(code,name)")
          .is("returned_at", null)
          .not("expected_return_at", "is", null)
          .lt("expected_return_at", nowIso)
          .order("expected_return_at", { ascending: true })
          .limit(8),
        supabase
          .from("assets")
          .select("id,code,name", { count: "exact" })
          .eq("status", "damaged")
          .limit(5),
        supabase
          .from("event_assets")
          .select("id,event_id,asset_id,reserved_from,events:event_id(name),assets:asset_id(code,name)")
          .eq("status", "reserved")
          .gte("reserved_from", nowIso)
          .lte("reserved_from", new Date(Date.now() + 48 * 3600 * 1000).toISOString())
          .order("reserved_from", { ascending: true })
          .limit(5),
      ]);
      return {
        overdue: overdueRes.data ?? [],
        damaged: damagedRes.data ?? [],
        damagedCount: damagedRes.count ?? 0,
        upcoming: soonRes.data ?? [],
      };
    },
    refetchInterval: 60_000,
  });

  const total = (data?.overdue.length ?? 0) + (data?.damagedCount ?? 0) + (data?.upcoming.length ?? 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Obaveštenja">
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 grid place-items-center text-[10px] font-semibold rounded-full bg-destructive text-destructive-foreground">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[80vh] overflow-y-auto">
        <DropdownMenuLabel>Obaveštenja</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {data?.overdue.length ? (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-destructive flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Prekoračeni reversi
            </div>
            {data.overdue.map((c) => {
              const a = (c as unknown as { assets: { code: string; name: string } | null }).assets;
              return (
                <DropdownMenuItem key={c.id} asChild>
                  <Link to={`/assets/${c.asset_id}`} className="flex flex-col items-start gap-0.5">
                    <span className="text-sm font-medium truncate w-full">{a?.name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {c.checked_out_to_name ?? "—"} · rok {formatDateTime(c.expected_return_at)}
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        ) : null}

        {data?.upcoming.length ? (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-info flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Predstoji u 48h
            </div>
            {data.upcoming.map((r) => {
              const a = (r as unknown as { assets: { code: string; name: string } | null }).assets;
              const ev = (r as unknown as { events: { name: string } | null }).events;
              return (
                <DropdownMenuItem key={r.id} asChild>
                  <Link to={`/events/${r.event_id}`} className="flex flex-col items-start gap-0.5">
                    <span className="text-sm font-medium truncate w-full">{ev?.name ?? "Događaj"}</span>
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {a?.name ?? "—"} · {formatDateTime(r.reserved_from)}
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        ) : null}

        {data?.damaged.length ? (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-warning-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Oštećena oprema ({data.damagedCount})
            </div>
            {data.damaged.map((a) => (
              <DropdownMenuItem key={a.id} asChild>
                <Link to={`/assets/${a.id}`} className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium truncate w-full">{a.name}</span>
                  <span className="text-xs font-mono text-muted-foreground truncate w-full">{a.code}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        {!total && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nema novih obaveštenja 🎉
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
