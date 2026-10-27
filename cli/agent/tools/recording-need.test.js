'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { needsPlaywrightRecording } = require('./recording-need');

test('a high-priority core journey needs a Playwright recording', () => {
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '新建作业班组' }), true);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '管理员登录' }), true);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '打开巡检列表' }), true);
});

test('a high-priority check is not a Playwright recording', () => {
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '作业班组重名时提示' }), false);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '名称超过长度不可输入' }), false);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '班组长小程序权限默认全部' }), false);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '活动模块下线验证' }), false);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '工种被人员占用时无法删除' }), false);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '新建作业页面表单展示' }), false);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '停用账号无法登录当前主体' }), false);
});

test('saving a core object still counts when the title also says the list updates', () => {
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '保存巡检计划后列表展示新计划' }), true);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '新增管理班组展示"管"icon' }), false);
});

test('medium and low priority journeys are not recorded unless the field says so', () => {
  assert.equal(needsPlaywrightRecording({ priority: '中', title: '打开项目列表' }), false);
  assert.equal(needsPlaywrightRecording({ priority: '中', title: '打开项目列表', recording: '需要' }), true);
  assert.equal(needsPlaywrightRecording({ priority: '高', title: '新建作业班组', recording: '不需要' }), false);
});
