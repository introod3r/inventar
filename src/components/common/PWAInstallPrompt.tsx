import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if app is already installed or if user dismissed it recently
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }
    
    if (localStorage.getItem('pwa_prompt_dismissed') === 'true') {
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Update UI to notify the user they can add to home screen
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      toast.success('Aplikacija je uspešno instalirana!');
    }
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-card border border-border shadow-lg p-4 rounded-xl z-50 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-5">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-foreground truncate">Instaliraj aplikaciju</span>
        <span className="text-xs text-muted-foreground truncate">Dodaj na početni ekran za lakši pristup</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" onClick={handleInstallClick} className="px-3">
          <Download className="h-4 w-4 mr-1.5" /> Instaliraj
        </Button>
        <Button size="icon" variant="ghost" onClick={handleDismiss} className="h-8 w-8 text-muted-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
