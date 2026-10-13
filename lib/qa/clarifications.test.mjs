import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  applyClarificationUpdate,
  clarificationFileLocation,
  parseClarificationDocument,
  readClarificationDocuments,
  updateClarificationMarkdown,
} = await jiti.import("./clarifications.ts");
const { clarificationSubmitText } = await jiti.import("./client.ts");
const { ReviewError } = await jiti.import("./review.ts");

const DOC = `# 需求评审

- 来源文件：需求.md

## ISO 29148 缺陷

| 准则 | 问题 |
| --- | --- |
| Completeness | 缺超时 |

## 待澄清问题

### Q001 登录失败是否锁定
- 状态：待处理
- 原文：连续失败后锁定
- Agent理解：失败 5 次锁定 15 分钟
- 补充：

### Q002 导出范围
- 状态：已补充
- 原文：支持导出
- Agent理解：导出全部数据
- 补充：只导出当前筛选结果
第二行说明

## 六流

- 正常流：登录
`;

test("reads only the clarification section and keeps multiline answers", () => {
  const document = parseClarificationDocument(DOC, "knowledge/需求评审.md");
  assert.equal(document.legacy, false);
  assert.deepEqual(document.items.map((item) => item.id), ["Q001", "Q002"]);
  assert.equal(document.items[0].status, "待处理");
  assert.equal(document.items[0].understanding, "失败 5 次锁定 15 分钟");
  assert.equal(document.items[1].supplement, "只导出当前筛选结果\n第二行说明");
});

test("a section of old prose is visible but not markable", () => {
  const document = parseClarificationDocument("# 评审\n\n## 待澄清问题\n\n这里还只是一段说明。\n", "knowledge/需求评审.md");
  assert.equal(document.legacy, true);
  assert.deepEqual(document.items, []);
});

test("a clarification file grouped by lettered headings is one card per question", () => {
  const markdown = [
    "# 筑安通 待澄清项",
    "",
    "来源：需求文档.md",
    "",
    "## A. 附件依赖",
    "",
    "1. 字典正文未列出枚举。",
    "2. 导入模板只有截图。",
    "",
    "## B. WEB端规则模糊点",
    "",
    "1. 整改完成率口径未写。",
    "",
  ].join("\n");
  const document = parseClarificationDocument(markdown, "knowledge/待澄清项.md");
  assert.equal(document.legacy, false);
  assert.deepEqual(document.items.map((item) => [item.id, item.group]), [
    ["A01", "A. 附件依赖"],
    ["A02", "A. 附件依赖"],
    ["B01", "B. WEB端规则模糊点"],
  ]);
  const next = updateClarificationMarkdown(markdown, "A01", { status: "忽略", supplement: "" });
  assert.match(next, /### A01 字典正文未列出枚举。\n- 状态：忽略/);
  assert.match(next, /### A02 导入模板只有截图。\n- 状态：待处理/);
  assert.match(next, /## B\. WEB端规则模糊点/);
  assert.match(next, /1\. 整改完成率口径未写。/);
  const again = parseClarificationDocument(next, "knowledge/待澄清项.md");
  assert.equal(again.items.find((item) => item.id === "A01").status, "忽略");
  assert.equal(again.items.find((item) => item.id === "A02").status, "待处理");
  assert.equal(again.items.find((item) => item.id === "B01").status, "待处理");
  const twice = updateClarificationMarkdown(next, "A01", { status: "待讨论", supplement: "" });
  assert.match(twice, /### A02 导入模板只有截图。/);
  assert.match(twice, /## B\. WEB端规则模糊点/);
  assert.match(twice, /1\. 整改完成率口径未写。/);
  assert.equal(parseClarificationDocument(twice, "knowledge/待澄清项.md").items.find((item) => item.id === "A01").status, "待讨论");
});

test("a numbered question list is markable and the first mark keeps the rest of the file", () => {
  const markdown = [
    "## 待澄清问题",
    "",
    "1. 整改完成率怎么算？",
    "2. 两端状态是不是同一套？",
    "",
    "## 六流",
    "",
    "- 正常流：登录",
    "",
  ].join("\n");
  const document = parseClarificationDocument(markdown, "knowledge/需求评审.md");
  assert.equal(document.legacy, false);
  assert.deepEqual(document.items.map((item) => [item.id, item.title]), [
    ["Q001", "整改完成率怎么算？"],
    ["Q002", "两端状态是不是同一套？"],
  ]);
  const next = updateClarificationMarkdown(markdown, "Q001", { status: "忽略", supplement: "" });
  assert.match(next, /### Q001 整改完成率怎么算？\n- 状态：忽略\n- 原文：整改完成率怎么算？/);
  assert.match(next, /### Q002 两端状态是不是同一套？\n- 状态：待处理/);
  assert.match(next, /## 六流/);
  assert.match(next, /- 正常流：登录/);
  assert.doesNotMatch(next, /^1\. /m);
});

test("updating one item keeps the rest of the document", () => {
  const next = updateClarificationMarkdown(DOC, "Q001", {
    status: "忽略",
    supplement: "原来的补充",
  });
  assert.match(next, /\| Completeness \| 缺超时 \|/);
  assert.match(next, /## 六流/);
  assert.match(next, /- 正常流：登录/);
  assert.match(next, /### Q001 登录失败是否锁定\n- 状态：忽略\n- 原文：连续失败后锁定\n- Agent理解：失败 5 次锁定 15 分钟\n- 补充：原来的补充/);
  assert.match(next, /### Q002 导出范围/);
  assert.equal(updateClarificationMarkdown(DOC, "Q999", { status: "忽略", supplement: "" }), null);
});

test("writes the status back without dropping the source wording", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qa-clarify-"));
  fs.mkdirSync(path.join(root, "knowledge"));
  fs.writeFileSync(path.join(root, "knowledge", "需求评审.md"), DOC);

  const updated = applyClarificationUpdate(root, "knowledge/需求评审.md", "Q001", "待讨论", "").item;
  assert.equal(updated.status, "待讨论");
  assert.equal(updated.source, "连续失败后锁定");
  const documents = readClarificationDocuments(root);
  assert.equal(documents[0].items[0].status, "待讨论");
  assert.equal(documents[0].items[1].status, "已补充");

  assert.throws(
    () => applyClarificationUpdate(root, "knowledge/../secret.md", "Q001", "忽略", ""),
    (error) => error instanceof ReviewError && error.status === 403,
  );
  assert.throws(
    () => applyClarificationUpdate(root, "knowledge/需求评审.md", "Q001", "删掉", ""),
    /status must be/,
  );
});

test("a file opened as /Users still posts to the session directory spelling", () => {
  const location = clarificationFileLocation(
    "/Users/zephyrus/Desktop/易训/筑安通/knowledge/筑安通V1.1.3需求评审.md",
    "/System/Volumes/Data/Users/zephyrus/Desktop/易训",
  );
  assert.equal(location.workspace, "/System/Volumes/Data/Users/zephyrus/Desktop/易训/筑安通");
  assert.equal(location.file, "knowledge/筑安通V1.1.3需求评审.md");
});

test("the submit message points the agent at the file and the three states", () => {
  const text = clarificationSubmitText(["knowledge/需求评审.md"]);
  assert.match(text, /knowledge\/需求评审\.md/);
  assert.match(text, /忽略/);
  assert.match(text, /已补充/);
  assert.match(text, /待讨论/);
  assert.match(text, /不要删除条目/);
  assert.match(text, /不要重做/);
});

const VERSION_PACK = `# 需求评审（易训）

> V1.1.3 迭代的待澄清项在 \`knowledge/待澄清项.md\`。

## E. V1.1.4 重构需求源包待澄清

来源：knowledge/source-pack/
标记约定：已补充=按补充口径写；待讨论=先不写；忽略=不写。

### E01 预设密码两份文档不一致
- 原文：预设密码【111111】对【123456】
- 状态：待确认（矛盾）
- 影响：账号初始化激活的断言值。

### E02 人员删除入口未展开
- 原文：菜单有删除，列表操作列没有。
- 状态：待确认（规则缺失）
- 影响：人员删除用例暂缓。

### E03 套餐权限与业务侧冲突
- 原文：会议纪要不清晰点 3。
- 状态：待讨论（依赖平台侧结论）
- 影响：角色权限部分暂缓。

## 会议纪要已定稿口径（不列为待澄清，直接按此写）
1. 本期先支持单密码-多主体登录。
`;

test("a lettered 待澄清 section with 待确认 items is markable", () => {
  const document = parseClarificationDocument(VERSION_PACK, "knowledge/需求评审.md");
  assert.equal(document.legacy, false);
  assert.deepEqual(document.items.map((item) => [item.id, item.status]), [
    ["E01", "待处理"],
    ["E02", "待处理"],
    ["E03", "待讨论"],
  ]);
  assert.equal(document.items[0].source, "预设密码【111111】对【123456】");
  assert.equal(document.items[0].understanding, "账号初始化激活的断言值。");
  assert.equal(document.items[0].group, "E. V1.1.4 重构需求源包待澄清");
  assert.equal(document.items.some((item) => item.title.includes("单密码")), false);
});

test("marking an E-section item keeps the 会议纪要 section", () => {
  const next = updateClarificationMarkdown(VERSION_PACK, "E01", { status: "忽略", supplement: "" });
  assert.match(next, /### E01 预设密码两份文档不一致\n- 状态：忽略/);
  assert.match(next, /### E02 人员删除入口未展开/);
  assert.match(next, /## 会议纪要已定稿口径（不列为待澄清，直接按此写）/);
  assert.match(next, /1\. 本期先支持单密码-多主体登录。/);
  assert.equal(parseClarificationDocument(next, "knowledge/需求评审.md").items[0].status, "忽略");
});
