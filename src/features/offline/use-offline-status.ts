import { useEffect, useState } from "react";
import { queueSize, subscribeQueue, syncQueue } from "./queue";

export function useOfflineStatus() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateOnline = () => setOnline(navigator.onLine);
    const refresh = () => {
      queueSize().then(setPending).catch(() => {});
    };

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const unsub = subscribeQueue(refresh);
    refresh();

    // try sync periodically when online
    const tick = setInterval(() => {
      if (navigator.onLine) {
        syncQueue()
          .then(() => refresh())
          .catch(() => {});
      }
    }, 15000);

    // sync immediately when we come back online
    const onOnline = () => {
      syncQueue()
        .then(() => refresh())
        .catch(() => {});
    };
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("online", onOnline);
      clearInterval(tick);
      unsub();
    };
  }, []);

  return { online, pending };
}
