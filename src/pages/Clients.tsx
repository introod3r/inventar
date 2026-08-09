import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Users, Pencil, Mail, MapPin, Phone, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/common/ConfirmDelete";
import { useAuth } from "@/features/auth/use-auth";

import { Trash2 } from "lucide-react";

type ContactPerson = { name: string; phone: string };
type ClientForm = { id?: string; name: string; contacts: ContactPerson[]; email: string; address: string };
const emptyForm: ClientForm = { name: "", contacts: [], email: "", address: "" };

function parseContacts(contactStr: string | null, phoneStr: string | null): ContactPerson[] {
  if (!contactStr) return [];
  if (contactStr.trim().startsWith('[')) {
    try {
      return JSON.parse(contactStr);
    } catch (e) {}
  }
  return [{ name: contactStr, phone: phoneStr || "" }];
}

export default function Clients() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("manage_events");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ClientForm>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => (await supabase.from("clients").select("*").order("name")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        contact: form.contacts.length > 0 ? JSON.stringify(form.contacts) : null,
        email: form.email || null,
        phone: null, // We migrate phone data into the JSON array
        address: form.address || null,
      };
      const { error } = form.id
        ? await supabase.from("clients").update(payload).eq("id", form.id)
        : await supabase.from("clients").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(form.id ? "Klijent izmenjen" : "Klijent dodat");
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
      toast.success("Obrisano");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const startEdit = (c: { id: string; name: string; contact: string | null; email: string | null; phone: string | null; address: string | null }) => {
    setForm({
      id: c.id,
      name: c.name ?? "",
      contacts: parseContacts(c.contact, c.phone),
      email: c.email ?? "",
      address: c.address ?? "",
    });
    setOpen(true);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Klijenti"
        actions={
          canManage ? (
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm); }}>
              <DialogTrigger asChild>
                <Button onClick={() => setForm(emptyForm)}><Plus className="mr-2 h-4 w-4" />Novi klijent</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{form.id ? "Izmeni klijenta" : "Novi klijent"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Naziv *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Adresa</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                  
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <Label>Kontakt osobe</Label>
                      <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, contacts: [...form.contacts, { name: "", phone: "" }] })}>
                        <Plus className="mr-1 h-3 w-3" /> Dodaj
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {form.contacts.map((contact, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <div className="flex-1 space-y-1">
                            <Input placeholder={`Ime i prezime osobe ${i + 1}`} value={contact.name} onChange={(e) => {
                              const newContacts = [...form.contacts];
                              newContacts[i].name = e.target.value;
                              setForm({ ...form, contacts: newContacts });
                            }} />
                          </div>
                          <div className="flex-1 space-y-1">
                            <Input placeholder={`Telefon osobe ${i + 1}`} value={contact.phone} onChange={(e) => {
                              const newContacts = [...form.contacts];
                              newContacts[i].phone = e.target.value;
                              setForm({ ...form, contacts: newContacts });
                            }} />
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => {
                            const newContacts = form.contacts.filter((_, idx) => idx !== i);
                            setForm({ ...form, contacts: newContacts });
                          }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      {form.contacts.length === 0 && <div className="text-sm text-muted-foreground italic">Nema unetih kontakt osoba.</div>}
                    </div>
                  </div>
                </div>
                <DialogFooter><Button onClick={() => save.mutate()} disabled={!form.name.trim() || save.isPending}>Sačuvaj</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Učitavanje…</div>
      ) : !data?.length ? (
        <div className="py-12 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p>Nema klijenata.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((c) => {
            const contacts = parseContacts(c.contact, c.phone);
            return (
              <div key={c.id} className="flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="flex items-start justify-between p-4 bg-muted/30 border-b">
                  <div className="font-semibold text-base wrap-break-word pr-2">{c.name}</div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0 -mr-2 -mt-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => startEdit(c)} aria-label="Izmeni">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDelete
                        title={`Obrisati klijenta „${c.name}"?`}
                        description="Ako je klijent povezan sa događajima, brisanje može biti odbijeno."
                        onConfirm={() => remove.mutate(c.id)}
                      />
                    </div>
                  )}
                </div>
                
                <div className="p-4 space-y-4 flex-1 text-sm">
                  {(c.email || c.address) && (
                    <div className="space-y-2 text-muted-foreground">
                      {c.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 shrink-0 opacity-70" />
                          <span className="truncate">{c.email}</span>
                        </div>
                      )}
                      {c.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 shrink-0 opacity-70 mt-0.5" />
                          <span className="wrap-break-word line-clamp-3">{c.address}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {contacts.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                        Kontakt osobe
                      </div>
                      <ul className="space-y-2">
                        {contacts.map((ct, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 bg-accent/40 rounded-lg p-2.5">
                            <UserCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5 opacity-60" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate">{ct.name || "Bez imena"}</div>
                              {ct.phone && (
                                <div className="text-[13px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                  <Phone className="h-3 w-3 opacity-70" />
                                  {ct.phone}
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
