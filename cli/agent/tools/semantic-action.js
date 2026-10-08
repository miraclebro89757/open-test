/**
 * Semantic Action Extraction
 * 
 * 将原始浏览器事件转换为语义化的测试步骤。
 * 
 * 转换流程：
 * Raw Event → Semantic Action → Test Step
 * 
 * 例如：
 * click button.submit → 提交表单 → await page.click('[data-testid="submit"]')
 * 
 * @module semantic-action
 */

const fs = require('fs');
const path = require('path');

/**
 * Event grouping strategies
 * 
 * 将连续的小事件合并为有意义的大动作
 */
function groupEvents(events) {
  const groups = [];
  let currentGroup = null;
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const nextEvent = events[i + 1];
    
    // Start new group
    if (!currentGroup) {
      currentGroup = {
        type: 'action',
        events: [event],
        startTime: event.timestamp,
      };
      continue;
    }
    
    // Check if event should be merged into current group
    const timeDiff = event.timestamp - currentGroup.startTime;
    const shouldMerge = timeDiff < 2000 && // Within 2 seconds
                       isSameContext(currentGroup.events[0], event);
    
    if (shouldMerge) {
      currentGroup.events.push(event);
      currentGroup.endTime = event.timestamp;
    } else {
      // Finalize current group
      groups.push(currentGroup);
      currentGroup = {
        type: 'action',
        events: [event],
        startTime: event.timestamp,
      };
    }
  }
  
  // Add last group
  if (currentGroup && currentGroup.events.length > 0) {
    groups.push(currentGroup);
  }
  
  return groups;
}

/**
 * Check if two events belong to same context
 */
function isSameContext(event1, event2) {
  // Same element
  if (event1.selector === event2.selector) {
    return true;
  }
  
  // Form filling (multiple inputs)
  if (event1.type === 'input' && event2.type === 'input') {
    return true;
  }
  
  // Click followed by input (likely form interaction)
  if (event1.type === 'click' && event2.type === 'input') {
    return true;
  }
  
  return false;
}

/**
 * Extract semantic action from event group
 */
function extractSemanticAction(group) {
  const firstEvent = group.events[0];
  const lastEvent = group.events[group.events.length - 1];
  
  const action = {
    id: `action-${firstEvent.id}`,
    timestamp: firstEvent.timestamp,
    url: firstEvent.url,
    rawEvents: group.events,
  };
  
  // Classify action type
  if (group.events.length === 1) {
    const event = firstEvent;
    
    if (event.type === 'navigation') {
      action.type = 'navigate';
      action.intent = '导航到新页面';
      action.target = event.url;
      action.from = event.from;
    } else if (event.type === 'click') {
      action.type = 'click';
      action.selector = event.selector;
      action.context = event.context;
      
      // Infer intent from context
      if (event.context.tagName === 'BUTTON' || event.context.role === 'button') {
        const text = event.context.textContent || event.context.innerText || '';
        if (text.includes('提交') || text.includes('确定') || text.includes('Submit')) {
          action.intent = '提交表单';
        } else if (text.includes('取消') || text.includes('关闭') || text.includes('Cancel')) {
          action.intent = '取消操作';
        } else if (text.includes('删除') || text.includes('Delete')) {
          action.intent = '删除数据';
        } else if (text.includes('保存') || text.includes('Save')) {
          action.intent = '保存数据';
        } else if (text.includes('添加') || text.includes('创建') || text.includes('新建') || text.includes('Add') || text.includes('Create')) {
          action.intent = '创建新数据';
        } else {
          action.intent = `点击按钮：${text}`;
        }
      } else if (event.context.tagName === 'A') {
        action.intent = `点击链接：${event.context.textContent || event.context.href}`;
      } else {
        action.intent = '点击元素';
      }
    } else if (event.type === 'input' || event.type === 'change') {
      action.type = 'input';
      action.selector = event.selector;
      action.value = event.value;
      action.context = event.context;
      
      const fieldName = event.context.name || event.context.placeholder || event.context.ariaLabel || '';
      action.intent = `输入${fieldName ? `：${fieldName}` : '内容'}`;
    } else if (event.type === 'submit') {
      action.type = 'submit';
      action.selector = event.selector;
      action.intent = '提交表单';
    }
  } else {
    // Multiple events - complex action
    const types = group.events.map(e => e.type);
    
    if (types.every(t => t === 'input' || t === 'change')) {
      // Form filling
      action.type = 'form-fill';
      action.intent = '填写表单';
      action.fields = group.events.map(e => ({
        selector: e.selector,
        value: e.value,
        name: e.context.name || e.context.placeholder,
      }));
    } else if (types.includes('click') && types.includes('input')) {
      // Click then fill
      action.type = 'interact-and-fill';
      action.intent = '交互并填写';
      action.steps = group.events.map(e => ({
        type: e.type,
        selector: e.selector,
        value: e.value,
      }));
    } else {
      action.type = 'complex';
      action.intent = '复杂交互';
      action.steps = group.events.map(e => ({
        type: e.type,
        selector: e.selector,
      }));
    }
  }
  
  return action;
}

/**
 * Analyze exploration session and extract semantic actions
 * 
 * @param {string} sessionFile - Path to session.json
 * @param {Object} llmClient - Optional LLM client for AI-enhanced analysis
 * @returns {Promise<Object>} Semantic analysis result
 */
async function analyzeExploration(sessionFile, llmClient = null) {
  const sessionData = JSON.parse(
    await fs.promises.readFile(sessionFile, 'utf8')
  );
  
  const events = sessionData.events || [];
  
  // Group events
  const groups = groupEvents(events);
  
  // Extract semantic actions
  const actions = groups.map(group => extractSemanticAction(group));
  
  // Identify user flows
  const flows = identifyFlows(actions);
  
  // Build analysis result
  const analysis = {
    sessionId: sessionData.sessionId,
    source: 'rules', // Will be 'ai' if LLM is used
    timestamp: Date.now(),
    summary: {
      totalEvents: events.length,
      totalActions: actions.length,
      totalFlows: flows.length,
      duration: sessionData.duration,
    },
    actions,
    flows,
    networkRequests: sessionData.networkRequests || [],
  };
  
  // Enhance with LLM if available
  if (llmClient) {
    try {
      analysis.aiEnhanced = await enhanceWithLLM(analysis, llmClient);
      analysis.source = 'ai';
    } catch (error) {
      console.warn('LLM enhancement failed, using rule-based analysis:', error.message);
    }
  }
  
  return analysis;
}

/**
 * Identify user flows from actions
 */
function identifyFlows(actions) {
  const flows = [];
  let currentFlow = null;
  
  for (const action of actions) {
    // Start new flow on navigation or after idle
    if (action.type === 'navigate' || !currentFlow) {
      if (currentFlow) {
        flows.push(currentFlow);
      }
      currentFlow = {
        id: `flow-${flows.length + 1}`,
        startTime: action.timestamp,
        actions: [action],
        url: action.url,
      };
    } else {
      currentFlow.actions.push(action);
      currentFlow.endTime = action.timestamp;
    }
  }
  
  if (currentFlow) {
    flows.push(currentFlow);
  }
  
  // Infer flow intent
  flows.forEach(flow => {
    flow.intent = inferFlowIntent(flow);
    flow.duration = (flow.endTime || flow.startTime) - flow.startTime;
  });
  
  return flows;
}

/**
 * Infer flow intent from actions
 */
function inferFlowIntent(flow) {
  const actionIntents = flow.actions.map(a => a.intent || '').join(' ');
  
  // Pattern matching
  if (actionIntents.includes('填写表单') && actionIntents.includes('提交')) {
    return '表单提交流程';
  }
  
  if (actionIntents.includes('创建新数据')) {
    return '创建数据流程';
  }
  
  if (actionIntents.includes('删除')) {
    return '删除数据流程';
  }
  
  if (actionIntents.includes('保存')) {
    return '编辑保存流程';
  }
  
  if (flow.actions.some(a => a.type === 'navigate')) {
    return '页面浏览';
  }
  
  return '用户交互';
}

/**
 * Enhance analysis with LLM
 */
async function enhanceWithLLM(analysis, llmClient) {
  const prompt = `分析以下浏览器操作记录，提取用户的测试意图和业务场景。

操作记录：
${JSON.stringify(analysis.actions.map(a => ({
  type: a.type,
  intent: a.intent,
  selector: a.selector,
  value: a.value,
})), null, 2)}

请提供：
1. 用户的测试意图（测试什么功能）
2. 识别到的业务场景
3. 测试步骤的业务描述
4. 建议的测试用例名称

以 JSON 格式返回：
{
  "testIntent": "测试意图描述",
  "businessScenario": "业务场景描述",
  "steps": [{"step": 1, "description": "业务描述"}],
  "suggestedTestName": "建议的测试用例名称"
}`;

  const response = await llmClient.complete(prompt, {
    temperature: 0.3,
    maxTokens: 2000,
  });
  
  try {
    return JSON.parse(response.content);
  } catch (e) {
    return {
      testIntent: '未能解析',
      businessScenario: response.content,
    };
  }
}

module.exports = {
  analyzeExploration,
  groupEvents,
  extractSemanticAction,
  identifyFlows,
};
