import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { defectSetup, readDefects, recordDefects } = await jiti.import("./defects.ts");
const { briefFileName, previewBrief, writeBrief } = await jiti.import("./brief.ts");
const { countByStatus } = await jiti.import("./defect-types.ts");
const { readQaOverview } = await jiti.import("./overview.ts");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qa-defects-"));
}

function mcpHome(servers) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "qa-mcp-"));
  fs.writeFileSync(path.join(home, "mcp.json"), JSON.stringify({ mcpServers: servers }));
  return home;
}

test("the page lists connected tracker MCP servers and not their addresses", () => {
  const root = workspace();
  const home = mcpHome({
    jira: { url: "https://jira.example/mcp?token=secret-token" },
    "dingtalk-excel": { url: "https://sheet.example/mcp" },
  });
  const setup = defectSetup(root, { PI_CODING_AGENT_DIR: home });
  assert.deepEqual(setup.trackers, [{ name: "jira", kind: "jira", enabled: true }]);
  assert.ok(!JSON.stringify(setup).includes("secret-token"));
});

test("defects recorded from an MCP read are saved and counted", () => {
  const root = workspace();
  const result = recordDefects(root, [
    { source: "zentao", id: "1", title: "登录失败", priority: "1", status: "active" },
    { source: "zentao", id: "2", title: "列表为空", priority: "2", status: "closed" },
  ]);
  assert.equal(result.count, 2);
  const saved = readDefects(root);
  assert.deepEqual(saved.bugs.map((bug) => bug.id), ["1", "2"]);
  assert.deepEqual(countByStatus(saved.bugs), [{ status: "active", count: 1 }, { status: "closed", count: 1 }]);
});

test("a defect without a title is refused and nothing is invented", () => {
  const root = workspace();
  assert.throws(() => recordDefects(root, [{ id: "1" }]), /id and a title/);
  assert.equal(readDefects(root), null);
});

test("the brief is written from files, with the terminal's file-name rule", () => {
  assert.equal(briefFileName(), "brief.md");
  assert.equal(briefFileName("../../etc/passwd"), "passwd.md");
  assert.equal(briefFileName("周报 v2"), "周报v2.md");

  const root = workspace();
  fs.mkdirSync(path.join(root, "cases"), { recursive: true });
  fs.writeFileSync(path.join(root, "cases", "a.md"), "### TC001 登录\n- 自动化：是\n");
  assert.equal(previewBrief(root).caseCount, 1);
  assert.ok(!fs.existsSync(path.join(root, "reports", "brief.md")), "a preview writes nothing");

  const written = writeBrief(root);
  assert.equal(written.relative, path.join("reports", "brief.md"));
  assert.match(fs.readFileSync(written.file, "utf8"), /还没有执行记录，所以没有通过率/);
  assert.equal(readQaOverview(root).stages.find((stage) => stage.id === "report").status, "done");
});
