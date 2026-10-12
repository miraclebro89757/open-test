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
    `这个会话打开的目录 ${sessionCwd} 就是产品工作目录。knowledge/、graph/、test-points/、cases/、automation/、defects/、reports/、tasks/ 都直接写在它下面，不要另建以产品命名的子目录，也不要写到别处。`,
    `调用 task_checkpoint、store_requirement_graph、query_requirement_graph、align_requirement_versions、query_baseline_feature、record_playwright_scenario、fetch_zentao_jira、write_executive_report 等工具时，requirementDir 传 ${requirementDir}，productName 传 ${productName}，这样工具得到的工作目录正是 ${sessionCwd}。`,
    "同一产品有基线和重构两份文档时，先调用 align_requirement_versions。它只生成待审核的迁移方案，不要覆盖图谱，也不要删除已有用例。新版没写到的功能不能当成删除。",
    "需求文档用 @ 放进对话，先读再写。每个任务开始前调用 task_checkpoint 看进度，已完成的步骤不要重做。",
    "测试点要等人确认后才能写用例。选择器失效时调用 heal_selector，前后版本都留下，由用户决定保留哪一版。",
    "待澄清写在 knowledge/需求评审.md。标成忽略的不要再提起，已补充的以补充为准，待讨论的不要编造结论。写完一节的问题就停下来等人标记，不要改测试人员已经标过的条目。",
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
