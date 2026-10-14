import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImagePlus, Star, StarOff, Trash2, Loader2, Camera } from "lucide-react";
import { toast } from "sonner";


type Photo = { id: string; storage_path: string; is_primary: boolean };

function publicUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const { data } = supabase.storage.from("asset-photos").getPublicUrl(path);
  return data.publicUrl;
}

export function AssetPhotos({ assetId }: { assetId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);


  const { data: photos, isLoading, error: photosError } = useQuery({
    queryKey: ["asset-photos", assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_photos")
        .select("id, storage_path, is_primary")
        .eq("asset_id", assetId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Photo[];
    },
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const isFirst = !(photos?.length);
      const items = files;
      let count = 0;
      for (const [i, file] of items.entries()) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${assetId}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("asset-photos")
          .upload(path, file, { contentType: file.type || `image/${ext}`, upsert: false });
        if (upErr) throw new Error(`Upload nije uspeo: ${upErr.message}`);
        try {
          const { error: insErr } = await supabase.from("asset_photos").insert({ asset_id: assetId, storage_path: path, is_primary: isFirst && i === 0 });
          if (insErr) throw insErr;
        } catch (insErr) {
          await supabase.storage.from("asset-photos").remove([path]);
          throw new Error(`Čuvanje u bazu nije uspelo: ${(insErr as Error).message}`);
        }
        count++;
      }
      return count;
    },
    onSuccess: async (count) => {
      toast.success(`Dodato fotografija: ${count}`);
      await qc.invalidateQueries({ queryKey: ["asset-photos", assetId] });
      await qc.refetchQueries({ queryKey: ["asset-photos", assetId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const setPrimary = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("asset_photos").update({ is_primary: false }).eq("asset_id", assetId);
      const { error } = await supabase.from("asset_photos").update({ is_primary: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-photos", assetId] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (p: Photo) => {
      await supabase.storage.from("asset-photos").remove([p.storage_path]);
      const { error } = await supabase.from("asset_photos").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fotografija obrisana");
      qc.invalidateQueries({ queryKey: ["asset-photos", assetId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Fotografije</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => cameraRef.current?.click()} disabled={upload.isPending}>
            <Camera className="mr-2 h-4 w-4" />Kamera
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
            Dodaj
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const selectedFiles = Array.from(e.target.files ?? []);
            if (selectedFiles.length) upload.mutate(selectedFiles);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const selectedFiles = Array.from(e.target.files ?? []);
            if (selectedFiles.length) upload.mutate(selectedFiles);
            e.target.value = "";
          }}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Učitavanje…</div>
        ) : photosError ? (
          <p className="text-sm text-destructive">Fotografije nije moguće učitati: {(photosError as Error).message}</p>
        ) : !photos?.length ? (
          <p className="text-sm text-muted-foreground">Nema fotografija. Dodaj prvu da postane primarna slika opreme.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative group rounded-md overflow-hidden border border-border bg-muted aspect-square">
                <img
                  src={publicUrl(p.storage_path)}
                  alt=""
                  className="w-full h-full object-contain"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300&auto=format&fit=crop&q=80";
                  }}
                />
                {p.is_primary && (
                  <span className="absolute top-1.5 left-1.5 text-[10px] uppercase tracking-wider bg-primary text-primary-foreground rounded px-1.5 py-0.5">Primarna</span>
                )}
                <div className="absolute inset-x-0 bottom-0 p-1.5 flex gap-1 bg-linear-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition">
                  <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => setPrimary.mutate(p.id)} disabled={p.is_primary} title="Postavi kao primarnu">
                    {p.is_primary ? <Star className="h-3.5 w-3.5" /> : <StarOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="destructive" className="h-7 w-7 ml-auto" onClick={() => { if (confirm("Obrisati fotografiju?")) remove.mutate(p); }} title="Obriši">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
