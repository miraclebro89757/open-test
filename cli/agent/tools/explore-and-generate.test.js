/**
 * Tests for Explore and Generate
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { groupEvents, extractSemanticAction } = require('./semantic-action');
const { optimizeSelector, extractTestData, generatePlaywrightScript } = require('./script-generator');

// Test groupEvents
test('groupEvents should group related events', () => {
  const events = [
    { id: 1, type: 'click', selector: '.btn', timestamp: 1000 },
    { id: 2, type: 'input', selector: '#name', timestamp: 1100, value: 'test' },
    { id: 3, type: 'input', selector: '#email', timestamp: 1200, value: 'test@example.com' },
    { id: 4, type: 'click', selector: '.submit', timestamp: 5000 },
  ];
  
  const groups = groupEvents(events);
  
  // First 3 events should be grouped (within 2 seconds)
  assert.equal(groups.length, 2);
  assert.equal(groups[0].events.length, 3);
  assert.equal(groups[1].events.length, 1);
});

// Test extractSemanticAction for navigation
test('extractSemanticAction should identify navigation', () => {
  const group = {
    events: [{
      id: 1,
      type: 'navigation',
      url: 'https://example.com/dashboard',
      from: 'https://example.com/',
      timestamp: 1000,
    }],
  };
  
  const action = extractSemanticAction(group);
  
  assert.equal(action.type, 'navigate');
  assert.equal(action.intent, '导航到新页面');
  assert.equal(action.target, 'https://example.com/dashboard');
});

// Test extractSemanticAction for button click
test('extractSemanticAction should identify button clicks', () => {
  const group = {
    events: [{
      id: 1,
      type: 'click',
      selector: 'button.submit',
      timestamp: 1000,
      context: {
        tagName: 'BUTTON',
        textContent: '提交表单',
        role: 'button',
      },
    }],
  };
  
  const action = extractSemanticAction(group);
  
  assert.equal(action.type, 'click');
  assert.equal(action.intent, '提交表单');
});

// Test extractSemanticAction for form filling
test('extractSemanticAction should identify form filling', () => {
  const group = {
    events: [
      {
        id: 1,
        type: 'input',
        selector: '#name',
        value: 'John',
        timestamp: 1000,
        context: { name: 'name', placeholder: 'Name' },
      },
      {
        id: 2,
        type: 'input',
        selector: '#email',
        value: 'john@example.com',
        timestamp: 1100,
        context: { name: 'email', placeholder: 'Email' },
      },
    ],
  };
  
  const action = extractSemanticAction(group);
  
  assert.equal(action.type, 'form-fill');
  assert.equal(action.intent, '填写表单');
  assert.equal(action.fields.length, 2);
});

// Test optimizeSelector - prefer data-testid
test('optimizeSelector should prefer data-testid', () => {
  const selector = 'button.primary';
  const context = {
    dataset: { testid: 'submit-button' },
    id: 'btn1',
    ariaLabel: 'Submit',
  };
  
  const optimized = optimizeSelector(selector, context);
  
  assert.equal(optimized, '[data-testid="submit-button"]');
});

// Test optimizeSelector - prefer aria-label when no testid
test('optimizeSelector should prefer aria-label', () => {
  const selector = 'button.primary';
  const context = {
    id: 'btn1',
    ariaLabel: 'Submit Form',
  };
  
  const optimized = optimizeSelector(selector, context);
  
  assert.equal(optimized, '[aria-label="Submit Form"]');
});

// Test optimizeSelector - use role for semantic elements
test('optimizeSelector should use role + text', () => {
  const selector = 'button.primary';
  const context = {
    role: 'button',
    textContent: 'Submit',
  };
  
  const optimized = optimizeSelector(selector, context);
  
  assert.equal(optimized, 'role=button[name="Submit"]');
});

// Test extractTestData
test('extractTestData should extract input values', () => {
  const actions = [
    {
      type: 'input',
      value: 'John Doe',
      context: { name: 'userName', placeholder: 'User Name' },
    },
    {
      type: 'input',
      value: 'john@example.com',
      context: { name: 'email' },
    },
  ];
  
  const testData = extractTestData(actions);
  
  assert.equal(testData.userName, 'John Doe');
  assert.equal(testData.email, 'john@example.com');
});

// Test extractTestData from form-fill
test('extractTestData should extract from form-fill actions', () => {
  const actions = [
    {
      type: 'form-fill',
      fields: [
        { name: 'firstName', value: 'John' },
        { name: 'lastName', value: 'Doe' },
      ],
    },
  ];
  
  const testData = extractTestData(actions);
  
  assert.equal(testData.firstName, 'John');
  assert.equal(testData.lastName, 'Doe');
});

// Test generatePlaywrightScript - basic script generation
test('generatePlaywrightScript should generate basic test', () => {
  const analysis = {
    source: 'rules',
    flows: [],
    actions: [
      {
        type: 'navigate',
        target: 'https://example.com',
        intent: '导航到首页',
        timestamp: 1000,
      },
      {
        type: 'click',
        selector: '#login',
        intent: '点击登录按钮',
        context: { tagName: 'BUTTON', textContent: 'Login' },
        timestamp: 2000,
      },
    ],
  };
  
  const result = generatePlaywrightScript(analysis, {
    testName: 'test_login',
  });
  
  assert.ok(result.script.includes("import { test, expect } from '@playwright/test';"));
  assert.ok(result.script.includes("test('test_login'"));
  assert.ok(result.script.includes("await page.goto('https://example.com');"));
  assert.ok(result.script.includes("await page.click('#login');"));
});

// Test generatePlaywrightScript - with test data
test('generatePlaywrightScript should parameterize test data', () => {
  const analysis = {
    source: 'rules',
    flows: [],
    actions: [
      {
        type: 'input',
        selector: '#username',
        value: 'testuser',
        context: { name: 'username' },
        intent: '输入用户名',
        timestamp: 1000,
      },
    ],
  };
  
  const result = generatePlaywrightScript(analysis, {
    testName: 'test_login',
    parameterizeData: true,
  });
  
  assert.ok(result.script.includes('const testData = {'));
  assert.ok(result.script.includes('username:'));
  assert.ok(result.script.includes('testData.username'));
  assert.equal(result.testData.username, 'testuser');
});

// Test generatePlaywrightScript - with flows
test('generatePlaywrightScript should handle flows', () => {
  const analysis = {
    source: 'rules',
    flows: [
      {
        id: 'flow-1',
        intent: '用户登录流程',
        actions: [
          {
            type: 'navigate',
            target: 'https://example.com/login',
            intent: '进入登录页',
          },
          {
            type: 'input',
            selector: '#username',
            value: 'test',
            context: { name: 'username' },
            intent: '输入用户名',
          },
        ],
      },
    ],
    actions: [],
  };
  
  const result = generatePlaywrightScript(analysis);
  
  assert.ok(result.script.includes('// 用户登录流程'));
  assert.ok(result.metadata.flowCount === 1);
});

// Test generatePlaywrightScript - with AI enhancement
test('generatePlaywrightScript should use AI-enhanced info', () => {
  const analysis = {
    source: 'ai',
    aiEnhanced: {
      testIntent: '测试用户登录功能',
      suggestedTestName: 'test_user_login',
    },
    flows: [],
    actions: [
      {
        type: 'click',
        selector: '#login',
        intent: '点击登录',
        context: {},
      },
    ],
  };
  
  const result = generatePlaywrightScript(analysis);
  
  assert.equal(result.testName, 'test_user_login');
  assert.ok(result.script.includes('测试用户登录功能'));
});

// Test generatePlaywrightScript - should throw on empty analysis
test('generatePlaywrightScript should throw on empty analysis', () => {
  const analysis = {
    source: 'rules',
    flows: [],
    actions: [],
  };
  
  assert.throws(() => {
    generatePlaywrightScript(analysis);
  }, /No actions found/);
});
