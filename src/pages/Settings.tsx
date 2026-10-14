import { useAuth } from '@/features/auth/use-auth';
import { useTheme } from '@/features/theme/use-theme';
import { User, Moon, Sun, Monitor, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { user, profile, roles, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Profil uspešno sačuvan!');
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Podešavanja</h1>
        <p className="text-muted-foreground mt-1">Upravljajte svojim nalogom i preferencama aplikacije.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Leni meni (opciono, za sada samo layouting) */}
        <div className="space-y-2 hidden md:block">
          <div className="font-semibold text-sm px-3 mb-2 text-muted-foreground">Meni</div>
          <button className="w-full text-left px-3 py-2 bg-secondary text-secondary-foreground rounded-lg font-medium text-sm">Moj Profil</button>
          <button className="w-full text-left px-3 py-2 text-muted-foreground hover:bg-secondary/50 rounded-lg font-medium text-sm transition-colors">Izgled</button>
          <button className="w-full text-left px-3 py-2 text-muted-foreground hover:bg-secondary/50 rounded-lg font-medium text-sm transition-colors">Notifikacije</button>
        </div>

        <div className="md:col-span-2 space-y-8">
          
          {/* Sekcija Profil */}
          <section className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-border flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <User size={32} />
              </div>
              <div>
                <h2 className="text-xl font-bold">{profile?.full_name || 'Korisnik'}</h2>
                <p className="text-muted-foreground">{user?.email}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full w-max">
                  <Shield size={12} />
                  {roles?.[0]?.toUpperCase() || 'KORISNIK'}
                </div>
              </div>
            </div>
            
            <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Ime i Prezime</label>
                <input 
                  type="text" 
                  defaultValue={profile?.full_name || ''}
                  className="w-full bg-secondary border border-border py-2 px-3 rounded-md focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm"
                />
              </div>
              <div className="space-y-1.5 opacity-60">
                <label className="text-sm font-medium">Email (Nije moguće menjati)</label>
                <input 
                  type="email" 
                  disabled
                  defaultValue={user?.email || ''}
                  className="w-full bg-secondary border border-border py-2 px-3 rounded-md text-sm cursor-not-allowed"
                />
              </div>
              
              <div className="pt-2 flex justify-end">
                <button type="submit" className="bg-foreground text-background px-4 py-2 rounded-lg font-medium text-sm hover:bg-foreground/90 transition-colors">
                  Sačuvaj Promene
                </button>
              </div>
            </form>
          </section>

          {/* Sekcija Izgled */}
          <section className="bg-card border border-border rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-xl font-bold">Izgled Aplikacije</h2>
              <p className="text-muted-foreground text-sm mt-1">Prilagodite temu aplikacije vašem uređaju.</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <button 
                onClick={() => setTheme('light')}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'light' ? 'border-primary bg-primary/5' : 'border-border bg-secondary/50 hover:border-primary/50'}`}
              >
                <Sun size={24} className={theme === 'light' ? 'text-primary' : 'text-muted-foreground'} />
                <span className="text-sm font-medium">Svetla</span>
              </button>
              
              <button 
                onClick={() => setTheme('dark')}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border bg-secondary/50 hover:border-primary/50'}`}
              >
                <Moon size={24} className={theme === 'dark' ? 'text-primary' : 'text-muted-foreground'} />
                <span className="text-sm font-medium">Tamna</span>
              </button>

              <button 
                onClick={() => setTheme('system')}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${theme === 'system' ? 'border-primary bg-primary/5' : 'border-border bg-secondary/50 hover:border-primary/50'}`}
              >
                <Monitor size={24} className={theme === 'system' ? 'text-primary' : 'text-muted-foreground'} />
                <span className="text-sm font-medium">Sistem</span>
              </button>
            </div>
          </section>
          
          <section className="bg-card border border-border rounded-2xl p-6 space-y-6">
             <div>
              <h2 className="text-xl font-bold text-destructive">Opasna Zona</h2>
              <p className="text-muted-foreground text-sm mt-1">Odjavljivanje iz sistema.</p>
            </div>
            
            <button 
              onClick={() => signOut()}
              className="w-full bg-destructive/10 text-destructive border border-destructive/20 px-4 py-3 rounded-xl font-semibold hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              Odjavi se (Log Out)
            </button>
          </section>

        </div>
      </div>
    </div>
  );
}
