"use client";

import { useState, type ReactNode } from "react";
import type { QaPanelId } from "@/lib/qa/client";
import type { QaOverview } from "@/lib/qa/overview";
import { Badge } from "./qa-ui";

interface Props {
  overview: QaOverview | null;
  activePanel: QaPanelId | null;
  onOpenPanel: (panel: QaPanelId) => void;
}

interface Row {
  panel: QaPanelId;
  label: string;
  count: number | null;
  badges?: ReactNode;
}

/**
 * The product workspace as a test asset tree under the project list. The
 * counts are read from the files the agent wrote, so the tree needs no state
 * of its own.
 */
export function QaAssetTree({ overview, activePanel, onOpenPanel }: Props) {
  const [open, setOpen] = useState(true);
  const counts = overview?.counts;
  const pending = counts ? counts.points - counts.pointsConfirmed : 0;
  const rows: Row[] = [
    {
      panel: "reviews", label: "待审核", count: counts?.reviewPending ?? null,
      badges: counts && counts.reviewHigh > 0 ? <Badge tone="bad">高风险 {counts.reviewHigh}</Badge> : null,
    },
    { panel: "lessons", label: "审核经验", count: counts?.lessons ?? null },
    { panel: "knowledge", label: "需求知识", count: counts?.knowledge ?? null },
    { panel: "evolution", label: "版本演进", count: null },
    { panel: "graph", label: "需求图谱（节点）", count: counts?.graphNodes ?? null },
    {
      panel: "test-points", label: "测试点", count: counts?.points ?? null,
      badges: pending > 0 ? <Badge tone="warn">待确认 {pending}</Badge> : null,
    },
    {
      panel: "cases", label: "用例", count: counts?.cases ?? null,
      badges: counts && counts.cases ? <Badge tone={counts.casesAutomated ? "ok" : "muted"}>自动化 {counts.casesAutomated}/{counts.cases}</Badge> : null,
    },
    {
      panel: "automation", label: "自动化脚本", count: counts ? counts.uiScripts + counts.apiScripts : null,
      badges: counts && counts.uiScripts + counts.apiScripts ? <Badge>UI {counts.uiScripts} · API {counts.apiScripts}</Badge> : null,
    },
    { panel: "defects", label: "缺陷", count: counts?.defects ?? null },
    { panel: "report", label: "报告", count: counts?.reports ?? null },
  ];

  return (
    <div style={{ flexShrink: 0, maxHeight: "42%", display: "flex", flexDirection: "column", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", height: 30, padding: "0 6px 0 10px", gap: 4 }}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          style={{
            display: "flex", alignItems: "center", gap: 6, flex: 1, height: 26, padding: 0,
            background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", textAlign: "left",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}>
            <path d="M3 1.5l4 3.5-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontWeight: 600 }}>测试资产</span>
          {overview ? <span style={{ color: "var(--text-dim)" }} title={overview.workspace}>{overview.product}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => onOpenPanel("overview")}
          style={{
            height: 22, padding: "0 8px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
            border: "none", color: activePanel === "overview" ? "var(--text)" : "var(--text-muted)",
            background: activePanel === "overview" ? "var(--bg-selected)" : "transparent",
          }}
        >
          总览
        </button>
      </div>
      {open ? (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 6px 8px", overflowY: "auto" }}>
          {rows.map((row) => {
            const active = activePanel === row.panel;
            return (
              <li key={row.panel}>
                <button
                  type="button"
                  onClick={() => onOpenPanel(row.panel)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%", height: 28, padding: "0 8px",
                    border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12.5, textAlign: "left",
                    background: active ? "var(--bg-selected)" : "transparent",
                    color: active ? "var(--text)" : "var(--text-muted)",
                  }}
                  onMouseEnter={(event) => { if (!active) event.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(event) => { if (!active) event.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                  {row.badges}
                  <span style={{ minWidth: 16, textAlign: "right", color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                    {row.count === null ? "" : row.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
