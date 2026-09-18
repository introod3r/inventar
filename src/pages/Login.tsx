import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PackageSearch, Loader2, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
        navigate('/', { replace: true });
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess("Registracija uspešna! Možete se prijaviti.");
        setIsLogin(true);
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-linear-to-br from-primary/10 via-background to-accent/30 border-r">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
            <PackageSearch className="w-5 h-5" />
          </span>
          EventAsset
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-3xl font-bold tracking-tight">Upravljaj opremom kao profesionalac.</h1>
          <p className="text-muted-foreground">Brzo skeniranje QR/barcode oznaka, evidencija osnovnih sredstava, rezervacije za događaje, popisi i servis — sve na jednom mestu.</p>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li>• Mobile-first interfejs za magacionere</li>
            <li>• Real-time stanje opreme po lokacijama</li>
            <li>• Offline skeniranje uz kasniju sinhronizaciju</li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">© EventAsset</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="rounded-xl border bg-card text-card-foreground shadow w-full max-w-md card-elevated">
          <div className="flex flex-col space-y-1.5 p-6">
            <div className="font-semibold tracking-tight text-2xl">{isLogin ? "Dobrodošli" : "Registracija"}</div>
            <div className="text-sm text-muted-foreground">
              {isLogin ? "Prijavite se na EventAsset sistem" : "Otvorite novi nalog"}
            </div>
          </div>
          <div className="p-6 pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20 text-center">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium border border-green-500/20 text-center">
                  {success}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  placeholder="ime@firma.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none" htmlFor="password">Lozinka</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-10 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    aria-label={showPassword ? "Sakrij lozinku" : "Prikaži lozinku"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {isLogin && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="remember"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-input bg-transparent text-primary focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <label htmlFor="remember" className="ml-2 block text-sm font-medium leading-none cursor-pointer select-none">
                    Zapamti moj email
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 w-full mt-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isLogin ? "Prijavi se" : "Registruj se")}
              </button>
            </form>
            
            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">
                {isLogin ? "Nemate nalog?" : "Već imate nalog?"}
              </span>{" "}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                  setSuccess(null);
                }}
                className="font-medium text-primary hover:underline focus:outline-none"
              >
                {isLogin ? "Registruj se" : "Prijavi se"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
