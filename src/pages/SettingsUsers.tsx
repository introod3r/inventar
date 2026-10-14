import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/features/rbac/permissions";
import { useAuth, type AppRole } from "@/features/auth/use-auth";
import { toast } from "sonner";
import { Trash2, ShieldCheck, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";

const ROLES = Object.keys(ROLE_LABELS) as AppRole[];

export default function SettingsUsers() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();

  const { data: profilesData } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, avatar_url").order("full_name")).data ?? [],
  });

  const { user } = useAuth();
  
  // Ensure the current user is always in the list even if RLS blocks the query or profile is missing
  const profiles = [...(profilesData ?? [])];
  if (user && !profiles.some(p => p.id === user.id)) {
    profiles.unshift({
      id: user.id,
      full_name: user.email?.split("@")[0] || "Trenutni korisnik",
      avatar_url: null,
    });
  }
  const { data: allRoles } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("*")).data ?? [],
  });

  const addRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Uloga dodata"); qc.invalidateQueries({ queryKey: ["all-roles"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const removeRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-roles"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  if (!hasRole("admin")) return <PageContainer><div className="p-8">Nemaš dozvolu za pristup.</div></PageContainer>;

  return (
    <PageContainer>
      <PageHeader 
        title="Upravljanje korisnicima" 
        description="Dodeljivanje uloga i nivoa pristupa registrovanim korisnicima" 
      />
      <div className="grid gap-4">
        {profiles?.map((p) => {
          const userRoles = allRoles?.filter((r) => r.user_id === p.id) ?? [];
          const available = ROLES.filter((r) => !userRoles.some((ur) => ur.role === r));
          const isAdmin = userRoles.some(ur => ur.role === 'admin');

          return (
            <Card key={p.id} className={`card-elevated overflow-hidden ${isAdmin ? 'border-primary/50' : ''}`}>
              <div className="p-5 flex flex-col md:flex-row gap-5 items-start md:items-center">
                
                {/* User Info */}
                <div className="flex items-center gap-4 min-w-60">
                  <Avatar className="h-12 w-12 border shadow-sm">
                    <AvatarImage src={p.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {initials(p.full_name || "Korisnik")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold text-base flex items-center gap-1.5">
                      {p.full_name || "Nepoznati korisnik"}
                      {isAdmin && <ShieldCheck className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <User className="h-3 w-3" /> ID: {p.id.substring(0, 8)}...
                    </div>
                  </div>
                </div>

                {/* Roles & Permissions */}
                <div className="flex-1 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                    Aktivne uloge i dozvole
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {userRoles.map((r) => (
                      <Badge 
                        key={r.id} 
                        variant={r.role === 'admin' ? 'default' : 'secondary'}
                        className="pl-2 pr-1 py-1 h-auto flex items-center gap-1.5"
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="font-semibold text-[11px] leading-tight">
                            {ROLE_LABELS[r.role as AppRole]}
                          </span>
                          <span className="text-[9px] opacity-70 leading-tight font-normal hidden sm:block">
                            {ROLE_DESCRIPTIONS[r.role as AppRole]}
                          </span>
                        </div>
                        {!(r.role === 'admin' && p.id === user?.id) && (
                          <button 
                            onClick={() => removeRole.mutate(r.id)} 
                            className="ml-1 p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
                            title="Ukloni ulogu"
                          >
                            <Trash2 className="h-3.5 w-3.5 opacity-70 hover:opacity-100 text-destructive" />
                          </button>
                        )}
                      </Badge>
                    ))}
                    {!userRoles.length && (
                      <span className="text-sm text-muted-foreground italic bg-muted/50 px-3 py-1.5 rounded-md border">
                        Korisnik nema dodeljene uloge
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {available.length > 0 && (
                  <div className="shrink-0 pt-2 md:pt-0 w-full md:w-55">
                    <Select onValueChange={(v) => addRole.mutate({ user_id: p.id, role: v as AppRole })}>
                      <SelectTrigger className="w-full bg-background">
                        <SelectValue placeholder="+ Dodaj ulogu..." />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((r) => (
                          <SelectItem key={r} value={r}>
                            <div className="flex flex-col items-start">
                              <span className="font-medium">{ROLE_LABELS[r]}</span>
                              <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
              </div>
            </Card>
          );
        })}
        {profiles?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground border rounded-lg">
            Nema registrovanih korisnika.
          </div>
        )}
      </div>
    </PageContainer>
  );
}
