import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./ansi.ts");
}

test("strips ANSI escapes and leftover color codes", async () => {
  const { stripAnsi } = await loadSubject();

  assert.equal(stripAnsi("\x1b[31mred\x1b[0m plain"), "red plain");
  assert.equal(stripAnsi("answer\x1b_pi:c\x07"), "answer");
  const { stripAnsiForDisplay } = await loadSubject();
  assert.equal(stripAnsiForDisplay("\x1b[36mUI + API\x1b[39m"), "UI + API");
  assert.equal(stripAnsiForDisplay("[36mUI + API[39m [1mWill record[22m"), "UI + API Will record");
});

test("normalizes boxed custom panel lines while preserving ANSI codes", async () => {
  const { normalizeCustomPanelLines, stripAnsi } = await loadSubject();
  const lines = [
    "┌──────┐",
    "│ \x1b[32mOK\x1b[0m   │",
    "└──────┘",
  ];

  const normalized = normalizeCustomPanelLines(lines);

  assert.equal(normalized.length, 1);
  assert.equal(stripAnsi(normalized[0]), "OK");
  assert.match(normalized[0], /\x1b\[32m/);
});

test("removes pi-tui cursor markers from custom panel output", async () => {
  const { normalizeCustomPanelLines } = await loadSubject();

  assert.deepEqual(normalizeCustomPanelLines(["> value\x1b_pi:c\x07"]), ["> value"]);
});
