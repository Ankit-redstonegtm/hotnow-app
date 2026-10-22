"use client";
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { EventType } from "@ag-ui/core";
import type { ActivitySnapshot } from "@/lib/activity/types";
import { apiJson } from "@/lib/workspace";
type Connection = "connecting" | "live" | "reconnecting";
const Context = createContext<{ data: ActivitySnapshot | null; connection: Connection; workspaceId: string; refresh: () => Promise<void> }>({ data: null, connection: "connecting", workspaceId: "", refresh: async () => {} });
export const useActivity = () => useContext(Context);
export default function ActivityProvider({ children, workspaceId }: { children: ReactNode; workspaceId: string }) {
  const [data, setData] = useState<ActivitySnapshot | null>(null), [connection, setConnection] = useState<Connection>("connecting");
  const refresh = useCallback(async () => {
    try { setData(await apiJson<ActivitySnapshot>("/api/activity", { signal: AbortSignal.timeout(10000) })); } catch { setConnection("reconnecting"); }
  }, []);
  useEffect(() => {
    let closed = false, source: EventSource | undefined;
    function connect() {
      if (closed || !navigator.onLine) return;
      source?.close(); source = new EventSource("/api/activity/stream");
      source.onmessage = event => {
        if (closed || !navigator.onLine) return;
        try {
          const update = JSON.parse(event.data);
          if (update.type === EventType.STATE_SNAPSHOT && Array.isArray(update.snapshot?.items)) { setData(update.snapshot); setConnection("live"); }
          else if (update.type === EventType.CUSTOM && update.name === "connection_status") setConnection("reconnecting");
        } catch { setConnection("reconnecting"); }
      };
      source.onerror = () => { if (!closed) setConnection("reconnecting"); };
    }
    function offline() { source?.close(); setConnection("reconnecting"); }
    function online() { setConnection("connecting"); connect(); }
    const fallback = setInterval(() => { if (source?.readyState !== EventSource.OPEN && !closed && navigator.onLine) void refresh(); }, 15000);
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    if (navigator.onLine) connect(); else offline();
    return () => { closed = true; clearInterval(fallback); source?.close(); window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [refresh]);
  return <Context.Provider value={{ data, connection, refresh, workspaceId }}>{children}</Context.Provider>;
}
