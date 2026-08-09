import { useState, useEffect } from 'react';
import { CloudOff, CloudSync, CheckCircle2 } from 'lucide-react';
import { subscribeQueue, queueSize, syncQueue } from '@/features/offline/queue';
import { useOfflineStatus } from '@/features/offline/use-offline-status';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function SyncIndicator() {
  const isOffline = useOfflineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const updateSize = async () => setPendingCount(await queueSize());
    updateSize();
    return subscribeQueue(updateSize);
  }, []);

  useEffect(() => {
    if (!isOffline && pendingCount > 0 && !syncing) {
      setSyncing(true);
      syncQueue().finally(() => {
        setSyncing(false);
      });
    }
  }, [isOffline, pendingCount, syncing]);

  if (isOffline) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs font-medium">
            <CloudOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Van mreže</span>
            {pendingCount > 0 && <span className="ml-1 bg-destructive text-destructive-foreground px-1.5 rounded-full text-[10px]">{pendingCount}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent>Aplikacija radi u offline režimu.</TooltipContent>
      </Tooltip>
    );
  }

  if (syncing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
            <CloudSync className="h-3.5 w-3.5 animate-spin" />
            <span className="hidden sm:inline">Sinhronizacija...</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Slanje podataka na server</TooltipContent>
      </Tooltip>
    );
  }

  if (pendingCount > 0) {
    // Should sync automatically, but just in case
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button 
            onClick={() => {
              setSyncing(true);
              syncQueue().finally(() => setSyncing(false));
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-colors"
          >
            <CloudSync className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Čeka sinhronizaciju</span>
            <span className="ml-1 bg-warning text-warning-foreground px-1.5 rounded-full text-[10px]">{pendingCount}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Kliknite za ručnu sinhronizaciju</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 px-2 py-1 text-muted-foreground text-xs font-medium opacity-50 hover:opacity-100 transition-opacity">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sinhronizovano</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>Svi podaci su sačuvani</TooltipContent>
    </Tooltip>
  );
}
