import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  CASE_TEMPLATE_RULE,
  expandInlineSteps,
  formatStepField,
  normalizeCaseItemBody,
  normalizeCaseMarkdown,
} = await jiti.import("./case-format.ts");
const { STAGE_REQUESTS, clarificationSubmitText } = await jiti.import("./client.ts");
const { composeWebQaPrompt } = await jiti.import("./web-session.ts");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skill = fs.readFileSync(path.join(root, ".pi/skills/opentest-qa/SKILL.md"), "utf8");

const INLINE = `### TC159 内部人员列表检索与筛选
- 优先级：中
- 自动化：否
- 状态：待确认
- 对应测试点：TP159
- 前置条件：内部主体下已有人员数据
- 步骤：1 按姓名关键字模糊搜索；2 按手机号、身份证号模糊搜索；3 按账号状态筛选
- 期望结果：姓名/手机号/身份证号模糊搜索命中；账号状态筛选结果正确
`;

test("expands jammed 步骤：1 x；2 y into the 巡检 numbered list", () => {
  assert.equal(
    expandInlineSteps("1 按姓名关键字模糊搜索；2 按手机号、身份证号模糊搜索；3 按账号状态筛选"),
    "1. 按姓名关键字模糊搜索\n2. 按手机号、身份证号模糊搜索\n3. 按账号状态筛选",
  );
  assert.equal(expandInlineSteps("对该工种执行删除"), "1. 对该工种执行删除");
  assert.match(formatStepField("1 登录WEB端；2 登录小程序"), /^- 步骤：\n  1\. 登录WEB端\n  2\. 登录小程序$/);
});

test("keeps a draft 待确认 mark and multiline 步骤 in the 巡检 field order", () => {
  const body = normalizeCaseItemBody(INLINE.replace(/^###.+\n/, ""));
  assert.equal(
    body,
    [
      "- 优先级：中",
      "- 自动化：否",
      "- 状态：待确认",
      "- 对应测试点：TP159",
      "- 前置条件：内部主体下已有人员数据",
      "- 步骤：",
      "  1. 按姓名关键字模糊搜索",
      "  2. 按手机号、身份证号模糊搜索",
      "  3. 按账号状态筛选",
      "- 期望结果：姓名/手机号/身份证号模糊搜索命中；账号状态筛选结果正确",
    ].join("\n"),
  );
});

test("file header splits jammed 来源 notes and adds 图谱场景", () => {
  const markdown = normalizeCaseMarkdown(
    `# 功能用例-系统管理-人员管理

来源：test-points/系统管理-人员管理.md（TP159–TP171，待确认）；E01已补充：默认密码【111111】

${INLINE}`,
    "sc-v14-per-01～sc-v14-per-07",
  );
  assert.match(markdown, /^# 功能用例-系统管理-人员管理\n\n来源：test-points\/系统管理-人员管理\.md（TP159–TP171，待确认）\n图谱场景：sc-v14-per-01～sc-v14-per-07\nE01已补充：默认密码【111111】/m);
  assert.match(markdown, /- 步骤：\n  1\. 按姓名关键字模糊搜索/);
  assert.doesNotMatch(markdown, /步骤：1 /);
});

test("skill and agent prompts lock the 巡检 case template", () => {
  assert.match(skill, /项目巡检/);
  assert.match(skill, /禁止.*步骤：1 /);
  assert.match(CASE_TEMPLATE_RULE, /换行编号/);
  assert.match(STAGE_REQUESTS.cases.text, /换行编号/);
  assert.match(clarificationSubmitText(["knowledge/需求评审.md"]), /换行编号/);
  assert.match(composeWebQaPrompt("/a/b/MyProduct"), /换行编号/);
});
