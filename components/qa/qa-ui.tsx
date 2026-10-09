"use client";

import type { CSSProperties, ReactNode } from "react";
import type { StageStatus } from "@/lib/qa/overview";

// Status colors used across the QA views. The app themes define no semantic
// colors, so these carry a fallback that reads on light and dark backgrounds.
export const QA_COLORS = {
  ok: "var(--qa-ok, #2f9e60)",
  warn: "var(--qa-warn, #c98a1b)",
  bad: "var(--qa-bad, #d14343)",
} as const;

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: "未开始",
  in_progress: "进行中",
  failed: "有失败",
  done: "已完成",
};

export function stageColor(status: StageStatus): string {
  if (status === "done") return QA_COLORS.ok;
  if (status === "failed") return QA_COLORS.bad;
  if (status === "in_progress") return "var(--accent)";
  return "var(--text-dim)";
}

export function StageMark({ status, size = 14 }: { status: StageStatus; size?: number }) {
  const color = stageColor(status);
  const common = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true } as const;
  if (status === "done") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" fill={color} />
        <path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" fill={color} />
        <path d="M8 4.4v4.4M8 11v.1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" fill="none" stroke={color} strokeWidth="1.6" />
        <circle cx="8" cy="8" r="3" fill={color} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

export function Badge({ children, tone = "muted", title }: { children: ReactNode; tone?: "muted" | "ok" | "warn" | "bad" | "accent"; title?: string }) {
  const color = tone === "ok" ? QA_COLORS.ok
    : tone === "warn" ? QA_COLORS.warn
    : tone === "bad" ? QA_COLORS.bad
    : tone === "accent" ? "var(--accent)"
    : "var(--text-muted)";
  return (
    <span
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", height: 18, padding: "0 6px",
        borderRadius: 9, fontSize: 11, lineHeight: 1, whiteSpace: "nowrap",
        color, border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export const buttonStyle = (variant: "primary" | "plain" = "plain", disabled = false): CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  height: 28, padding: "0 10px", borderRadius: 7, fontSize: 12, cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap",
  border: variant === "primary" ? "1px solid var(--accent)" : "1px solid var(--border)",
  background: variant === "primary" ? "var(--accent)" : "var(--bg)",
  color: variant === "primary" ? "var(--accent-contrast)" : "var(--text)",
});

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12.5, lineHeight: 1.7 }}>
      <div style={{ color: "var(--text)", fontSize: 13, marginBottom: 4 }}>{title}</div>
      {hint ? <div>{hint}</div> : null}
      {children ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
