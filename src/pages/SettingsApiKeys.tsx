import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Copy, Trash2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";



async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `ea_${b64}`;
}

export default function SettingsApiKeys() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const { data: keys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, scopes, created_at, last_used_at, revoked_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = async () => {
    if (!name.trim()) return;
    const key = generateKey();
    const hash = await sha256Hex(key);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("api_keys").insert({
      name: name.trim(),
      key_hash: hash,
      scopes: ["read"],
      created_by: u.user?.id ?? null,
    });
    if (error) {
      toast.error("Greška pri kreiranju ključa");
      return;
    }
    setNewKey(key);
    setName("");
    qc.invalidateQueries({ queryKey: ["api-keys"] });
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Greška pri opozivu");
      return;
    }
    toast.success("Ključ opozvan");
    qc.invalidateQueries({ queryKey: ["api-keys"] });
  };

  return (
    <PageContainer>
      <PageHeader
        title="API ključevi"
        description="Integracije sa knjigovodstvenim i ERP sistemima"
        actions={
          <Button onClick={() => { setOpen(true); setNewKey(null); }}>
            <Plus className="h-4 w-4 mr-2" /> Novi ključ
          </Button>
        }
      />

      <Card className="card-elevated mb-6">
        <CardHeader>
          <CardTitle className="text-base">Endpointi</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div>
            <code className="px-1.5 py-0.5 bg-muted rounded">GET /api/public/v1/assets</code> — lista opreme (<code>status</code>, <code>limit</code>, <code>offset</code>)
          </div>
          <div>
            <code className="px-1.5 py-0.5 bg-muted rounded">GET /api/public/v1/assets/:code</code> — detalji po šifri
          </div>
          <div>
            <code className="px-1.5 py-0.5 bg-muted rounded">GET /api/public/v1/checkouts</code> — reversi (<code>active=true|false</code>, <code>event_id</code>)
          </div>
          <div>
            <code className="px-1.5 py-0.5 bg-muted rounded">GET /api/public/v1/events</code> — događaji (<code>status</code>, <code>from</code>, <code>to</code>)
          </div>
          <div>
            <code className="px-1.5 py-0.5 bg-muted rounded">GET /api/public/v1/stats</code> — agregirana statistika
          </div>
          <p className="text-muted-foreground pt-2">
            Šalji ključ kroz <code className="px-1.5 py-0.5 bg-muted rounded">Authorization: Bearer &lt;key&gt;</code>
          </p>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardContent className="p-0">
          {(keys ?? []).length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground text-center">Nema API ključeva. Kreiraj prvi.</div>
          ) : (
            <ul className="divide-y">
              {keys!.map((k) => (
                <li key={k.id} className="p-4 flex items-center gap-3">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{k.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Kreiran {formatDateTime(k.created_at)} ·
                      {k.last_used_at ? ` koriščen ${formatDateTime(k.last_used_at)}` : " još nije korišćen"}
                    </div>
                  </div>
                  {k.revoked_at ? (
                    <Badge variant="secondary">Opozvan</Badge>
                  ) : (
                    <Badge>Aktivan</Badge>
                  )}
                  {!k.revoked_at && (
                    <Button variant="ghost" size="icon" onClick={() => revoke(k.id)} title="Opozovi">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newKey ? "Ključ kreiran" : "Novi API ključ"}</DialogTitle>
          </DialogHeader>
          {newKey ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sačuvaj ovaj ključ odmah — više nećeš moći da ga vidiš.
              </p>
              <div className="flex gap-2">
                <Input value={newKey} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(newKey);
                    toast.success("Kopirano");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => { setOpen(false); setNewKey(null); }}>Zatvori</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Naziv (npr. "Knjigovodstvo")</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naziv integracije" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Otkaži</Button>
                <Button onClick={create} disabled={!name.trim()}>Kreiraj</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
