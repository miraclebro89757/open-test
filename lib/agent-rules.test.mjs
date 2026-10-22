import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  AGENT_RULES_MAX_BYTES,
  AgentRulesError,
  activeContextFile,
  readAgentRules,
  writeAgentRules,
} = await jiti.import("./agent-rules.ts");

function temporaryDirectory() {
  return mkdtempSync(join(tmpdir(), "agent-rules-"));
}

test("a missing AGENTS.md reads as empty and a save creates it", () => {
  const directory = temporaryDirectory();
  try {
    const missing = readAgentRules(directory);
    assert.equal(missing.exists, false);
    assert.equal(missing.content, "");
    assert.equal(missing.activeFile, null);
    assert.equal(missing.path, join(realpathSync(directory), "AGENTS.md"));

    const saved = writeAgentRules(directory, "全局规则\n");
    assert.equal(saved.exists, true);
    assert.equal(saved.content, "全局规则\n");
    assert.equal(saved.activeFile, "AGENTS.md");
    assert.equal(readFileSync(saved.path, "utf8"), "全局规则\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an override or CLAUDE.md is reported as the file a session reads", () => {
  const directory = temporaryDirectory();
  try {
    writeFileSync(join(directory, "CLAUDE.md"), "claude");
    assert.equal(activeContextFile(directory), "CLAUDE.md");
    assert.equal(readAgentRules(directory).activeFile, "CLAUDE.md");

    writeFileSync(join(directory, "AGENTS.override.md"), "override");
    assert.equal(readAgentRules(directory).activeFile, "AGENTS.override.md");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a symlink and an oversized body are refused", () => {
  const directory = temporaryDirectory();
  const elsewhere = temporaryDirectory();
  try {
    writeFileSync(join(elsewhere, "secret.md"), "secret");
    symlinkSync(join(elsewhere, "secret.md"), join(directory, "AGENTS.md"));
    assert.throws(() => readAgentRules(directory), (error) => error instanceof AgentRulesError && error.code === "symlink");
    assert.throws(() => writeAgentRules(directory, "nope"), (error) => error instanceof AgentRulesError && error.code === "symlink");
    assert.equal(readFileSync(join(elsewhere, "secret.md"), "utf8"), "secret");

    rmSync(join(directory, "AGENTS.md"));
    assert.throws(
      () => writeAgentRules(directory, "x".repeat(AGENT_RULES_MAX_BYTES + 1)),
      (error) => error instanceof AgentRulesError && error.code === "too-large",
    );
    assert.equal(readAgentRules(directory).exists, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("a nested path is not a rules directory the writer accepts", () => {
  const directory = temporaryDirectory();
  try {
    const nested = join(directory, "nested");
    mkdirSync(nested);
    writeAgentRules(nested, "inside");
    assert.equal(readFileSync(join(nested, "AGENTS.md"), "utf8"), "inside");
    assert.equal(readAgentRules(directory).exists, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
