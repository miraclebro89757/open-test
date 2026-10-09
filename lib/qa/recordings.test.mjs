import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { listRecordings, readSandbox, saveSandboxUrl, casesToRecord, buildRecordRequest, toAnalysisView, isHttpUrl } = await jiti.import("./recordings.ts");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "qa-record-"));
}

function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test("the sandbox address follows the terminal's order and can be saved", () => {
  const root = workspace();
  assert.deepEqual(readSandbox(root, {}), { url: "", source: "none" });
  assert.equal(readSandbox(root, { OPENTEST_SANDBOX_URL: "https://env.example.com" }).source, "environment");

  saveSandboxUrl(root, "https://demo.example.com");
  assert.deepEqual(readSandbox(root, {}), { url: "https://demo.example.com", source: "config" });
  // Environments the terminal saved are kept when the page saves a default.
  write(root, "opentest.sandbox.json", JSON.stringify({ defaultUrl: "https://a.example.com", environments: { test: "https://t.example.com" }, activeEnvironment: "test" }));
  assert.equal(readSandbox(root, {}).url, "https://t.example.com");
  saveSandboxUrl(root, "https://b.example.com");
  const saved = JSON.parse(fs.readFileSync(path.join(root, "opentest.sandbox.json"), "utf8"));
  assert.equal(saved.environments.test, "https://t.example.com");
  assert.equal(saved.defaultUrl, "https://b.example.com");

  assert.throws(() => saveSandboxUrl(root, "ftp://x"), /http/);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
});

test("only cases without a script are offered for recording", () => {
  const root = workspace();
  write(root, "cases/a.md", "### TC001 登录\n- 自动化：是\n- 脚本：automation/x.spec.ts\n\n### TC002 退出\n- 优先级：中\n");
  assert.deepEqual(casesToRecord(root), [{ id: "TC002", title: "退出" }]);
});

test("recordings are grouped by case and timestamp, with the analysis summarised", () => {
  const root = workspace();
  const stem = "TC001-1700000000000";
  write(root, `automation/${stem}.spec.ts`, "");
  write(root, `automation/test_api_${stem}.py`, "");
  write(root, `automation/${stem}.har`, "{}");
  write(root, `automation/${stem}.env.example`, "");
  write(root, `automation/${stem}_README.md`, "");
  write(root, `automation/${stem}.analysis.json`, JSON.stringify({
    source: "rules",
    summary: { totalRequests: 3, uniqueEndpoints: 2 },
    variables: [{ name: "token_0", type: "string", usedIn: [1, 2], example: "eyJreal.secret.token" }],
    dependencies: [{ from: 0, to: 1, variable: "token_0" }],
    sensitiveData: [{ category: "password", value: "hunter2" }, { category: "password" }, { category: "token" }],
    recommendations: ["use env"],
  }));
  write(root, "automation/TC002-1700000100000.spec.ts", "");
  write(root, "automation/hand-written.spec.ts", "");

  const recordings = listRecordings(root);
  assert.deepEqual(recordings.map((item) => item.id), ["TC002-1700000100000", stem]);
  const full = recordings[1];
  assert.equal(full.caseId, "TC001");
  assert.equal(full.ui, `automation/${stem}.spec.ts`);
  assert.equal(full.api, `automation/test_api_${stem}.py`);
  assert.equal(full.env, `automation/${stem}.env.example`);
  assert.equal(full.analysis.source, "rules");
  assert.deepEqual(full.analysis.variables, [{ name: "token_0", type: "string", usedIn: 2 }]);
  assert.deepEqual(full.analysis.sensitive, [{ category: "password", count: 2 }, { category: "token", count: 1 }]);
  // Neither the example token nor the password value is passed on.
  assert.ok(!JSON.stringify(full.analysis).includes("hunter2"));
  assert.ok(!JSON.stringify(full.analysis).includes("secret.token"));
  assert.equal(recordings[0].api, "");
  assert.equal(recordings[0].analysis, null);
});

test("an unreadable analysis does not hide the recording", () => {
  const root = workspace();
  write(root, "automation/TC009-1700000000000.analysis.json", "{broken");
  write(root, "automation/TC009-1700000000000.har", "{}");
  const [recording] = listRecordings(root);
  assert.equal(recording.har, "automation/TC009-1700000000000.har");
  assert.equal(recording.analysis, null);
  assert.equal(toAnalysisView("nope"), null);
});

test("the wizard request spells out every choice and leaves cleanup out of ui-only", () => {
  const apiRequest = buildRecordRequest({ sandboxUrl: "https://s.example.com", caseId: "TC001", mode: "ui+api", cleanupPre: true, cleanupPost: false });
  assert.match(apiRequest, /沙箱地址：https:\/\/s\.example\.com/);
  assert.match(apiRequest, /cleanupPre=true，cleanupPost=false，caseId=TC001/);
  const uiRequest = buildRecordRequest({ sandboxUrl: "https://s.example.com", caseId: "", mode: "ui-only", cleanupPre: true, cleanupPost: true });
  assert.ok(!uiRequest.includes("cleanupPre"));
});
