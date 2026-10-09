"use client";

import type { QaMode } from "@/lib/qa/client";

const OPTIONS: Array<{ mode: QaMode; label: string; hint: string }> = [
  { mode: "test", label: "测试", hint: "测试工作台：需求、测试点、用例、录制、执行、缺陷、报告" },
  { mode: "dev", label: "开发", hint: "Pi Web 原有界面，面向写代码和调脚本" },
];

/** Switches between the SDET workbench and the plain Pi Web layout. The session stays open. */
export function QaModeSwitch({ mode, onChange }: { mode: QaMode; onChange: (mode: QaMode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="界面模式"
      style={{
        display: "flex", margin: "8px 8px 0", padding: 2, gap: 2, flexShrink: 0,
        borderRadius: 9, background: "var(--bg-selected)",
      }}
    >
      {OPTIONS.map((option) => {
        const active = option.mode === mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.mode)}
            style={{
              flex: 1, height: 26, border: "none", borderRadius: 7, fontSize: 12.5, cursor: "pointer",
              background: active ? "var(--bg)" : "transparent",
              color: active ? "var(--text)" : "var(--text-muted)",
              fontWeight: active ? 600 : 400,
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            {option.label}模式
          </button>
        );
      })}
    </div>
  );
}
