import { useEffect, useState, useCallback } from "react";

export type CartItem = {
  id: string;
  code: string;
  name: string;
  serial_number?: string | null;
};

const KEY = "eventasset.scan-cart";

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function useScanCart() {
  const [items, setItems] = useState<CartItem[]>(() => read());

  useEffect(() => {
    const l = () => setItems(read());
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(read());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const persist = (next: CartItem[]) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    emit();
  };

  const add = useCallback((item: CartItem) => {
    const cur = read();
    if (cur.some((x) => x.id === item.id)) return false;
    persist([...cur, item]);
    return true;
  }, []);

  const remove = useCallback((id: string) => {
    persist(read().filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => persist([]), []);

  return { items, add, remove, clear };
}
