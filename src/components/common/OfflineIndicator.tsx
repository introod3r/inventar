import { useState } from "react";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useOfflineStatus } from "@/features/offline/use-offline-status";
import { syncQueue } from "@/features/offline/queue";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function OfflineIndicator() {
  const { online, pending } = useOfflineStatus();
  const [syncing, setSyncing] = useState(false);

  if (online && pending === 0) return null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { ok, failed } = await syncQueue();
      if (ok > 0) toast.success(`Sinhronizovano ${ok} izmena`);
      if (failed > 0) toast.error(`Neuspešno ${failed} izmena`);
      if (ok === 0 && failed === 0) toast.info("Nema izmena za sinhronizaciju");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      className={`sticky top-0 z-30 flex items-center gap-3 px-4 py-2 text-sm border-b ${
        online
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
          : "bg-destructive/10 text-destructive border-destructive/30"
      }`}
      role="status"
    >
      {online ? (
        <Wifi className="h-4 w-4 shrink-0" />
      ) : (
        <CloudOff className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1 truncate">
        {online
          ? `Sinhronizacija: ${pending} ${pending === 1 ? "izmena čeka" : "izmena čeka"}`
          : "Niste povezani — izmene se čuvaju lokalno"}
      </span>
      {online && pending > 0 && (
        <Button size="sm" variant="ghost" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? "animate-spin" : ""}`} />
          Sinhronizuj
        </Button>
      )}
    </div>
  );
}
