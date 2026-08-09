import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Package,
  ScanLine,
  CalendarRange,
  Receipt,
  ClipboardList,
  Wrench,
  MapPin,
  Users,
  BarChart3,
  Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type SearchResult =
  | { kind: "asset"; id: string; code: string; name: string; serial: string | null }
  | { kind: "event"; id: string; name: string; starts_at: string | null }
  | { kind: "client"; id: string; name: string };

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "Skener", icon: ScanLine },
  { to: "/assets", label: "Oprema", icon: Package },
  { to: "/events", label: "Događaji", icon: CalendarRange },
  { to: "/calendar", label: "Kalendar", icon: CalendarRange },
  { to: "/checkouts", label: "Reversi", icon: Receipt },
  { to: "/inventories", label: "Popisi", icon: ClipboardList },
  { to: "/service", label: "Servis", icon: Wrench },
  { to: "/locations", label: "Lokacije", icon: MapPin },
  { to: "/clients", label: "Klijenti", icon: Users },
  { to: "/reports", label: "Izveštaji", icon: BarChart3 },
  { to: "/settings/users", label: "Korisnici (admin)", icon: Settings },
  { to: "/settings/api-keys", label: "API ključevi (admin)", icon: Settings },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const like = `%${q}%`;
      const [a, e, c] = await Promise.all([
        supabase
          .from("assets")
          .select("id, code, name, serial_number")
          .or(`code.ilike.${like},name.ilike.${like},serial_number.ilike.${like}`)
          .limit(8),
        supabase
          .from("events")
          .select("id, name, starts_at")
          .ilike("name", like)
          .limit(6),
        supabase.from("clients").select("id, name").ilike("name", like).limit(6),
      ]);
      if (cancelled) return;
      const out: SearchResult[] = [];
      (a.data ?? []).forEach((x: any) =>
        out.push({ kind: "asset", id: x.id, code: x.code, name: x.name, serial: x.serial_number }),
      );
      (e.data ?? []).forEach((x: any) =>
        out.push({ kind: "event", id: x.id, name: x.name, starts_at: x.starts_at }),
      );
      (c.data ?? []).forEach((x: any) => out.push({ kind: "client", id: x.id, name: x.name }));
      setResults(out);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const go = (fn: () => void) => {
    setOpen(false);
    setQuery("");
    fn();
  };

  const assets = results.filter((r) => r.kind === "asset") as Extract<SearchResult, { kind: "asset" }>[];
  const events = results.filter((r) => r.kind === "event") as Extract<SearchResult, { kind: "event" }>[];
  const clients = results.filter((r) => r.kind === "client") as Extract<SearchResult, { kind: "client" }>[];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Pretraga: oprema, događaji, klijenti… (⌘K)"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nema rezultata.</CommandEmpty>

        {assets.length > 0 && (
          <CommandGroup heading="Oprema">
            {assets.map((r) => (
              <CommandItem
                key={`a-${r.id}`}
                value={`asset ${r.code} ${r.name} ${r.serial ?? ""}`}
                onSelect={() =>
                  go(() => navigate(`/assets/${r.id}`))
                }
              >
                <Package />
                <span className="font-medium">{r.code}</span>
                <span className="text-muted-foreground">— {r.name}</span>
                {r.serial && <span className="ml-auto text-xs text-muted-foreground">SN: {r.serial}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {events.length > 0 && (
          <CommandGroup heading="Događaji">
            {events.map((r) => (
              <CommandItem
                key={`e-${r.id}`}
                value={`event ${r.name}`}
                onSelect={() =>
                  go(() => navigate(`/events/${r.id}`))
                }
              >
                <CalendarRange />
                <span>{r.name}</span>
                {r.starts_at && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(r.starts_at).toLocaleDateString("sr-RS")}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {clients.length > 0 && (
          <CommandGroup heading="Klijenti">
            {clients.map((r) => (
              <CommandItem
                key={`c-${r.id}`}
                value={`client ${r.name}`}
                onSelect={() => go(() => navigate("/clients"))}
              >
                <Users />
                <span>{r.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Navigacija">
          {NAV_ITEMS.map((n) => {
            const Icon = n.icon;
            return (
              <CommandItem
                key={n.to}
                value={`nav ${n.label}`}
                onSelect={() => go(() => navigate(n.to))}
              >
                <Icon />
                <span>{n.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
