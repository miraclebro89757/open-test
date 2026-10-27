import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  composeWebQaPrompt,
  isQaWorkflowEnabled,
  qaResourceOptions,
  workspaceToolArguments,
} = await jiti.import("./web-session.ts");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("QA workflow is on unless OPENTEST_QA turns it off", () => {
  assert.equal(isQaWorkflowEnabled({}), true);
  assert.equal(isQaWorkflowEnabled({ OPENTEST_QA: "1" }), true);
  for (const off of ["0", "false", "OFF"]) assert.equal(isQaWorkflowEnabled({ OPENTEST_QA: off }), false);
  assert.equal(qaResourceOptions("/tmp/p", { OPENTEST_QA: "0" }, root), undefined);
});

test("the session directory splits into the arguments the QA tools expect", () => {
  assert.deepEqual(workspaceToolArguments("/a/b/MyProduct"), { requirementDir: "/a/b", productName: "MyProduct" });
  assert.deepEqual(workspaceToolArguments("/a/b/MyProduct/"), { requirementDir: "/a/b", productName: "MyProduct" });
  const prompt = composeWebQaPrompt("/a/b/MyProduct");
  assert.match(prompt, /\/a\/b\/MyProduct 就是产品工作目录/);
  assert.match(prompt, /requirementDir 传 \/a\/b，productName 传 MyProduct/);
  assert.match(prompt, /ingest_requirement_sources/);
  assert.match(prompt, /编号、标题、模块、需求版本/);
});

test("resource options point at the bundled skill, prompts and extension", () => {
  const options = qaResourceOptions("/a/b/MyProduct", {}, root);
  assert.deepEqual(options.additionalSkillPaths, [path.join(root, ".pi", "skills", "opentest-qa")]);
  assert.deepEqual(options.additionalPromptTemplatePaths, [path.join(root, "cli", "agent", "prompts")]);
  assert.equal(options.appendSystemPrompt.length, 1);
  assert.equal(options.extensionFactories.length, 1);
});

test("the web extension registers the step commands without the terminal-only ones", async () => {
  const options = qaResourceOptions("/a/b/MyProduct", {}, root);
  const commands = [];
  const tools = [];
  const shortcuts = [];
  const pi = {
    on() {},
    registerTool: (tool) => tools.push(tool.name),
    registerCommand: (name) => commands.push(name),
    registerShortcut: (key) => shortcuts.push(key),
    registerMessageRenderer() {},
  };
  await options.extensionFactories[0](pi);
  for (const name of ["status", "analyze", "points", "cases", "record", "run", "defects", "report"]) {
    assert.ok(commands.includes(name), `missing /${name}`);
  }
  assert.equal(commands.includes("project"), false, "Pi Web already opens project directories");
  assert.deepEqual(shortcuts, [], "keyboard shortcuts belong to the terminal");
  assert.ok(tools.includes("task_checkpoint"));
  assert.ok(tools.includes("ingest_requirement_sources"));
  assert.ok(tools.includes("sync_case_sheet"));
  assert.ok(tools.includes("record_playwright_scenario"));
});
