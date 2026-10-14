import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  User, 
  ArrowRight, 
  Clock, 
  CheckCircle2, 
  Boxes
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatDateTime } from "@/lib/format";

export interface CalendarEventDetails {
  id: string;
  name: string;
  start_at: string;
  end_at: string;
  status: "draft" | "confirmed" | "in_progress" | "completed" | "cancelled";
  location_text?: string | null;
  notes?: string | null;
  clients?: { name: string; contact?: string | null; phone?: string | null } | null;
  locations?: { name: string } | null;
  event_assets?: Array<{
    id: string;
    quantity: number;
    status: string;
    assets: {
      code: string;
      name: string;
    } | null;
  }>;
}

interface Props {
  event: CalendarEventDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarEventDialog({ event, open, onOpenChange }: Props) {
  if (!event) return null;

  const totalAssetsCount = event.event_assets?.reduce((sum, a) => sum + (a.quantity || 1), 0) || 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-semibold gap-1"><CheckCircle2 className="h-3 w-3" /> Potvrđeno</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="bg-blue-500/15 text-blue-500 border-blue-500/30 font-semibold gap-1"><Clock className="h-3 w-3" /> U toku</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-purple-500/15 text-purple-500 border-purple-500/30 font-semibold">Završeno</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-rose-500/15 text-rose-500 border-rose-500/30 font-semibold">Otkazano</Badge>;
      default:
        return <Badge variant="outline" className="bg-slate-500/15 text-slate-400 border-slate-500/30 font-semibold">Nacrt</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-6">
        <DialogHeader className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            {getStatusBadge(event.status)}
            <span className="text-[11px] font-mono text-muted-foreground">ID: {event.id.slice(0, 8)}</span>
          </div>
          <DialogTitle className="text-xl font-bold text-foreground tracking-tight">
            {event.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Vreme i datum */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-4 w-4 text-primary" />
              <span>Vremenski period</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Početak</span>
                <span className="font-medium text-foreground">{formatDateTime(event.start_at)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Završetak</span>
                <span className="font-medium text-foreground">{formatDateTime(event.end_at)}</span>
              </div>
            </div>
          </div>

          {/* Klijent i Lokacija */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium">
                <User className="h-3.5 w-3.5 text-primary" /> Klijent
              </span>
              <p className="font-bold text-foreground truncate">
                {event.clients?.name || "Nije dodeljen"}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium">
                <MapPin className="h-3.5 w-3.5 text-primary" /> Lokacija
              </span>
              <p className="font-bold text-foreground truncate">
                {event.locations?.name || event.location_text || "Nije navedena"}
              </p>
            </div>
          </div>

          {/* Napomene */}
          {event.notes && (
            <div className="p-3 rounded-xl bg-muted/20 border border-border text-xs text-muted-foreground">
              <strong className="text-foreground block mb-1">Napomena:</strong>
              {event.notes}
            </div>
          )}

          {/* Angažovana Oprema */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Boxes className="h-4 w-4 text-primary" />
                Rezervisana oprema
              </span>
              <Badge variant="secondary" className="font-mono text-[11px]">
                {totalAssetsCount} komada ({event.event_assets?.length || 0} stavki)
              </Badge>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5 border border-border/70 rounded-xl p-2 bg-background/50">
              {!event.event_assets?.length ? (
                <p className="text-xs text-center text-muted-foreground py-3">
                  Nema dodeljene opreme za ovaj događaj.
                </p>
              ) : (
                event.event_assets.map((ea) => (
                  <div
                    key={ea.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-bold text-primary text-[11px]">{ea.assets?.code}</span>
                      <span className="font-medium text-foreground truncate">{ea.assets?.name}</span>
                    </div>
                    <span className="font-mono text-muted-foreground font-semibold shrink-0 ml-2">
                      ×{ea.quantity}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Zatvori
          </Button>
          <Button asChild size="sm" className="gap-2">
            <Link to={`/events/${event.id}`}>
              Otvori događaj
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
