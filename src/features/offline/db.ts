import Dexie, { type Table } from "dexie";

export type QueueOpType =
  | "asset_status_update"
  | "inventory_scan"
  | "asset_location_move"
  | "scan_log";

export interface QueuedOp {
  id?: number;
  type: QueueOpType;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
  // dedupe key — if set, replacing earlier op with same key
  dedupeKey?: string;
}

class OfflineDB extends Dexie {
  ops!: Table<QueuedOp, number>;

  constructor() {
    super("eventasset_offline");
    this.version(1).stores({
      ops: "++id, type, createdAt, dedupeKey",
    });
  }
}

let _db: OfflineDB | undefined;

export function getOfflineDB(): OfflineDB {
  if (typeof window === "undefined") {
    throw new Error("Offline DB is browser-only");
  }
  if (!_db) _db = new OfflineDB();
  return _db;
}
