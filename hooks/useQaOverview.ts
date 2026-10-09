"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QaOverview } from "@/lib/qa/overview";

const POLL_MS = 4000;

/**
 * The workspace overview behind the pipeline bar, asset tree and workbench.
 * The agent writes files while a session runs, so it is polled while the tab
 * is visible. `refreshKey` (bumped when an agent turn ends) and `refresh` re-read at once.
 */
export function useQaOverview(cwd: string | null, enabled: boolean, refreshKey = 0): {
  overview: QaOverview | null;
  error: string | null;
  refresh: () => void;
} {
  const [overview, setOverview] = useState<QaOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const lastJson = useRef("");

  useEffect(() => {
    lastJson.current = "";
    setOverview(null);
    setError(null);
  }, [cwd]);

  useEffect(() => {
    if (!enabled || !cwd) return;
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/api/qa/overview?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store" });
        const text = await response.text();
        if (cancelled) return;
        if (!response.ok) {
          setError((JSON.parse(text) as { error?: string }).error ?? `HTTP ${response.status}`);
          return;
        }
        // Skip identical snapshots so polling does not re-render the shell.
        if (text !== lastJson.current) {
          lastJson.current = text;
          setOverview(JSON.parse(text) as QaOverview);
        }
        setError(null);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    };
    void load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cwd, enabled, tick, refreshKey]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return { overview, error, refresh };
}
