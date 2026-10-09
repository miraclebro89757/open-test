import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { defectSetup, readDefects, syncDefects } = await jiti.import("./defects.ts");
const { briefFileName, previewBrief, writeBrief } = await jiti.import("./brief.ts");
const { countByStatus } = await jiti.import("./defect-types.ts");
const { readCheckpoint } = await jiti.import("./checkpoint.ts");
const { readQaOverview } = await jiti.import("./overview.ts");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qa-defects-"));
}

const ZENTAO = { ZENTAO_BASE_URL: "https://zentao.example.com", ZENTAO_TOKEN: "secret-token" };

function zentaoResponse() {
  return async (url, init) => {
    assert.match(String(url), /api\.php\/v1\/bugs/);
    assert.equal(init.headers.Token, "secret-token");
    return { ok: true, json: async () => ({ bugs: [
      { id: 1, title: "登录失败", priority: 1, status: "active" },
      { id: 2, title: "列表为空", priority: 2, status: "closed" },
    ] }) };
  };
}

test("without credentials the page learns which variables are missing and nothing is invented", async () => {
  const root = workspace();
  const setup = defectSetup({});
  assert.deepEqual(setup.zentao.missing, ["ZENTAO_BASE_URL", "ZENTAO_TOKEN"]);
  const result = await syncDefects(root, { env: {} });
  assert.equal(result.configured, false);
  assert.equal(readDefects(root), null);
  // The terminal records the same thing as a failed step.
  assert.equal(readCheckpoint(root).tasks.defects.steps[0].status, "failed");
});

test("defects are read with the server's credentials, saved, and counted", async () => {
  const root = workspace();
  const result = await syncDefects(root, { env: ZENTAO, fetchImpl: zentaoResponse() });
  assert.deepEqual({ configured: result.configured, count: result.count }, { configured: true, count: 2 });
  const saved = readDefects(root);
  assert.deepEqual(saved.bugs.map((bug) => bug.id), ["1", "2"]);
  assert.ok(!JSON.stringify(saved).includes("secret-token"));
  assert.deepEqual(countByStatus(saved.bugs), [{ status: "active", count: 1 }, { status: "closed", count: 1 }]);
  assert.equal(readQaOverview(root).stages.find((stage) => stage.id === "defects").status, "done");
});

test("an upstream failure is recorded and raised without the token", async () => {
  const root = workspace();
  const failing = async () => ({ ok: false, status: 401 });
  await assert.rejects(syncDefects(root, { env: ZENTAO, fetchImpl: failing }), (error) => /HTTP 401/.test(error.message) && !error.message.includes("secret-token"));
  assert.equal(readCheckpoint(root).tasks.defects.steps[0].status, "failed");
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
