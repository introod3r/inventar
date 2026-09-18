import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationInput } from "@/components/common/LocationInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { toast } from "sonner";



export default function EventNew() {
  const nav = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", client_id: "", location_text: "",
    start_at: "", end_at: "", notes: "",
  });



  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("events").insert({
        name: form.name.trim(),
        client_id: form.client_id || null,
        location_text: form.location_text || null,
        start_at: form.start_at,
        end_at: form.end_at,
        notes: form.notes || null,
        manager_id: user?.id ?? null,
        created_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      toast.success("Događaj kreiran");
      nav(`/events/${data.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <PageContainer>
      <PageHeader title="Novi događaj" />
      <Card className="card-elevated max-w-2xl">
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Naziv *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label>Početak *</Label>
              <Input type="datetime-local" required value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Kraj *</Label>
              <Input type="datetime-local" required value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Lokacija</Label>
              <LocationInput 
                value={form.location_text} 
                onChange={(val) => setForm({ ...form, location_text: val })} 
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Napomene</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => nav("/events")}>Otkaži</Button>
              <Button type="submit" disabled={saving}>Sačuvaj</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
