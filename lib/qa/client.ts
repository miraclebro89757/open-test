// Client-safe pieces of the QA workbench: no node imports, so components can use them.

import { CASE_TEMPLATE_RULE } from "./case-format";

export type QaPanelId =
  | "overview"
  | "knowledge"
  | "evolution"
  | "graph"
  | "test-points"
  | "cases"
  | "automation"
  | "record"
  | "run"
  | "defects"
  | "report"
  | "reviews"
  | "lessons";

export const QA_PANEL_TITLES: Record<QaPanelId, string> = {
  overview: "总览",
  knowledge: "需求知识",
  evolution: "版本演进",
  graph: "需求图谱",
  "test-points": "测试点",
  cases: "用例",
  automation: "自动化脚本",
  record: "录制",
  run: "执行",
  defects: "缺陷",
  report: "报告",
  reviews: "待审核",
  lessons: "审核经验",
};

export type WorkPolicy = "guided" | "balanced" | "autonomous";

export const WORK_POLICY_LABEL: Record<WorkPolicy, string> = {
  guided: "逐步引导",
  balanced: "智能协作",
  autonomous: "自主执行",
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
    "已完成的测试点和用例不要重做。被这些条目挡住的功能，以及当前需求版本图谱里还没有测试点或用例的功能，按标记补测试点和用例草稿。写完后调用 sync_case_sheet 推到钉钉表格。不要问要不要继续。不要开始录制或跑共享环境。",
    CASE_TEMPLATE_RULE,
  ].join("\n");
}

export function clarificationContinueRequest(files: string[]): QaAgentRequest {
  return { mode: "send", text: clarificationSubmitText(files) };
}

export function analysisFromPackRequest(): QaAgentRequest {
  return {
    mode: "send",
    text: "knowledge/source-pack/ 里已经有钉钉需求源包。请按 opentest-qa 读 manifest.json 和 docs/ 里的 Markdown，按节写图谱和待澄清。不要再去钉钉拉正文。这一节有图时先调用 read_requirement_figures，用当时有效的图地址连同正文一起看，图没读完不要写这一节图谱。图和正文不一致就写成待澄清，两边都留下，不要选一边。不要用 replace 覆盖已有图谱。",
  };
}

export const STAGE_REQUESTS: Record<string, QaAgentRequest> = {
  analysis: {
    mode: "compose",
    text: "请分析这份需求文档，按 opentest-qa 技能写需求知识和图谱：@\n写完一节就把这一节的待澄清追加到 knowledge/需求评审.md，然后停下等我标记。不要删除我已经标成忽略、已补充或待讨论的条目。",
  },
  "test-points": {
    mode: "send",
    text: "根据需求图谱为当前产品写测试点。按功能分批，每个测试点用 ### TP编号 标题，并写优先级和状态：待确认。写完一个功能就用 task_checkpoint complete。标准审核没通过就先改再 complete，不要带着问题开始下一步。",
  },
  cases: {
    mode: "send",
    text: `测试点已经确认。请为已确认的测试点写功能用例。${CASE_TEMPLATE_RULE}写完一个功能就用 task_checkpoint complete。标准审核没通过就先改再 complete，不要带着问题开始下一步。写完后调用 sync_case_sheet 推到钉钉表格。待澄清里标成忽略的不要写，已补充的按补充来写，待讨论的先不写。`,
  },
  record: { mode: "compose", text: "为用例录制自动化脚本。用例编号：   沙箱地址：" },
  run: { mode: "send", text: "运行已经录好的 UI 采集，或 automation 目录里已有的脚本，然后汇报每条用例的结果。不要修改脚本，不要替换选择器。" },
  defects: { mode: "send", text: "用已经连接的缺陷跟踪 MCP 读取缺陷，并调用 record_defects 写入 defects 目录。没有连接就告诉我去设置的 MCP 里添加，不要编造缺陷，不要用环境变量直连禅道或 Jira。" },
  report: { mode: "send", text: "根据已经写好的用例和缺陷写测试简报。不要编造通过率。" },
};

const BATCH_REQUEST: QaAgentRequest = {
  mode: "send",
  text: [
    "请先读 tasks/policy.json 和 tasks/status.md。没有 policy 文件时按智能协作。已完成的步骤不要重做。图谱里已经有内容时，store_requirement_graph 只能用 append。这一节有图时先调用 read_requirement_figures，图没读完不要写这一节图谱。图和正文不一致就写成待澄清，两边都留下，不要选一边。",
    "按节把需求图谱和待澄清写完，再按功能把测试点连续写完，每条状态仍是待确认。结构完整、且没有高风险待澄清挡住的功能，接着写用例草稿，每条加「- 状态：待确认」，自动化写否。",
    CASE_TEMPLATE_RULE,
    "下线、疑似删除、互相矛盾、规则缺失、新版未提及、废弃核心用例只挡住该功能的用例，其他功能继续。",
    "每写完一个功能的测试点或用例，就用 task_checkpoint complete。它会按标准审核状态为待确认的条目。没通过就先改文件再 complete，不要带着问题开始下一步。已经确认的测试点和没有状态行的旧用例不要改写。",
    "写完后汇报完成了哪些功能、几项必须逐项看、几项可以批量看，请我打开待审核。不要问要不要继续。录制、共享环境执行和应用版本演进基线要等我明确授权。",
  ].join("\n"),
};

/** Guided mode keeps one stage per click. The other two start the whole batch. */
export function stageRequest(stage: string, mode: WorkPolicy): QaAgentRequest {
  if (mode !== "guided" && stage !== "record" && stage !== "run" && stage !== "defects" && stage !== "report") {
    return BATCH_REQUEST;
  }
  return STAGE_REQUESTS[stage] ?? STAGE_REQUESTS.analysis;
}
