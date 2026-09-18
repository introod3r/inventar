import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type EventStatus = Database["public"]["Enums"]["event_status"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: Date | null;
  onEventCreated?: (eventId: string) => void;
}

export function QuickEventModal({ open, onOpenChange, initialDate, onEventCreated }: Props) {
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [locationText, setLocationText] = useState("");
  const [status, setStatus] = useState<EventStatus>("confirmed");
  const [notes, setNotes] = useState("");

  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  // Format date to datetime-local string YYYY-MM-DDTHH:mm
  const formatDateTimeLocal = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  useEffect(() => {
    if (open) {
      const base = initialDate ? new Date(initialDate) : new Date();
      base.setHours(9, 0, 0, 0);
      const end = new Date(base);
      end.setHours(18, 0, 0, 0);

      setStartAt(formatDateTimeLocal(base));
      setEndAt(formatDateTimeLocal(end));
      setName("");
      setClientId("");
      setLocationId("");
      setLocationText("");
      setStatus("confirmed");
      setNotes("");
    }
  }, [open, initialDate]);

  // Clients
  const { data: clients } = useQuery({
    queryKey: ["clients-flat"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Locations
  const { data: locations } = useQuery({
    queryKey: ["locations-flat"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Unesite naziv događaja.");
      if (!startAt || !endAt) throw new Error("Unesite vreme početka i završetka.");
      if (new Date(endAt) <= new Date(startAt)) {
        throw new Error("Vreme završetka mora biti nakon vremena početka.");
      }

      const { data: { user } } = await supabase.auth.getUser();

      const { data: ev, error } = await supabase
        .from("events")
        .insert({
          name: name.trim(),
          client_id: clientId || null,
          location_id: locationId || null,
          location_text: locationText.trim() || null,
          start_at: new Date(startAt).toISOString(),
          end_at: new Date(endAt).toISOString(),
          status,
          notes: notes.trim() || null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();

      if (error) throw error;
      return ev.id;
    },
    onSuccess: (id) => {
      toast.success("Događaj je uspešno kreiran!");
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
      qc.invalidateQueries({ queryKey: ["events"] });
      onOpenChange(false);
      onEventCreated?.(id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Novi događaj
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
          }}
          className="space-y-4 py-2 text-sm"
        >
          {/* Naziv */}
          <div className="space-y-1.5">
            <Label htmlFor="event-name">Naziv događaja *</Label>
            <Input
              id="event-name"
              placeholder="npr. Koncert Beogradska Arena, Korporativni Forum..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Vreme početka i kraja */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-start" className="text-xs">Početak *</Label>
              <Input
                id="event-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-end" className="text-xs">Završetak *</Label>
              <Input
                id="event-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                required
                className="text-xs"
              />
            </div>
          </div>

          {/* Klijent */}
          <div className="space-y-1.5">
            <Label className="text-xs">Klijent</Label>
            <Select value={clientId || "__none"} onValueChange={(v) => setClientId(v === "__none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Izaberite klijenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Nema klijenta —</SelectItem>
                {clients?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lokacija */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Lokacija iz baze</Label>
              <Select value={locationId || "__none"} onValueChange={(v) => setLocationId(v === "__none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Izaberi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Bez lokacije —</SelectItem>
                  {locations?.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="event-loc-text" className="text-xs">Ili tekstualna adresa</Label>
              <Input
                id="event-loc-text"
                placeholder="npr. Hala 1, Sajam..."
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs">Status događaja</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as EventStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Potvrđeno (Confirmed)</SelectItem>
                <SelectItem value="draft">Nacrt (Draft)</SelectItem>
                <SelectItem value="in_progress">U toku (In Progress)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Napomene */}
          <div className="space-y-1.5">
            <Label htmlFor="event-notes" className="text-xs">Napomene</Label>
            <Textarea
              id="event-notes"
              placeholder="Tehnički detalji, satnica montiranja..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Odustani
            </Button>
            <Button type="submit" disabled={createMut.isPending} className="gap-2">
              <CalendarPlus className="h-4 w-4" />
              {createMut.isPending ? "Kreiranje..." : "Sačuvaj događaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
