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

/** The request the wizard hands the agent. Every choice is spelled out so the agent has nothing to ask. */
export function buildRecordRequest(input: RecordWizardInput): string {
  const parts = [
    `请录制自动化脚本，不要再向我确认下面这些选项，直接调用 record_playwright_scenario。`,
    `沙箱地址：${input.sandboxUrl}`,
    `用例：${input.caseId || "（不指定，按录制内容匹配）"}`,
    `录制模式：${input.mode}`,
  ];
  if (input.mode !== "ui-only") {
    parts.push(`API 脚本前置清理：${input.cleanupPre ? "是" : "否"}，后置清理：${input.cleanupPost ? "是" : "否"}`);
    parts.push(`参数：mode=${input.mode}，cleanupPre=${input.cleanupPre}，cleanupPost=${input.cleanupPost}${input.caseId ? `，caseId=${input.caseId}` : ""}`);
  } else {
    parts.push(`参数：mode=ui-only${input.caseId ? `，caseId=${input.caseId}` : ""}`);
  }
  return parts.join("\n");
}
