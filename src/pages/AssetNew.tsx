import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { calculateBookValue } from "@/lib/calculations";


export default function AssetNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initCode = searchParams.get("code") ?? "";
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: initCode,
    name: "",
    serial_number: "",
    description: "",
    qr_code: initCode,
    barcode: "",
    purchase_date: "",
    purchase_value: "",
    depreciation_rate: "",
    category_id: "",
    current_location_id: "",
    quantity: "1",
    unit: "kom",
  });

  const { data: locations } = useQuery({
    queryKey: ["locations-flat"],
    queryFn: async () => (await supabase.from("locations").select("id,name").order("name")).data ?? [],
  });
  const { data: categories } = useQuery({
    queryKey: ["categories-flat"],
    queryFn: async () => (await supabase.from("categories").select("id,name").order("name")).data ?? [],
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("assets")
        .insert({
          code: form.code.trim(),
          name: form.name.trim(),
          serial_number: form.serial_number.trim() || null,
          description: form.description.trim() || null,
          qr_code: form.qr_code.trim() || form.code.trim(),
          barcode: form.barcode.trim() || null,
          purchase_date: form.purchase_date || null,
          purchase_value: form.purchase_value ? Number(form.purchase_value) : null,
          depreciation_rate: form.depreciation_rate ? Number(form.depreciation_rate) : null,
          current_value: calculateBookValue(
            form.purchase_value ? Number(form.purchase_value) : null,
            form.purchase_date || null,
            form.depreciation_rate ? Number(form.depreciation_rate) : null
          ),
          category_id: form.category_id || null,
          current_location_id: form.current_location_id || null,
          quantity: Number(form.quantity) || 1,
          unit: form.unit || "kom",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Oprema kreirana");
      navigate(`/assets/${data.id}`);
    } catch (e) {
      const err = e as Error;
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Nova oprema" description="Unesi podatke o osnovnom sredstvu" />
      <Card className="card-elevated max-w-3xl">
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Šifra *" required>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </Field>
            <Field label="Naziv *" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Serijski broj">
              <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
            </Field>
            <Field label="Barkod">
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </Field>
            <Field label="QR kod">
              <Input value={form.qr_code} onChange={(e) => setForm({ ...form, qr_code: e.target.value })} placeholder="Default = šifra" />
            </Field>
            <Field label="Kategorija">
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Izaberi…" /></SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Lokacija">
              <Select value={form.current_location_id} onValueChange={(v) => setForm({ ...form, current_location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Izaberi…" /></SelectTrigger>
                <SelectContent>
                  {locations?.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Datum nabavke">
              <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
            </Field>
            <Field label="Nabavna vrednost (RSD)">
              <Input type="number" step="0.01" value={form.purchase_value} onChange={(e) => setForm({ ...form, purchase_value: e.target.value })} />
            </Field>
            <Field label="Amortizacija (% godišnje)">
              <Input type="number" step="0.1" min="0" max="100" value={form.depreciation_rate} onChange={(e) => setForm({ ...form, depreciation_rate: e.target.value })} placeholder="npr. 15.5" />
            </Field>
            <Field label="Knjigovodstvena vrednost">
              <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
                {calculateBookValue(
                  form.purchase_value ? Number(form.purchase_value) : null,
                  form.purchase_date || null,
                  form.depreciation_rate ? Number(form.depreciation_rate) : null
                ) !== null
                  ? `${calculateBookValue(
                      form.purchase_value ? Number(form.purchase_value) : null,
                      form.purchase_date || null,
                      form.depreciation_rate ? Number(form.depreciation_rate) : null
                    )?.toLocaleString("sr-RS", { maximumFractionDigits: 2 })} RSD`
                  : "—"}
              </div>
            </Field>
            <Field label="Količina">
              <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </Field>
            <Field label="Jedinica mere">
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Opis">
                <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>

            <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/assets")}>Otkaži</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sačuvaj
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required ? "" : ""}</Label>
      {children}
    </div>
  );
}
