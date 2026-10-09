"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_QA_MODE, QA_MODE_KEY, parseQaMode, type QaMode } from "@/lib/qa/client";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === QA_MODE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): QaMode {
  try {
    return parseQaMode(window.localStorage.getItem(QA_MODE_KEY));
  } catch {
    return DEFAULT_QA_MODE;
  }
}

/**
 * Test mode (default) or developer mode. The choice is remembered per browser;
 * server render and first paint use the default, then follow the stored value.
 */
export function useQaMode(): [QaMode, (mode: QaMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_QA_MODE);
  const setMode = useCallback((next: QaMode) => {
    try {
      window.localStorage.setItem(QA_MODE_KEY, next);
    } catch {
      // Storage is best effort; the switch still applies for this page.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [mode, setMode];
}
