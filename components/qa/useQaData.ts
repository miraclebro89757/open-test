"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** GET a QA endpoint and keep the result; `reload` re-reads, `post` sends a change and then re-reads. */
export function useQaData<T>(path: string, cwd: string, refreshKey: number): {
  data: T | null;
  error: string | null;
  reload: () => Promise<void>;
  post: (payload: Record<string, unknown>) => Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }>;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const reload = useCallback(async () => {
    try {
      const response = await fetch(`${path}?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store" });
      const body = (await response.json()) as T & { error?: string };
      if (!alive.current) return;
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setData(body);
      setError(null);
    } catch (loadError) {
      if (alive.current) setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [path, cwd]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, ...payload }),
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) return { ok: false as const, error: String(body.error ?? `HTTP ${response.status}`) };
      await reload();
      return { ok: true as const, body };
    } catch (postError) {
      return { ok: false as const, error: postError instanceof Error ? postError.message : String(postError) };
    }
  }, [path, cwd, reload]);

  return { data, error, reload, post };
}
