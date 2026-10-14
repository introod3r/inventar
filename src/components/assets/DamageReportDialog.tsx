import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ImagePlus, X, AlertTriangle } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: { id: string; code: string; name: string };
  /** Also create a service_record and set status=in_service. Default: false (just damaged). */
  sendToService?: boolean;
  checkoutId?: string | null;
  onReportSubmitted?: () => void;
};

export function DamageReportDialog({
  open,
  onOpenChange,
  asset,
  sendToService = false,
  checkoutId,
  onReportSubmitted,
}: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [severity, setSeverity] = useState<"minor" | "moderate" | "severe">("moderate");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [alsoService, setAlsoService] = useState(sendToService);

  useEffect(() => {
    if (!open) {
      setSeverity("moderate"); setDescription(""); setFiles([]); setPreviews([]); setAlsoService(sendToService);
    }
  }, [open, sendToService]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!description.trim()) throw new Error("Opis oštećenja je obavezan.");
      const { data: { user } } = await supabase.auth.getUser();

      // Upload photos
      const paths: string[] = [];
      for (const [i, file] of files.entries()) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${asset.id}/${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage.from("damage-photos").upload(path, file, { contentType: file.type });
        if (error) throw error;
        paths.push(path);
      }

      // Optional service record
      let serviceId: string | null = null;
      if (alsoService) {
        const { data: srv, error: srvErr } = await supabase.from("service_records").insert({
          asset_id: asset.id, type: "repair", description, reported_by: user?.id ?? null,
        }).select("id").single();
        if (srvErr) throw srvErr;
        serviceId = srv.id;
      }

      const { error } = await supabase.from("damage_reports").insert({
        asset_id: asset.id, reported_by: user?.id ?? null,
        severity, description, photo_paths: paths,
        service_record_id: serviceId,
      });
      if (error) throw error;

      // Update asset status
      await supabase.from("assets").update({ status: alsoService ? "in_service" : "damaged" }).eq("id", asset.id);

      // If associated with a checkout return, mark checkout returned with damaged note
      if (checkoutId) {
        await supabase.from("checkouts").update({
          returned_at: new Date().toISOString(),
          return_received_by: user?.id ?? null,
          condition_in: `Oštećeno (${severity}) · ${description}`,
        }).eq("id", checkoutId);
      }
    },
    onSuccess: () => {
      toast.success("Prijava oštećenja sačuvana");
      qc.invalidateQueries({ queryKey: ["asset", asset.id] });
      qc.invalidateQueries({ queryKey: ["asset-history", asset.id] });
      qc.invalidateQueries({ queryKey: ["damage-reports"] });
      qc.invalidateQueries({ queryKey: ["service-records"] });
      if (checkoutId) {
        qc.invalidateQueries({ queryKey: ["checkouts"] });
        qc.invalidateQueries({ queryKey: ["open-checkouts"] });
      }
      onReportSubmitted?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addFiles = (list: FileList) => {
    setFiles((cur) => [...cur, ...Array.from(list)].slice(0, 10));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Prijavi oštećenje</DialogTitle>
          <DialogDescription>{asset.name} · {asset.code}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label>Ozbiljnost</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">Lakše (kozmetičko)</SelectItem>
                <SelectItem value="moderate">Srednje (utiče na rad)</SelectItem>
                <SelectItem value="severe">Teško (neispravno)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Opis oštećenja *</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Šta se desilo, šta je oštećeno…" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Fotografije ({files.length}/10)</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={files.length >= 10}>
                <ImagePlus className="mr-2 h-4 w-4" />Dodaj
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
              />
            </div>
            {previews.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {previews.map((src, i) => (
                  <div key={i} className="relative aspect-square rounded-md overflow-hidden border border-border bg-muted">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/60 text-white rounded p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={alsoService} onChange={(e) => setAlsoService(e.target.checked)} />
            Pošalji odmah na servis (kreira servisni nalog, status: <span className="font-medium">in_service</span>)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Otkaži</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
            Sačuvaj prijavu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
