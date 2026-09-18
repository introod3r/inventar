import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CompanySettings = {
  id: string;
  name: string;
  short_name: string;
  pib: string;
  mb: string;
  bank_account: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string | null;
  brand_color: string;
  revers_title: string;
  revers_disclaimer: string;
  default_return_days: number;
  revers_prefix: string;
  asset_code_prefix: string;
  currency: string;
  depreciation_rate: number;
  qr_label_company_text: string;
  show_value_on_revers: boolean;
  updated_at?: string;
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  id: "default",
  name: "EventAsset d.o.o.",
  short_name: "EVENTASSET",
  pib: "108954321",
  mb: "21045678",
  bank_account: "160-0000000123456-78 (Banca Intesa)",
  address: "Bulevar Mihajla Pupina 10",
  city: "Beograd",
  postal_code: "11070",
  country: "Srbija",
  phone: "+381 11 123 4567",
  email: "office@eventasset.rs",
  website: "https://eventasset.rs",
  logo_url: null,
  brand_color: "#0ea5e9",
  revers_title: "REVERS - ZADUŽENJE OPREME",
  revers_disclaimer:
    "Preuzimalac svojim potpisom garantuje da je navedenu opremu primio u ispravnom i kompletnom stanju, te preuzima punu materijalnu i krivičnu odgovornost za svako oštećenje, kvar ili gubitak opreme do momenta zvaničnog razduživanja.",
  default_return_days: 1,
  revers_prefix: "REV",
  asset_code_prefix: "AST",
  currency: "RSD",
  depreciation_rate: 20,
  qr_label_company_text: "EVENTASSET",
  show_value_on_revers: false,
};

const STORAGE_KEY = "eventasset.company-settings";

export function getStoredCompanySettings(): CompanySettings {
  if (typeof window === "undefined") return DEFAULT_COMPANY_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COMPANY_SETTINGS;
    return { ...DEFAULT_COMPANY_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_COMPANY_SETTINGS;
  }
}

function persistCompanySettings(settings: CompanySettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota
  }
}

export function useCompanySettings() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("company_settings")
          .select("*")
          .eq("id", "default")
          .maybeSingle();

        if (error) {
          // If table doesn't exist yet, gracefully use localStorage or defaults
          return getStoredCompanySettings();
        }

        if (data) {
          const merged: CompanySettings = {
            ...DEFAULT_COMPANY_SETTINGS,
            ...data,
          };
          persistCompanySettings(merged);
          return merged;
        }

        return getStoredCompanySettings();
      } catch {
        return getStoredCompanySettings();
      }
    },
    initialData: getStoredCompanySettings(),
    staleTime: 1000 * 60 * 10, // 10 mins
  });

  const updateMutation = useMutation({
    mutationFn: async (updated: Partial<CompanySettings>) => {
      const current = query.data || getStoredCompanySettings();
      const payload: CompanySettings = {
        ...current,
        ...updated,
        id: "default",
        updated_at: new Date().toISOString(),
      };

      // 1. Optimistic / local update
      persistCompanySettings(payload);

      // 2. Persist to Supabase if table exists
      try {
        const { error } = await (supabase as any)
          .from("company_settings")
          .upsert(payload);

        if (error && error.code !== "42P01") {
          console.warn("Could not save to remote company_settings table:", error);
        }
      } catch (e) {
        console.warn("Supabase upsert failed, stored locally:", e);
      }

      return payload;
    },
    onSuccess: (data) => {
      qc.setQueryData(["company_settings"], data);
      qc.invalidateQueries({ queryKey: ["company_settings"] });
      toast.success("Podešavanja firme su uspešno sačuvana!");
    },
    onError: (e) => {
      toast.error((e as Error).message || "Greška pri čuvanju podešavanja.");
    },
  });

  // Helper for logo upload
  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop() || "png";
      const path = `logo-${Date.now()}.${ext}`;

      // Upload to public storage bucket
      const { error: uploadErr } = await supabase.storage
        .from("company-assets")
        .upload(path, file, { upsert: true });

      if (uploadErr) {
        // If company-assets bucket is not created, try asset-photos as fallback
        const { error: fallbackErr } = await supabase.storage
          .from("asset-photos")
          .upload(`company/${path}`, file, { upsert: true });

        if (fallbackErr) throw uploadErr;

        const { data: publicUrl } = supabase.storage
          .from("asset-photos")
          .getPublicUrl(`company/${path}`);

        return publicUrl?.publicUrl ?? null;
      }

      const { data: publicUrl } = supabase.storage
        .from("company-assets")
        .getPublicUrl(path);

      return publicUrl?.publicUrl ?? null;
    },
  });

  return {
    settings: query.data || DEFAULT_COMPANY_SETTINGS,
    isLoading: query.isLoading,
    updateSettings: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    uploadLogo: uploadLogoMutation.mutateAsync,
    isUploadingLogo: uploadLogoMutation.isPending,
  };
}
