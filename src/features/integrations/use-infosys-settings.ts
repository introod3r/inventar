import { useState, useCallback, useMemo } from "react";
import type { InfosysConfig, InfosysModuleId, InfosysSyncLogItem } from "@/lib/integrations/infosys/types";
import { InfosysApiClient } from "@/lib/integrations/infosys/client";

const STORAGE_KEY = "inventar_infosys_config_v1";
const LOGS_STORAGE_KEY = "inventar_infosys_logs_v1";

export const DEFAULT_INFOSYS_CONFIG: InfosysConfig = {
  enabled: true,
  serverUrl: "http://192.168.1.50:8080",
  apiKey: "is_live_sec_9941a021bf9c",
  databaseId: "INFOSYS_2026",
  activeModules: ["OS", "FIN_KD", "ROB", "IMP_TXT"],
  autoSync: false,
  autoSyncIntervalHours: 6,
  lastSyncAt: null,
  lastSyncStatus: "idle",
  lastSyncMessage: "Integracija spremna za rad",
  isMockMode: true, // Default to mock mode so user can test seamlessly immediately
};

export function useInfosysSettings() {
  const [config, setConfig] = useState<InfosysConfig>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_INFOSYS_CONFIG, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Error reading InfoSys config:", e);
    }
    return DEFAULT_INFOSYS_CONFIG;
  });

  const [logs, setLogs] = useState<InfosysSyncLogItem[]>(() => {
    try {
      const stored = localStorage.getItem(LOGS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error("Error reading InfoSys logs:", e);
    }
    return [
      {
        id: "log-init-1",
        timestamp: new Date().toISOString(),
        module: "OS",
        direction: "INBOUND",
        title: "Priprema integracije",
        status: "success",
        details: "Inicijalizovan InfoSys API klijent modul.",
        itemsCount: 0,
      },
    ];
  });

  const saveConfig = useCallback((newConfig: InfosysConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch (e) {
      console.error("Failed to persist InfoSys config:", e);
    }
  }, []);

  const updateConfig = useCallback((partial: Partial<InfosysConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to persist InfoSys config:", e);
      }
      return next;
    });
  }, []);

  const toggleModule = useCallback((modId: InfosysModuleId) => {
    setConfig((prev) => {
      const has = prev.activeModules.includes(modId);
      const nextMods = has
        ? prev.activeModules.filter((m) => m !== modId)
        : [...prev.activeModules, modId];
      const next = { ...prev, activeModules: nextMods };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, []);

  const addLog = useCallback((log: Omit<InfosysSyncLogItem, "id" | "timestamp">) => {
    const newItem: InfosysSyncLogItem = {
      ...log,
      id: "log-" + Math.random().toString(36).slice(2, 9),
      timestamp: new Date().toISOString(),
    };
    setLogs((prev) => {
      const next = [newItem, ...prev].slice(0, 50); // keep last 50
      try {
        localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    try {
      localStorage.removeItem(LOGS_STORAGE_KEY);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const client = useMemo(() => new InfosysApiClient(config), [config]);

  const isConfigured = Boolean(config.serverUrl && config.apiKey && config.enabled);

  return {
    config,
    saveConfig,
    updateConfig,
    toggleModule,
    client,
    isConfigured,
    logs,
    addLog,
    clearLogs,
  };
}
