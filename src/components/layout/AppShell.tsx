import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Package,
  Camera,
  CalendarRange,
  ClipboardList,
  Wrench,
  MapPin,
  Settings,
  LogOut,
  Menu,
  MoreHorizontal,
  PackageSearch,
  Users,
  Receipt,
  BarChart3,
  History,
  DatabaseBackup,
  ShieldAlert,
  Tags,
  Activity,
  Building2,
} from "lucide-react";

import { useAuth } from "@/features/auth/use-auth";
import { useCompanySettings } from "@/features/company/use-company-settings";
import { ROLE_LABELS } from "@/features/rbac/permissions";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { OfflineIndicator } from "@/components/common/OfflineIndicator";
import { SyncIndicator } from "@/components/common/SyncIndicator";
import { NotificationsBell } from "@/components/common/NotificationsBell";
import { CommandPalette } from "@/components/common/CommandPalette";
import { Search } from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  bottomNav?: boolean;
  isPrimary?: boolean;
  color?: string;
  bg?: string;
};

// Raspored u potpunosti prilagođen korisničkom dizajnu
const NAV_DAILY: NavItem[] = [
  { to: "/dashboard", label: "Pregled", icon: LayoutDashboard, color: "text-sky-500 dark:text-sky-400", bg: "bg-sky-500/15" },
  { to: "/events", label: "Planiranje Događaja", icon: CalendarRange, color: "text-rose-500 dark:text-rose-400", bg: "bg-rose-500/15" },
  { to: "/checkouts", label: "Izdavanje i Reversi", icon: Receipt, color: "text-purple-500 dark:text-purple-400", bg: "bg-purple-500/15" },
  { to: "/scan", label: "Skeniranje Opreme", icon: Camera, color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/15" },
  { to: "/service", label: "Servis i Popravke", icon: Wrench, color: "text-orange-500 dark:text-orange-400", bg: "bg-orange-500/15" },
];

const NAV_CATALOGS: NavItem[] = [
  { to: "/assets", label: "Katalog Opreme", icon: Package, color: "text-indigo-500 dark:text-indigo-400", bg: "bg-indigo-500/15" },
  { to: "/clients", label: "Baza Klijenata", icon: Users, color: "text-sky-500 dark:text-sky-400", bg: "bg-sky-500/15" },
  { to: "/locations", label: "Lokacije", icon: MapPin, color: "text-cyan-500 dark:text-cyan-400", bg: "bg-cyan-500/15" },
  { to: "/calendar", label: "Kalendar", icon: CalendarRange, color: "text-pink-500 dark:text-pink-400", bg: "bg-pink-500/15" },
  { to: "/inventories", label: "Popisi", icon: ClipboardList, color: "text-teal-500 dark:text-teal-400", bg: "bg-teal-500/15" },
  { to: "/reports", label: "Izveštaji", icon: BarChart3, color: "text-violet-500 dark:text-violet-400", bg: "bg-violet-500/15" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, user, signOut, hasPermission, roles } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const location = useLocation();

  const showAdmin = hasPermission("admin");

  const onLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-background overflow-x-hidden w-full">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r bg-sidebar text-sidebar-foreground">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-sidebar-border">
          {companySettings.logo_url ? (
            <img
              src={companySettings.logo_url}
              alt={companySettings.short_name}
              className="h-8 w-auto max-w-[36px] object-contain rounded-md"
            />
          ) : (
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
              <PackageSearch className="w-5 h-5" />
            </span>
          )}
          <span className="font-semibold tracking-tight truncate" title={companySettings.name}>
            {companySettings.short_name || "EventAsset"}
          </span>
          <div className="ml-auto flex items-center gap-1"><ThemeToggle /><NotificationsBell /></div>
        </div>
        <div className="px-3 pt-3">
          <button
            onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
            className="w-full flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent transition"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Pretraga…</span>
            <kbd className="ml-auto text-[10px] font-mono opacity-70">⌘K</kbd>
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 py-2 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Dnevne Operacije
          </div>
          {NAV_DAILY.map((item) => (
            <SideLink key={item.to} item={item} onClick={() => setMobileOpen(false)} />
          ))}

          <div className="px-3 py-2 mt-4 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Katalozi i Pregled
          </div>
          {NAV_CATALOGS.map((item) => (
            <SideLink key={item.to} item={item} onClick={() => setMobileOpen(false)} />
          ))}
          {showAdmin && (
            <>
              <div className="px-3 py-2 mt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Administracija
              </div>
              <div className="flex flex-col gap-1 px-2">
                <NavLink to="/settings/company" onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <Building2 className="w-5 h-5 text-indigo-500" /> Profil Firme
                </NavLink>
                <NavLink to="/settings/categories" onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <Tags className="w-5 h-5" /> Šifarnici
                </NavLink>
                <NavLink to="/settings/users" onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <Users className="w-5 h-5" /> Korisnici
                </NavLink>
                <NavLink to="/settings/role-permissions" onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <ShieldAlert className="w-5 h-5" /> Dozvole
                </NavLink>
                <NavLink to="/settings/audit-log" onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <Activity className="w-5 h-5" /> Audit Log
                </NavLink>
              </div>
            </>
          )}
        </nav>
        <UserBlock />
      </aside>

      {/* Mobile top header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-40 h-14 flex items-center gap-3 px-4 border-b bg-background/80 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Meni">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" hideClose={true} className="w-72 p-0 bg-sidebar text-sidebar-foreground flex flex-col h-full">
              <div className="h-14 shrink-0 flex items-center gap-2 px-5 border-b border-sidebar-border">
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
                  <PackageSearch className="w-4 h-4" />
                </span>
                <span className="font-semibold">EventAsset</span>
              </div>
              <nav className="p-3 space-y-1 flex-1 overflow-y-auto pb-24">
                <div className="px-3 py-2 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Dnevne Operacije
            </div>
            {NAV_DAILY.map((item) => (
              <SideLink key={item.to} item={item} onClick={() => setMobileOpen(false)} />
            ))}

            <div className="px-3 py-2 mt-4 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Katalozi i Pregled
            </div>
            {NAV_CATALOGS.map((item) => (
              <SideLink key={item.to} item={item} onClick={() => setMobileOpen(false)} />
            ))}
                {showAdmin && (
                  <>
                    <div className="mt-4 mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Admin
                    </div>
                    <SideLink item={{ to: "/settings/company", label: "Profil Firme", icon: Building2, color: "text-indigo-500", bg: "bg-indigo-500/15" }} onClick={() => setMobileOpen(false)} />
                    <SideLink item={{ to: "/settings/users", label: "Korisnici", icon: Users, color: "text-blue-500", bg: "bg-blue-500/15" }} onClick={() => setMobileOpen(false)} />
                    <SideLink item={{ to: "/settings/audit-log", label: "Istorija izmena", icon: History, color: "text-amber-500", bg: "bg-amber-500/15" }} onClick={() => setMobileOpen(false)} />
                    <SideLink item={{ to: "/settings/api-keys", label: "API ključevi", icon: Settings, color: "text-slate-500", bg: "bg-slate-500/15" }} onClick={() => setMobileOpen(false)} />
                    <SideLink item={{ to: "/settings/backup", label: "Backup", icon: DatabaseBackup, color: "text-emerald-500", bg: "bg-emerald-500/15" }} onClick={() => setMobileOpen(false)} />
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold truncate max-w-[200px]">
            {companySettings.logo_url ? (
              <img
                src={companySettings.logo_url}
                alt={companySettings.short_name}
                className="h-6 w-auto max-w-[28px] object-contain rounded-md"
              />
            ) : (
              <span className="grid place-items-center w-7 h-7 rounded-md bg-primary text-primary-foreground">
                <PackageSearch className="w-4 h-4" />
              </span>
            )}
            <span className="truncate">{companySettings.short_name || "EventAsset"}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Pretraga"
              onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
            >
              <Search className="h-5 w-5" />
            </Button>
            <SyncIndicator />
            <ThemeToggle />
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 min-w-0 pb-24 lg:pb-0">
          <OfflineIndicator />
          {children}
        </main>
        <CommandPalette />

        {/* Mobile bottom nav - Exact style from user screenshot */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 h-16 border-t border-slate-800/80 bg-slate-950 text-slate-400 shadow-2xl flex items-center justify-around px-1 pb-safe">
          {/* 1. Pregled */}
          <Link
            to="/dashboard"
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${
              location.pathname === "/dashboard" || location.pathname === "/"
                ? "text-sky-400 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <LayoutDashboard className="h-5.5 w-5.5 stroke-2" />
            <span className="text-[11px] font-medium tracking-tight">Pregled</span>
          </Link>

          {/* 2. Oprema */}
          <Link
            to="/assets"
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${
              location.pathname.startsWith("/assets")
                ? "text-sky-400 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Package className="h-5.5 w-5.5 stroke-2" />
            <span className="text-[11px] font-medium tracking-tight">Oprema</span>
          </Link>

          {/* 3. Center Camera Action Button */}
          <Link
            to="/scan"
            className="flex flex-col items-center justify-center flex-1 -translate-y-3.5 group"
            aria-label="Skener"
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
                location.pathname === "/scan"
                  ? "bg-linear-to-b from-blue-500 to-blue-600 text-white shadow-[0_8px_24px_rgba(37,99,235,0.65)] scale-105 ring-4 ring-slate-950"
                  : "bg-linear-to-b from-blue-500 to-blue-600 text-white shadow-[0_6px_20px_rgba(37,99,235,0.5)] hover:scale-105 ring-4 ring-slate-950"
              }`}
            >
              <Camera className="h-7 w-7 text-white stroke-2" />
            </div>
          </Link>

          {/* 4. Događaji */}
          <Link
            to="/events"
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition-colors ${
              location.pathname.startsWith("/events")
                ? "text-sky-400 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <CalendarRange className="h-5.5 w-5.5 stroke-2" />
            <span className="text-[11px] font-medium tracking-tight">Događaji</span>
          </Link>

          {/* 5. Meni (Opens Mobile Sheet Drawer) */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center gap-1 flex-1 py-1 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <MoreHorizontal className="h-5.5 w-5.5 stroke-2" />
            <span className="text-[11px] font-medium tracking-tight">Meni</span>
          </button>
        </nav>
      </div>
    </div>
  );

  function UserBlock() {
    return (
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent transition">
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.avatar_url ?? undefined} />
                <AvatarFallback>{initials(profile?.full_name ?? user?.email)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium truncate">{profile?.full_name ?? user?.email}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {roles.length ? roles.map((r) => ROLE_LABELS[r]).join(", ") : "—"}
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" /> Odjavi se
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  function UserMenu() {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback>{initials(profile?.full_name ?? user?.email)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{profile?.full_name ?? user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Odjavi se
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
}

function SideLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const loc = useLocation();
  const active = loc.pathname === item.to || (item.to !== "/dashboard" && loc.pathname.startsWith(item.to + "/"));
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm font-semibold"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      }`}
    >
      <span className={`p-1.5 rounded-md flex items-center justify-center ${item.bg ?? "bg-muted"} ${item.color ?? ""}`}>
        <Icon className="h-4 w-4 stroke-[2.2]" />
      </span>
      {item.label}
    </Link>
  );
}


