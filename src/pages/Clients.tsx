import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Users,
  Pencil,
  Mail,
  MapPin,
  Phone,
  PhoneCall,
  UserCircle,
  Trash2,
  Search,
  X,
  Building2,
  Calendar,
  ExternalLink,
  Briefcase
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";
import { useAuth } from "@/features/auth/use-auth";

type ContactPerson = { name: string; phone: string };
type ClientForm = {
  id?: string;
  name: string;
  pib: string;
  mb: string;
  contacts: ContactPerson[];
  email: string;
  address: string;
};

const emptyForm: ClientForm = {
  name: "",
  pib: "",
  mb: "",
  contacts: [],
  email: "",
  address: "",
};

function parseContacts(contactStr: string | null, phoneStr: string | null): ContactPerson[] {
  if (!contactStr) {
    if (phoneStr && !phoneStr.startsWith("{") && !phoneStr.includes("PIB:") && !phoneStr.includes("MB:")) {
      return [{ name: "Glavni kontakt", phone: phoneStr }];
    }
    return [];
  }
  if (contactStr.trim().startsWith("[")) {
    try {
      return JSON.parse(contactStr);
    } catch {
      // ignore parse error
    }
  }
  return [{ name: contactStr, phone: phoneStr || "" }];
}

function parseB2B(phoneStr: string | null): { pib: string; mb: string } {
  if (!phoneStr) return { pib: "", mb: "" };
  if (phoneStr.startsWith("{")) {
    try {
      const data = JSON.parse(phoneStr);
      return { pib: data.pib || "", mb: data.mb || "" };
    } catch {
      // ignore JSON parse error
    }
  }
  const pibMatch = phoneStr.match(/PIB:\s*([A-Za-z0-9]+)/i);
  const mbMatch = phoneStr.match(/MB:\s*([A-Za-z0-9]+)/i);
  return {
    pib: pibMatch ? pibMatch[1] : "",
    mb: mbMatch ? mbMatch[1] : "",
  };
}

export default function Clients() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("manage_events");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [search, setSearch] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await supabase.from("clients").select("*").order("name")).data ?? [],
  });

  const { data: eventsMap = new Map<string, { total: number; active: number }>() } = useQuery({
    queryKey: ["clients-events-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id, client_id, status");
      const map = new Map<string, { total: number; active: number }>();
      data?.forEach((ev) => {
        if (!ev.client_id) return;
        const current = map.get(ev.client_id) || { total: 0, active: 0 };
        current.total += 1;
        if (ev.status !== "cancelled" && ev.status !== "completed") {
          current.active += 1;
        }
        map.set(ev.client_id, current);
      });
      return map;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const pib = form.pib.trim();
      const mb = form.mb.trim();
      const b2bPayload = pib || mb ? JSON.stringify({ pib, mb }) : null;

      const payload = {
        name: form.name.trim(),
        contact: form.contacts.length > 0 ? JSON.stringify(form.contacts) : null,
        email: form.email.trim() || null,
        phone: b2bPayload,
        address: form.address.trim() || null,
      };

      const { error } = form.id
        ? await supabase.from("clients").update(payload).eq("id", form.id)
        : await supabase.from("clients").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(form.id ? "Klijent uspešno izmenjen" : "Klijent uspešno dodat");
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Klijent obrisan");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-events-summary"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const startEdit = (c: {
    id: string;
    name: string;
    contact: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  }) => {
    const b2b = parseB2B(c.phone);
    setForm({
      id: c.id,
      name: c.name ?? "",
      pib: b2b.pib,
      mb: b2b.mb,
      contacts: parseContacts(c.contact, c.phone),
      email: c.email ?? "",
      address: c.address ?? "",
    });
    setOpen(true);
  };

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.email?.toLowerCase().includes(q)) return true;
      if (c.address?.toLowerCase().includes(q)) return true;
      const b2b = parseB2B(c.phone);
      if (b2b.pib.toLowerCase().includes(q) || b2b.mb.toLowerCase().includes(q)) return true;
      const contacts = parseContacts(c.contact, c.phone);
      if (contacts.some((ct) => ct.name.toLowerCase().includes(q) || ct.phone.toLowerCase().includes(q))) {
        return true;
      }
      return false;
    });
  }, [clients, search]);

  return (
    <PageContainer>
      <PageHeader
        title="Baza Klijenata"
        description="Evidencija klijenata, B2B identifikatori, kontakti i istorija realizovanih angažovanja."
        actions={
          canManage ? (
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) setForm(emptyForm);
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={() => setForm(emptyForm)} className="shadow-sm">
                  <Plus className="mr-2 h-4 w-4" /> Novi klijent
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{form.id ? "Izmena podataka o klijentu" : "Novi klijent / partner"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3.5 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="client-name">Naziv pravnog lica ili klijenta *</Label>
                    <Input
                      id="client-name"
                      placeholder="npr. Exit Festival d.o.o."
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="client-pib">PIB</Label>
                      <Input
                        id="client-pib"
                        placeholder="npr. 108123456"
                        value={form.pib}
                        onChange={(e) => setForm({ ...form, pib: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="client-mb">Matični broj (MB)</Label>
                      <Input
                        id="client-mb"
                        placeholder="npr. 20987654"
                        value={form.mb}
                        onChange={(e) => setForm({ ...form, mb: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="client-email">Email adresa</Label>
                    <Input
                      id="client-email"
                      type="email"
                      placeholder="kontakt@klijent.rs"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="client-address">Sedište / Adresa za isporuku</Label>
                    <Textarea
                      id="client-address"
                      rows={2}
                      placeholder="Ulica, broj, grad, poštanski broj"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                    />
                  </div>

                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <Label className="text-sm font-semibold">Kontakt osobe na terenu</Label>
                        <p className="text-xs text-muted-foreground">Odgovorna lica za preuzimanje i vraćanje opreme</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setForm({ ...form, contacts: [...form.contacts, { name: "", phone: "" }] })}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Dodaj
                      </Button>
                    </div>
                    <div className="space-y-2.5">
                      {form.contacts.map((contact, i) => (
                        <div key={i} className="flex gap-2 items-center bg-muted/40 p-2 rounded-lg border">
                          <div className="flex-1 space-y-1">
                            <Input
                              placeholder={`Ime i prezime`}
                              value={contact.name}
                              onChange={(e) => {
                                const newContacts = [...form.contacts];
                                newContacts[i].name = e.target.value;
                                setForm({ ...form, contacts: newContacts });
                              }}
                            />
                          </div>
                          <div className="flex-1 space-y-1">
                            <Input
                              placeholder={`Telefon`}
                              value={contact.phone}
                              onChange={(e) => {
                                const newContacts = [...form.contacts];
                                newContacts[i].phone = e.target.value;
                                setForm({ ...form, contacts: newContacts });
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const newContacts = form.contacts.filter((_, idx) => idx !== i);
                              setForm({ ...form, contacts: newContacts });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {form.contacts.length === 0 && (
                        <div className="text-xs text-muted-foreground italic py-1">
                          Nema unetih kontakt osoba za ovog klijenta.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Odustani
                  </Button>
                  <Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>
                    {save.isPending ? "Čuvanje..." : "Sačuvaj podatke"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      {/* Pretraga i KPI metrika */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži klijente po imenu, PIB-u, kontaktu, gradu..."
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="text-xs sm:text-sm text-muted-foreground font-medium flex items-center gap-2">
          <span>Ukupno klijenata: <strong className="text-foreground">{clients.length}</strong></span>
          {search && <span>(pronađeno {filteredClients.length})</span>}
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Učitavanje baze klijenata…</div>
      ) : clients.length === 0 ? (
        <div className="py-16 text-center border rounded-xl bg-card">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-40" />
          <h3 className="font-semibold text-lg mb-1">Nema evidentiranih klijenata</h3>
          <p className="text-sm text-muted-foreground mb-4">Dodajte prvog klijenta ili partnera za zaduživanje opreme.</p>
          {canManage && (
            <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Dodaj klijenta
            </Button>
          )}
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="py-12 text-center border rounded-xl bg-card">
          <Search className="h-10 w-10 mx-auto text-muted-foreground mb-2 opacity-40" />
          <p className="font-medium">Nema rezultata za „{search}”</p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">Pokušajte sa drugačijim terminom ili obrišite filter.</p>
          <Button variant="outline" size="sm" onClick={() => setSearch("")}>
            Poništi pretragu
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((c) => {
            const contacts = parseContacts(c.contact, c.phone);
            const b2b = parseB2B(c.phone);
            const eventStats = eventsMap.get(c.id);

            return (
              <div
                key={c.id}
                className="flex flex-col rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden group"
              >
                {/* Header klijenta */}
                <div className="flex items-start justify-between p-4 bg-muted/20 border-b">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary shrink-0 opacity-80" />
                      <h3 className="font-semibold text-base truncate text-foreground">{c.name}</h3>
                    </div>
                    {/* PIB i MB značke */}
                    {(b2b.pib || b2b.mb) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {b2b.pib && (
                          <Badge variant="outline" className="text-[11px] font-mono px-1.5 py-0 bg-background/50">
                            PIB: {b2b.pib}
                          </Badge>
                        )}
                        {b2b.mb && (
                          <Badge variant="outline" className="text-[11px] font-mono px-1.5 py-0 bg-background/50">
                            MB: {b2b.mb}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0 -mr-1 -mt-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(c)}
                        aria-label="Izmeni podatke"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDelete
                        title={`Obrisati klijenta „${c.name}”?`}
                        description="Ako je klijent povezan sa događajima ili reversima, brisanje može biti odbijeno radi očuvanja istorije."
                        onConfirm={() => remove.mutate(c.id)}
                      />
                    </div>
                  )}
                </div>

                {/* Središnji deo sa podacima */}
                <div className="p-4 space-y-3.5 flex-1 text-sm">
                  {/* Događaji / statistika */}
                  <div className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-accent/30 border border-accent/40">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 text-primary" /> Realizovani događaji:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <strong className="font-semibold">{eventStats?.total || 0}</strong>
                      {eventStats?.active ? (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-600">
                          {eventStats.active} aktivan
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {/* Email & Adresa */}
                  {(c.email || c.address) && (
                    <div className="space-y-2 text-muted-foreground">
                      {c.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 shrink-0 text-muted-foreground opacity-70" />
                          <a
                            href={`mailto:${c.email}`}
                            className="truncate text-foreground hover:text-primary hover:underline"
                            title="Pošalji email"
                          >
                            {c.email}
                          </a>
                        </div>
                      )}
                      {c.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground opacity-70 mt-0.5" />
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="line-clamp-2 text-foreground/90 hover:text-primary hover:underline flex items-center gap-1"
                            title="Otvori na mapi"
                          >
                            <span>{c.address}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Kontakt osobe sa 1-tap pozivom */}
                  {contacts.length > 0 && (
                    <div className="space-y-2 pt-1 border-t">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center justify-between">
                        <span>Kontakt osobe</span>
                        <span className="text-[11px] font-normal lowercase">{contacts.length} kontakt(a)</span>
                      </div>
                      <ul className="space-y-2">
                        {contacts.map((ct, idx) => {
                          const cleanPhone = ct.phone ? ct.phone.replace(/[^0-9+]/g, "") : "";
                          return (
                            <li
                              key={idx}
                              className="flex items-center justify-between gap-2 bg-accent/40 rounded-lg p-2.5 border border-border/50 hover:bg-accent/60 transition-colors"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <UserCircle className="h-5 w-5 text-muted-foreground shrink-0 opacity-60" />
                                <div className="min-w-0">
                                  <div className="font-medium text-xs sm:text-sm truncate text-foreground">
                                    {ct.name || "Bez imena"}
                                  </div>
                                  {ct.phone ? (
                                    <a
                                      href={`tel:${cleanPhone}`}
                                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5 hover:underline"
                                    >
                                      <Phone className="h-3 w-3 opacity-70" />
                                      {ct.phone}
                                    </a>
                                  ) : (
                                    <div className="text-[11px] text-muted-foreground italic">Bez telefona</div>
                                  )}
                                </div>
                              </div>

                              {cleanPhone && (
                                <a
                                  href={`tel:${cleanPhone}`}
                                  className="h-8 w-8 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 transition-transform active:scale-95"
                                  title={`Pozovi ${ct.name || ct.phone}`}
                                  aria-label={`Pozovi ${ct.name || ct.phone}`}
                                >
                                  <PhoneCall className="h-4 w-4" />
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Footer kartice */}
                <div className="p-3 bg-muted/10 border-t flex items-center justify-between text-xs text-muted-foreground">
                  <Link
                    to={`/events`}
                    className="hover:text-primary hover:underline flex items-center gap-1 font-medium"
                  >
                    <Briefcase className="h-3.5 w-3.5" /> Pogledaj angažovanja
                  </Link>
                  <span className="text-[11px] opacity-60">
                    ID: {c.id.substring(0, 8)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
