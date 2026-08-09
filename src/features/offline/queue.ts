import { supabase } from "@/integrations/supabase/client";
import { getOfflineDB, type QueuedOp, type QueueOpType } from "./db";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

export function subscribeQueue(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export async function queueSize(): Promise<number> {
  if (typeof window === "undefined") return 0;
  return getOfflineDB().ops.count();
}

export async function listQueue(): Promise<QueuedOp[]> {
  return getOfflineDB().ops.orderBy("createdAt").toArray();
}

export async function enqueue(
  type: QueueOpType,
  payload: Record<string, unknown>,
  opts: { dedupeKey?: string } = {},
): Promise<number> {
  const db = getOfflineDB();
  if (opts.dedupeKey) {
    const existing = await db.ops.where("dedupeKey").equals(opts.dedupeKey).first();
    if (existing?.id !== undefined) {
      await db.ops.update(existing.id, {
        payload,
        createdAt: Date.now(),
        attempts: 0,
        lastError: undefined,
      });
      notify();
      return existing.id;
    }
  }
  const id = await db.ops.add({
    type,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    dedupeKey: opts.dedupeKey,
  });
  notify();
  return id as number;
}

export async function clearQueue() {
  await getOfflineDB().ops.clear();
  notify();
}

async function runOp(op: QueuedOp): Promise<void> {
  switch (op.type) {
    case "asset_status_update": {
      const { assetId, status, locationId } = op.payload as {
        assetId: string;
        status: string;
        locationId?: string | null;
      };
      const patch =
        locationId !== undefined
          ? { status: status as never, current_location_id: locationId }
          : { status: status as never };
      const { error } = await supabase.from("assets").update(patch).eq("id", assetId);
      if (error) throw error;
      return;
    }
    case "asset_location_move": {
      const { assetId, locationId } = op.payload as {
        assetId: string;
        locationId: string | null;
      };
      const { error } = await supabase
        .from("assets")
        .update({ current_location_id: locationId })
        .eq("id", assetId);
      if (error) throw error;
      return;
    }
    case "inventory_scan": {
      const { inventoryId, assetId, countedQty } = op.payload as {
        inventoryId: string;
        assetId: string;
        countedQty: number;
      };
      const { data: existing, error: selErr } = await supabase
        .from("inventory_lines")
        .select("id, counted_qty")
        .eq("inventory_id", inventoryId)
        .eq("asset_id", assetId)
        .maybeSingle();
      if (selErr) throw selErr;
      if (existing) {
        const { error } = await supabase
          .from("inventory_lines")
          .update({
            counted_qty: countedQty,
            scanned_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory_lines").insert({
          inventory_id: inventoryId,
          asset_id: assetId,
          counted_qty: countedQty,
          scanned_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      return;
    }
    case "scan_log": {
      // best-effort log only; no server-side table needed
      return;
    }
    default:
      throw new Error(`Unknown op type: ${op.type}`);
  }
}

let syncing = false;

export async function syncQueue(): Promise<{ ok: number; failed: number }> {
  if (typeof window === "undefined") return { ok: 0, failed: 0 };
  if (syncing) return { ok: 0, failed: 0 };
  if (!navigator.onLine) return { ok: 0, failed: 0 };
  syncing = true;
  let ok = 0;
  let failed = 0;
  try {
    const db = getOfflineDB();
    const ops = await db.ops.orderBy("createdAt").toArray();
    for (const op of ops) {
      try {
        await runOp(op);
        if (op.id !== undefined) await db.ops.delete(op.id);
        ok++;
      } catch (e) {
        failed++;
        if (op.id !== undefined) {
          await db.ops.update(op.id, {
            attempts: (op.attempts ?? 0) + 1,
            lastError: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
    notify();
  } finally {
    syncing = false;
  }
  return { ok, failed };
}
