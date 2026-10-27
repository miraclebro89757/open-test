import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

/**
 * Loads the OpenTest QA workflow into Pi Web sessions.
 *
 * The Terminal Agent loads `cli/agent/extension.js` and the `opentest-qa` skill
 * with command-line flags. A Web session builds its resource loader in
 * `lib/rpc-manager.ts`, so the same extension, skill and prompt templates are
 * handed over here. Both hosts then run one set of tools.
 *
 * Set `OPENTEST_QA=0` to start plain Pi Web sessions without the QA workflow.
 */

export function isQaWorkflowEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  const value = environment.OPENTEST_QA?.trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

/** Repository root. The launcher starts the server there; OPENTEST_ROOT overrides it. */
export function opentestRoot(environment: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
  return environment.OPENTEST_ROOT?.trim() || cwd;
}

export function qaSkillDir(root: string): string {
  return join(root, ".pi", "skills", "opentest-qa");
}

export function qaPromptTemplatesDir(root: string): string {
  return join(root, "cli", "agent", "prompts");
}

export function qaExtensionFile(root: string): string {
  return join(root, "cli", "agent", "extension.js");
}

/**
 * The product workspace is the directory the session was opened on. The QA
 * tools build a workspace as `<requirementDir>/<productName>`, so for a session
 * on `/a/b/MyProduct` the arguments are `/a/b` and `MyProduct`.
 */
export function workspaceToolArguments(sessionCwd: string): { requirementDir: string; productName: string } {
  const trimmed = sessionCwd.replace(/[\\/]+$/, "");
  return { requirementDir: dirname(trimmed), productName: basename(trimmed) };
}

export function composeWebQaPrompt(sessionCwd: string): string {
  const { requirementDir, productName } = workspaceToolArguments(sessionCwd);
  return [
    "你是 OpenTest 测试 Agent，服务测试工程师。按 opentest-qa 技能工作：需求分析、测试点、用例、录制、执行、缺陷、简报。",
    `这个会话打开的目录 ${sessionCwd} 就是产品工作目录。knowledge/、graph/、test-points/、cases/、recordings/、automation/、defects/、reports/、tasks/ 都直接写在它下面，不要另建以产品命名的子目录，也不要写到别处。`,
    `调用 task_checkpoint、ingest_requirement_sources、read_requirement_figures、sync_case_sheet、store_requirement_graph、query_requirement_graph、align_requirement_versions、query_baseline_feature、record_playwright_scenario、fetch_zentao_jira、write_executive_report 等工具时，requirementDir 传 ${requirementDir}，productName 传 ${productName}，这样工具得到的工作目录正是 ${sessionCwd}。`,
    "同一产品有基线和重构两份文档时，先调用 align_requirement_versions。它只生成待审核的迁移方案，不要覆盖图谱，也不要删除已有用例。新版没写到的功能不能当成删除。",
    "用户给出钉钉文档链接时，先调用 ingest_requirement_sources，不要让人下载嵌套文档。采集完成后读 knowledge/source-pack/，分析阶段不要再调钉钉拉正文。这一节有图时调用 read_requirement_figures 刷新当时有效的图地址，图没读完不要写这一节图谱。图和正文不一致就写成待澄清，两边都留下，不要选一边。本地 @ 文件仍然可用。写完用例后调用 sync_case_sheet 推到钉钉个人空间表格，人改完表格后再 pull。不要用钉钉文档 MCP 写表格。已经有 knowledge/case-sheet.json 时不要另建第二张表。表格表头固定为：编号、标题、模块、需求版本、优先级、对应测试点、前置条件、步骤、期望结果、状态、执行结果。每个任务先调用 task_checkpoint，action 用 status 看进度，已完成的步骤不要重做。没有 start。当前这一步的文件写完后，action 用 complete。",
    "先读 tasks/policy.json。没有这个文件时按智能协作：不要每节停下来问要不要继续；图谱里已有节点时 store_requirement_graph 只能用 append；测试点写完后状态仍是待确认，没有高风险待澄清挡住的功能可以接着写用例草稿，每条加「- 状态：待确认」。写用例正文对齐产品里已有的巡检模版：步骤必须换行编号，禁止写成「步骤：1 x；2 y」。一条用例只验证一件事。标题不要用「与」「兼测」「同时校验」。创建成功不要和重名、长度、格式、必填拦截写在同一条，默认权限和名称长度必须分开。已经写好的旧用例不要为了拆分而改写。测试点和用例写完一个功能后用 task_checkpoint complete。它会按标准审核状态为待确认的条目，没通过就先改再 complete，不要带着问题开始下一步。已经确认的测试点和没有状态行的旧用例不要改写。逐步引导才每节停下，并等人确认测试点后再写用例。选择器失效时调用 heal_selector，前后版本都留下，由用户决定保留哪一版。",
    "待澄清写在 knowledge/需求评审.md。标成忽略的不要再提起，已补充的以补充为准，待讨论的不要编造结论。逐步引导时写完一节的问题就停下来等人标记。智能协作和自主执行把各节连续写完。不要改测试人员已经标过的条目。下线、疑似删除、互相矛盾、规则缺失和新版未提及不能自动当真，也不能自动废弃用例或应用版本演进基线。",
    "写待澄清、测试点和用例前读 knowledge/审核经验.md 和 ~/.pi/agent/opentest/审核经验.md，只用已启用的经验。人的补充和忽略由系统自动写入经验文件，不要等人点记成经验，也不要为同一关键词再追加一条。新的待澄清和经验相符且不涉及上面的高风险时，按经验写状态和补充，并在补充前加「- 依据：审核经验 编号」。满 100 条审核记录后系统会合并经验文件，不要自己重写。",
    "录制只采集 Playwright UI 操作，写入 recordings/。新用例要写录制：需要或不需要。只有高优先级的核心用户旅程写需要，用来回归主路径。校验、权限、默认值和提示类写不需要。缺这个字段的旧用例不要为了补字段而改写。不要生成 spec、pytest 或 HAR，也不要把用例标成自动化：是。API 录制还没有做。浏览器只打开一次：先登录，再在控制页录，全部录完再关闭。",
    "不要编造通过率、缺陷或外部同步结果，不要读取或打印 API key。用户要换模型时，让他用页面里的模型选择。",
  ].join("\n");
}

export interface QaResourceOptions {
  additionalSkillPaths: string[];
  additionalPromptTemplatePaths: string[];
  appendSystemPrompt: string[];
  extensionFactories: ExtensionFactory[];
}

/**
 * Resource loader options that add the QA workflow to a normal Web session.
 * Returns `undefined` when the workflow is switched off.
 */
export function qaResourceOptions(
  sessionCwd: string,
  environment: NodeJS.ProcessEnv = process.env,
  root: string = opentestRoot(environment),
): QaResourceOptions | undefined {
  if (!isQaWorkflowEnabled(environment)) return undefined;
  const extensionFile = qaExtensionFile(root);
  const factory: ExtensionFactory = async (pi) => {
    // The extension is plain CommonJS shared with the terminal; load it at run
    // time so the bundler leaves it alone.
    const load = createRequire(join(root, "package.json"));
    const extension = load(extensionFile) as { createExtension: (options: { host: "web" }) => ExtensionFactory };
    await extension.createExtension({ host: "web" })(pi);
  };
  return {
    additionalSkillPaths: [qaSkillDir(root)],
    additionalPromptTemplatePaths: [qaPromptTemplatesDir(root)],
    appendSystemPrompt: [composeWebQaPrompt(sessionCwd)],
    extensionFactories: [factory],
  };
}
