// Client-safe pieces of the QA workbench: no node imports, so components can use them.

export type QaMode = "test" | "dev";
export const QA_MODE_KEY = "opentest-mode";
export const DEFAULT_QA_MODE: QaMode = "test";

export function parseQaMode(value: string | null | undefined): QaMode {
  return value === "dev" || value === "test" ? value : DEFAULT_QA_MODE;
}

export type QaPanelId =
  | "overview"
  | "knowledge"
  | "graph"
  | "test-points"
  | "cases"
  | "automation"
  | "record"
  | "run"
  | "heal"
  | "defects"
  | "report";

export const QA_PANEL_TITLES: Record<QaPanelId, string> = {
  overview: "总览",
  knowledge: "需求知识",
  graph: "需求图谱",
  "test-points": "测试点",
  cases: "用例",
  automation: "自动化脚本",
  record: "录制",
  run: "执行",
  heal: "自愈",
  defects: "缺陷",
  report: "报告",
};

/** The tab id of the workbench in the right panel. */
export const QA_TAB_ID = "qa:workbench";

/** What a panel button asks the agent to do. `send` submits at once; `compose` leaves it in the input box to finish. */
export interface QaAgentRequest {
  text: string;
  mode: "send" | "compose";
}

export type QaAskAgent = (request: QaAgentRequest) => "sent" | "composed" | "unavailable";

/** What the page sends so the agent reads the file instead of a pasted copy. */
export function clarificationSubmitText(files: string[]): string {
  const list = files.length ? files.join("、") : "knowledge/需求评审.md";
  return [
    `请阅读 ${list} 里的待澄清条目，按每条的状态继续。不要删除条目，也不要改写测试人员已经标过的状态和补充。`,
    "忽略：这是理解错误，不要再提起，也不要据此写测试。",
    "已补充：以该条「补充」里的说法为准，不要再用原来的理解。",
    "待讨论：先搁置，不要编造结论，依赖它的用例先不写。其余部分可以继续。",
    "待处理：还没有人看，先不要当成已经确认。",
  ].join("\n");
}

export const STAGE_REQUESTS: Record<string, QaAgentRequest> = {
  analysis: {
    mode: "compose",
    text: "请分析这份需求文档，按 opentest-qa 技能写需求知识和图谱：@\n写完一节就把这一节的待澄清追加到 knowledge/需求评审.md，然后停下等我标记。不要删除我已经标成忽略、已补充或待讨论的条目。",
  },
  "test-points": {
    mode: "send",
    text: "根据需求图谱为当前产品写测试点。按功能分批，每个测试点用 ### TP编号 标题，并写优先级和状态：待确认。写完一个功能就停下，等我确认。",
  },
  cases: {
    mode: "send",
    text: "测试点已经确认。请为已确认的测试点写功能用例，每条包含编号、标题、优先级、自动化、前置条件、步骤、期望结果，新用例的自动化写成否。待澄清里标成忽略的不要写，已补充的按补充来写，待讨论的先不写。",
  },
  record: { mode: "compose", text: "为用例录制自动化脚本。用例编号：   沙箱地址：" },
  run: { mode: "send", text: "运行 automation 目录里的自动化脚本，选择器失效时自愈，然后汇报每条用例的结果。" },
  heal: { mode: "send", text: "看最近一次执行里失败的 UI 脚本。如果是选择器失效，用 heal_selector 修复，再重新运行这个脚本，告诉我改了哪些选择器。" },
  defects: { mode: "send", text: "读取禅道或 Jira 的缺陷，写入 defects 目录。没有配置就告诉我缺哪些环境变量。" },
  report: { mode: "send", text: "根据已经写好的用例和缺陷写测试简报。不要编造通过率。" },
};
