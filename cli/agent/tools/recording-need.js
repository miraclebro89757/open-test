'use strict';

// Playwright recording is for regression of a core user journey with high
// business impact. A high priority is not enough: validation, permission,
// and boundary cases stay out.

const JOURNEY = /登录|打开|进入|新建|新增|创建|保存|提交|完成|发布|发起|编辑|删除|切换/;
const BLOCK = /重名|重复|长度|超限|格式|必填|不可输入|校验|拦截|权限|无权限|为空|错误|失败|边界|特殊字符|非法|下线|默认|并集|锁定|展开|字段|提示|隔离|无法|不支持|置灰|缺省|驳回|仅可|仅限|不能|不可/;
const DISPLAY = /表单|icon|通知|菜单|入口|验证|展示|即/;
const COMMIT = /保存|提交|发布/;

function explicitRecording(item) {
  const value = String(item.recording ?? item.fields?.['录制'] ?? '').trim();
  if (value === '需要' || value === '不需要') return value;
  return '';
}

/** True when this case should be captured as a Playwright regression. */
function needsPlaywrightRecording(item) {
  const explicit = explicitRecording(item);
  if (explicit) return explicit === '需要';
  const priority = String(item.priority ?? item.fields?.['优先级'] ?? '').trim();
  if (priority !== '高') return false;
  const title = String(item.title || '');
  if (BLOCK.test(title)) return false;
  if (DISPLAY.test(title) && !COMMIT.test(title)) return false;
  return JOURNEY.test(title);
}

module.exports = { needsPlaywrightRecording, explicitRecording };
