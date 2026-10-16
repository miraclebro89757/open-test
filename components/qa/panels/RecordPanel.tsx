"use client";

import { useEffect, useState } from "react";
import type { QaAskAgent } from "@/lib/qa/client";
import { buildRecordRequest, isHttpUrl, type Recording, type RecordMode, type SandboxInfo } from "@/lib/qa/record-request";
import { Badge, EmptyState, QA_COLORS, buttonStyle, formatTime } from "../qa-ui";
import { useAskFeedback } from "../useAskFeedback";
import { useQaData } from "../useQaData";

interface Props {
  cwd: string;
  refreshKey: number;
  onAskAgent: QaAskAgent;
  onOpenFile: (absolutePath: string) => void;
  onChanged: () => void;
}

interface RecordData {
  sandbox: SandboxInfo;
  cases: Array<{ id: string; title: string }>;
  recordings: Recording[];
}

const MODES: Array<{ mode: RecordMode; label: string; hint: string }> = [
  { mode: "ui+api", label: "UI + API", hint: "录 Playwright 脚本，同时抓 HAR 生成 pytest" },
  { mode: "ui-only", label: "仅 UI", hint: "只生成 Playwright 脚本" },
  { mode: "api-only", label: "仅 API", hint: "只抓 HAR 生成 pytest，不保留 UI 脚本" },
];

const SOURCE_TEXT: Record<SandboxInfo["source"], string> = {
  environment: "来自环境变量 OPENTEST_SANDBOX_URL",
  config: "来自项目里的 opentest.sandbox.json",
  none: "还没有配置沙箱地址",
};

const fieldStyle = { height: 28, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, padding: "0 8px" } as const;
const labelStyle = { display: "grid", gap: 4, fontSize: 12, color: "var(--text-muted)" } as const;

/** The recording wizard: pick the case and the mode, then the agent opens the Playwright window. */
export function RecordPanel({ cwd, refreshKey, onAskAgent, onOpenFile, onChanged }: Props) {
  const { data, error, reload, post } = useQaData<RecordData>("/api/qa/record", cwd, refreshKey);
  const { ask, feedback } = useAskFeedback(onAskAgent);
  const [url, setUrl] = useState<string | null>(null);
  const [caseId, setCaseId] = useState("");
  const [mode, setMode] = useState<RecordMode>("ui+api");
  const [cleanupPre, setCleanupPre] = useState(true);
  const [cleanupPost, setCleanupPost] = useState(true);
  const [saveDefault, setSaveDefault] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // A recording lands after the window closes, so look again now and then.
  useEffect(() => {
    const timer = setInterval(() => { void reload(); }, 5000);
    return () => clearInterval(timer);
  }, [reload]);

  if (error) return <EmptyState title="读取录制信息失败" hint={error} />;
  if (!data) return <EmptyState title="读取中…" />;

  const address = (url ?? data.sandbox.url).trim();
  const valid = isHttpUrl(address);
  const absolute = (relative: string) => `${cwd.replace(/\/+$/, "")}/${relative}`;

  const start = async () => {
    setMessage(null);
    if (saveDefault && address !== data.sandbox.url) {
      const saved = await post({ sandboxUrl: address });
      if (!saved.ok) {
        setMessage(saved.error);
        return;
      }
    }
    ask({ mode: "send", text: buildRecordRequest({ sandboxUrl: address, caseId, mode, cleanupPre, cleanupPost }) });
    onChanged();
  };

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <section aria-label="录制向导" style={{ padding: "12px", display: "grid", gap: 10, borderBottom: "1px solid var(--border)" }}>
        <label style={labelStyle}>
          沙箱地址
          <input
            value={url ?? data.sandbox.url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://sandbox.example.com"
            aria-invalid={address.length > 0 && !valid}
            style={{ ...fieldStyle, borderColor: address && !valid ? QA_COLORS.bad : "var(--border)" }}
          />
          <span style={{ fontSize: 11, color: address && !valid ? QA_COLORS.bad : "var(--text-dim)" }}>
            {address && !valid ? "要以 http:// 或 https:// 开头" : SOURCE_TEXT[data.sandbox.source]}
          </span>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
          <input type="checkbox" checked={saveDefault} onChange={(event) => setSaveDefault(event.target.checked)} />
          保存为这个项目的默认沙箱地址
        </label>

        <label style={labelStyle}>
          用例
          <select value={caseId} onChange={(event) => setCaseId(event.target.value)} style={fieldStyle}>
            <option value="">不指定，按录制内容匹配</option>
            {data.cases.map((item) => <option key={item.id} value={item.id}>{item.id} {item.title}</option>)}
          </select>
          {data.cases.length === 0 ? <span style={{ fontSize: 11, color: "var(--text-dim)" }}>没有未自动化的用例。</span> : null}
        </label>

        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
          <legend style={{ fontSize: 12, color: "var(--text-muted)", padding: 0, marginBottom: 4 }}>录制模式</legend>
          <div role="radiogroup" aria-label="录制模式" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MODES.map((option) => (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={mode === option.mode}
                title={option.hint}
                onClick={() => setMode(option.mode)}
                style={{ ...buttonStyle(mode === option.mode ? "primary" : "plain"), height: 26 }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{MODES.find((option) => option.mode === mode)?.hint}</span>
        </fieldset>

        <fieldset disabled={mode === "ui-only"} style={{ border: "none", margin: 0, padding: 0, display: "flex", gap: 14, flexWrap: "wrap", opacity: mode === "ui-only" ? 0.45 : 1 }}>
          <legend style={{ fontSize: 12, color: "var(--text-muted)", padding: 0, marginBottom: 4 }}>API 脚本的数据清理</legend>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={cleanupPre} onChange={(event) => setCleanupPre(event.target.checked)} />测试前清理
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={cleanupPost} onChange={(event) => setCleanupPost(event.target.checked)} />测试后清理
          </label>
        </fieldset>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={!valid} style={buttonStyle("primary", !valid)} onClick={() => void start()}>开始录制</button>
          {feedback ? <span role="status" style={{ fontSize: 12, color: "var(--text-muted)" }}>{feedback}</span> : null}
          {message ? <span role="alert" style={{ fontSize: 12, color: QA_COLORS.bad }}>{message}</span> : null}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
          浏览器在这台电脑上只打开一次。先登录，再在控制页连续录多条核心流程，全部录完再关闭。每条脚本按用例编号和标题命名，并写回对应用例。
        </div>
      </section>

      <section aria-label="已有录制">
        <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>已有录制 {data.recordings.length}</div>
        {data.recordings.length === 0 ? <EmptyState title="还没有录制" hint="录完后，这里会列出脚本和 HAR 分析结果。" /> : null}
        {data.recordings.map((recording) => {
          const expanded = open === recording.id;
          const analysis = recording.analysis;
          return (
            <div key={recording.id} style={{ borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : recording.id)}
                aria-expanded={expanded}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 12.5, textAlign: "left" }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recording.caseId}</span>
                {recording.ui ? <Badge tone="accent">UI</Badge> : null}
                {recording.api ? <Badge tone="ok">API</Badge> : null}
                {analysis ? <Badge tone={analysis.source === "ai" ? "ok" : "warn"} title={analysis.source === "ai" ? "变量和依赖由模型分析" : "没有配置模型，变量和依赖只是规则估计，需要人工复核"}>{analysis.source === "ai" ? "AI 分析" : analysis.source === "rules" ? "规则引擎" : "分析"}</Badge> : null}
                <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{recording.recordedAt ? formatTime(recording.recordedAt) : ""}</span>
              </button>
              {expanded ? (
                <div style={{ padding: "0 12px 12px 12px", display: "grid", gap: 8, fontSize: 12 }}>
                  {analysis ? (
                    <>
                      <div style={{ color: "var(--text-muted)" }}>
                        {analysis.requests} 个请求，{analysis.endpoints} 个接口，{analysis.variables.length} 个变量，{analysis.dependencies.length} 条依赖
                      </div>
                      {analysis.source !== "ai" ? (
                        <div style={{ color: QA_COLORS.warn }}>这次没有用模型分析。变量和依赖只是粗略估计，打开脚本核对后再用。</div>
                      ) : null}
                      {analysis.variables.length ? (
                        <div>
                          <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>提取的变量</div>
                          {analysis.variables.map((variable) => (
                            <div key={variable.name}><code>{variable.name}</code> <span style={{ color: "var(--text-dim)" }}>{variable.type} · 用在 {variable.usedIn} 个请求</span></div>
                          ))}
                        </div>
                      ) : null}
                      {analysis.dependencies.length ? (
                        <div>
                          <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>请求依赖</div>
                          {analysis.dependencies.map((dependency) => (
                            <div key={`${dependency.from}-${dependency.to}-${dependency.variable}`}>第 {dependency.from + 1} 步 → 第 {dependency.to + 1} 步 <code>{dependency.variable}</code></div>
                          ))}
                        </div>
                      ) : null}
                      {analysis.sensitive.length ? (
                        <div>
                          <div style={{ color: QA_COLORS.warn, marginBottom: 2 }}>检测到敏感数据，值要放进 .env，不要写进脚本</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {analysis.sensitive.map((item) => <Badge key={item.category} tone="warn">{item.category} ×{item.count}</Badge>)}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div style={{ color: "var(--text-dim)" }}>{recording.api || recording.har ? "没有找到 HAR 分析结果。" : "这次只录了 UI，没有 API 分析。"}</div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {([["UI 脚本", recording.ui], ["API 脚本", recording.api], [".env.example", recording.env], ["说明", recording.readme], ["HAR", recording.har]] as const)
                      .filter(([, file]) => file)
                      .map(([label, file]) => (
                        <button key={file} type="button" style={{ ...buttonStyle(), height: 24, padding: "0 8px" }} title={file} onClick={() => onOpenFile(absolute(file))}>{label}</button>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </section>
    </div>
  );
}
