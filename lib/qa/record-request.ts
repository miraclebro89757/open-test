// Client-safe half of the recording wizard: types and the request text, no node imports.

export interface SandboxInfo {
  /** The address the recording would open, or "" when none is set. */
  url: string;
  source: "environment" | "config" | "none";
}

export interface AnalysisVariable {
  name: string;
  type: string;
  usedIn: number;
}

export interface AnalysisView {
  /** Who found the variables: the model, or the rules used when none is configured. */
  source: "ai" | "rules" | "unknown";
  requests: number;
  endpoints: number;
  variables: AnalysisVariable[];
  dependencies: Array<{ from: number; to: number; variable: string }>;
  /** Categories only. The values never leave the HAR. */
  sensitive: Array<{ category: string; count: number }>;
  recommendations: string[];
}

export interface Recording {
  id: string;
  caseId: string;
  recordedAt: string;
  /** Files relative to the workspace; "" when the mode did not produce one. */
  ui: string;
  api: string;
  har: string;
  env: string;
  readme: string;
  analysis: AnalysisView | null;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type RecordMode = "ui+api" | "ui-only" | "api-only";

export interface RecordWizardInput {
  sandboxUrl: string;
  caseId: string;
  mode: RecordMode;
  cleanupPre: boolean;
  cleanupPost: boolean;
}

/** The request the wizard hands the agent. UI capture only; API recording is refused. */
export function buildRecordRequest(input: RecordWizardInput): string {
  if (input.mode === "api-only") return "API 录制还没有做。这次不要调用录制工具。";
  const parts = [
    "请做 Playwright UI 录制采集，不要再向我确认下面这些选项，直接调用 record_playwright_scenario。不要生成 Playwright 脚本或 pytest。",
    `沙箱地址：${input.sandboxUrl}`,
    `用例：${input.caseId || "（不指定，控制页列出需要 Playwright 录制的用例）"}`,
    "每一段写入 recordings/，不要把用例标成自动化：是。",
  ];
  if (input.caseId) parts.push(`参数：caseId=${input.caseId}`);
  return parts.join("\n");
}
