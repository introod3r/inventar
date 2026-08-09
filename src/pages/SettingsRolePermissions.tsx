import { useState } from "react";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/features/auth/use-auth";
import { toast } from "sonner";
import { PERMISSIONS, ROLE_LABELS, type PermissionKey, DEFAULT_ROLE_PERMISSIONS } from "@/features/rbac/permissions";
import { ShieldAlert } from "lucide-react";

export default function SettingsRolePermissions() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<AppRole>("warehouse");

  const roles = Object.keys(ROLE_LABELS) as AppRole[];

  // Fetch current permissions from DB
  const { data: dbPermissions, isLoading } = useQuery({
    queryKey: ["role_permissions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("role_permissions").select("*");
      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist yet, we will just use defaults
          return [];
        }
        throw error;
      }
      return (data as any[]) || [];
    },
  });

  const togglePermission = useMutation({
    mutationFn: async ({ role, permission_key, enabled }: { role: AppRole; permission_key: PermissionKey; enabled: boolean }) => {
      const { error } = await (supabase as any)
        .from("role_permissions")
        .upsert({ role, permission_key, enabled });
      
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role_permissions"] });
      toast.success("Dozvole su uspešno ažurirane!");
    },
    onError: (e: any) => {
      if (e.code === '42P01') {
        toast.error("Tabela role_permissions ne postoji u bazi. Pokrenite SQL skriptu.");
      } else {
        toast.error(e.message || "Došlo je do greške prilikom čuvanja.");
      }
    }
  });

  if (!hasRole("admin")) return <PageContainer><div className="p-8">Nemaš dozvolu za pristup.</div></PageContainer>;

  const handleToggle = (permKey: PermissionKey, currentlyEnabled: boolean) => {
    togglePermission.mutate({
      role: selectedRole,
      permission_key: permKey,
      enabled: !currentlyEnabled
    });
  };

  return (
    <PageContainer>
      <PageHeader 
        title="Dozvole po ulogama" 
        description="Fino podešavanje pristupa menijima i funkcionalnostima za svaku pojedinačnu ulogu" 
      />
      
      <Card className="card-elevated p-6 mb-6 border-amber-500/50 bg-amber-500/5">
        <div className="flex gap-4 items-start">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <strong>VAŽNO:</strong> Da bi ova stranica funkcionisala, morate pokrenuti SQL skriptu koja kreira <code>role_permissions</code> tabelu u bazi. Ukoliko tabela ne postoji, biće prikazane podrazumevane (default) dozvole, ali izmene neće biti sačuvane.
          </div>
        </div>
      </Card>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-64 shrink-0">
          <div className="flex flex-col gap-1">
            {roles.map(role => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  selectedRole === role 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1">
          <Card className="card-elevated overflow-hidden">
            <div className="p-6 border-b bg-muted/20">
              <h3 className="font-semibold text-lg">{ROLE_LABELS[selectedRole]}</h3>
              <p className="text-sm text-muted-foreground mt-1">Uključite ili isključite funkcionalnosti za ovu ulogu.</p>
            </div>
            <div className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Učitavanje...</div>
              ) : (
                <div className="divide-y">
                  {(Object.entries(PERMISSIONS) as [PermissionKey, string][]).map(([key, label]) => {
                    
                    // Check if there is an override in the DB
                    const dbRow = dbPermissions?.find(r => r.role === selectedRole && r.permission_key === key);
                    
                    // If no override, check if it's in the default array
                    const isDefaultEnabled = DEFAULT_ROLE_PERMISSIONS[selectedRole]?.includes(key);
                    
                    const isEnabled = dbRow ? dbRow.enabled : isDefaultEnabled;

                    return (
                      <div key={key} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                        <div className="space-y-1">
                          <Label className="text-base cursor-pointer" htmlFor={`perm-${key}`}>
                            {label}
                          </Label>
                          <div className="text-xs text-muted-foreground font-mono">
                            {key}
                          </div>
                        </div>
                        <input 
                          type="checkbox"
                          id={`perm-${key}`}
                          checked={isEnabled}
                          onChange={() => handleToggle(key, isEnabled)}
                          disabled={togglePermission.isPending}
                          className="w-5 h-5 rounded cursor-pointer accent-primary"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
