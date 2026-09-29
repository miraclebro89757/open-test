/**
 * 3-Layer Step Expansion Engine
 * 三层人类可读展开器 - 将抽象测试点展开为人类可执行步骤
 * 
 * 核心职责:
 * 1. Intent Layer (目标层): 说明本步骤的业务意图
 * 2. Human Instruction Layer (动作层): 给人类测试员的大白话操作指南
 * 3. Expected Outcome Layer (预期层): 人类肉眼可识别的视觉反馈与状态变化
 * 
 * 严格禁止: 模糊词汇如"有效数据"、"正常响应"、"适当信息"
 */

const { getDriver } = require('../db/neo4j');

/**
 * UI Element Locator Generator
 * UI 元素定位器生成器
 */
class LocatorGenerator {
  /**
   * Generate locators for common UI patterns
   * @param {string} action - Action type (click, input, verify)
   * @param {string} element - Element description
   * @returns {Object} Locator specification
   */
  generate(action, element) {
    const patterns = {
      // 按钮定位
      'submit': {
        visual_anchor: '页面右下角绿色【提交】按钮',
        dom_selector: 'button#submit-btn, button[type="submit"]',
        fallback_text: '提交'
      },
      'checkout': {
        visual_anchor: '购物车抽屉右下角绿色【去结算】按钮',
        dom_selector: 'button#submit-checkout-btn',
        fallback_text: '去结算'
      },
      'pay': {
        visual_anchor: '结算页底部橙色【立即支付】按钮',
        dom_selector: 'button#submit-payment-btn',
        fallback_text: '立即支付'
      },
      'confirm_pay': {
        visual_anchor: '短信验证弹窗底部【确认划扣并支付】按钮',
        dom_selector: 'button#verify-pay-btn',
        fallback_text: '确认划扣并支付'
      },
      'login': {
        visual_anchor: '登录表单底部蓝色【登录】按钮',
        dom_selector: 'button#login-btn',
        fallback_text: '登录'
      },
      
      // 输入框定位
      'sms_code': {
        visual_anchor: '短信验证码输入框（6个独立数字框）',
        dom_selector: 'input.sms-digit-input',
        placeholder: '请输入6位验证码'
      },
      'email': {
        visual_anchor: '邮箱输入框',
        dom_selector: 'input#email, input[name="email"]',
        placeholder: '请输入邮箱地址'
      },
      'password': {
        visual_anchor: '密码输入框',
        dom_selector: 'input#password, input[type="password"]',
        placeholder: '请输入密码'
      },
      
      // 导航元素
      'cart_icon': {
        visual_anchor: '页面顶部右上角购物车图标',
        dom_selector: 'button.cart-icon, a[href="/cart"]',
        badge: '显示商品数量角标'
      },
      'profile_menu': {
        visual_anchor: '页面右上角个人头像',
        dom_selector: 'button.profile-menu, div.user-avatar',
        dropdown: '点击展开个人菜单'
      },
      
      // 弹窗元素
      'modal_sms': {
        visual_anchor: '居中弹出的【短信二次验证码】半透明遮罩弹窗',
        dom_selector: 'div#sms-modal, div.modal[data-type="sms"]',
        title: '安全二次验证'
      },
      'toast_success': {
        visual_anchor: '页面顶端绿色 Toast 提示条',
        dom_selector: 'div.toast.success, div[role="alert"].success',
        icon: '绿色勾选图标'
      }
    };

    // Match pattern or generate generic locator
    const matched = patterns[element] || this.generateGeneric(action, element);
    
    return matched;
  }

  /**
   * Generate generic locator for unknown elements
   * @param {string} action - Action type
   * @param {string} element - Element description
   * @returns {Object} Generic locator
   */
  generateGeneric(action, element) {
    return {
      visual_anchor: element,
      dom_selector: `[data-testid="${element}"]`,
      note: '需补充具体定位器'
    };
  }
}

/**
 * Step Expansion Engine
 * 步骤展开引擎 - 核心三层展开逻辑
 */
class StepExpander {
  constructor() {
    this.locatorGen = new LocatorGenerator();
  }

  /**
   * Expand a test point into detailed human-executable steps
   * @param {Object} testPoint - Test point from Neo4j
   * @param {Object} requirement - Parent requirement
   * @param {Object} fixtures - Resolved fixtures
   * @returns {Array} Expanded steps with 3-layer structure
   */
  expandTestPoint(testPoint, requirement, fixtures) {
    const angle = testPoint.angle;
    const title = testPoint.title || '';
    const description = testPoint.description || '';

    // Determine step expansion strategy by angle
    switch (angle) {
      case 'Functional':
        return this.expandFunctionalSteps(testPoint, requirement, fixtures);
      
      case 'Exception':
        return this.expandExceptionSteps(testPoint, requirement, fixtures);
      
      case 'Security':
        return this.expandSecuritySteps(testPoint, requirement, fixtures);
      
      case 'Performance':
        return this.expandPerformanceSteps(testPoint, requirement, fixtures);
      
      default:
        return this.expandGenericSteps(testPoint, requirement, fixtures);
    }
  }

  /**
   * Expand Functional dimension steps (正向功能流程)
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandFunctionalSteps(testPoint, requirement, fixtures) {
    const scenario = fixtures.scenario;

    // Scenario-specific expansion templates
    if (scenario === 'payment_with_sms') {
      return this.expandPaymentWithSmsSteps(testPoint, requirement, fixtures);
    }

    if (scenario === 'login') {
      return this.expandLoginSteps(testPoint, requirement, fixtures);
    }

    // Generic functional flow
    return this.expandGenericFunctionalSteps(testPoint, requirement, fixtures);
  }

  /**
   * Expand payment with SMS 2FA scenario
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandPaymentWithSmsSteps(testPoint, requirement, fixtures) {
    const account = fixtures.test_account;
    const payload = fixtures.test_payload;

    return [
      {
        step_no: 1,
        intent: '进入结算台并提交订单',
        human_instruction: `在页面顶部点击【购物车图标】，在展开的抽屉中点击右下角绿色【去结算】按钮进入 /checkout 页面，核对商品为 ${payload.item_name || payload.item_id}，金额为 ¥${payload.item_price} 后，点击页面底部的橙色【立即支付】按钮`,
        locators: this.locatorGen.generate('click', 'checkout'),
        expected_outcome: `页面居中弹出带有半透明遮罩的【短信二次验证码】弹窗，弹窗标题显示：'安全二次验证'，弹窗内文案显示：'验证码已发送至 ${payload.expected_sms_phone_masked || this.maskPhone(account.bound_phone)}'`
      },
      {
        step_no: 2,
        intent: '输入合法的短信验证码并核验',
        human_instruction: `在弹窗中的 6 个独立输入框中依次输入测试验证码 '${payload.mock_sms_code}'（注意：这是测试环境的固定桩码，不会真实发送短信），输入完毕后点击弹窗底部的【确认划扣并支付】按钮`,
        locators: this.locatorGen.generate('input', 'sms_code'),
        expected_outcome: `弹窗自动淡出关闭；页面顶端弹出绿色 Toast 提示条，显示文字：'支付成功！'；页面在 1-2 秒内自动重定向至订单完成凭证页 /orders/success，显示订单号和绿色勾选图标`
      },
      {
        step_no: 3,
        intent: '核对最终数据一致性',
        human_instruction: `点击页面右上角个人头像，在下拉菜单中选择【我的钱包】，进入钱包页面后点击页面上的【刷新】按钮（或按 F5 键刷新浏览器）`,
        locators: {
          visual_anchor: '个人中心菜单 -> 我的钱包',
          dom_selector: 'button.profile-menu, a[href="/wallet"]'
        },
        expected_outcome: `钱包页面顶部【账户可用余额】显示为 ¥${this.calculateBalance(account.initial_balance, payload.item_price)}；页面下方【账单明细】列表的第一行（最新一笔）显示：时间为当前时间、类型为'支出'、金额为 -¥${payload.item_price}、备注为'购买 ${payload.item_name || payload.item_id}'`
      }
    ];
  }

  /**
   * Expand login scenario steps
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandLoginSteps(testPoint, requirement, fixtures) {
    const account = fixtures.test_account;
    const payload = fixtures.test_payload;

    return [
      {
        step_no: 1,
        intent: '导航至登录页面',
        human_instruction: `在浏览器地址栏输入 ${fixtures.environment.base_url}/login 并回车，等待页面完全加载`,
        locators: {
          visual_anchor: '登录表单页面',
          dom_selector: 'form#login-form'
        },
        expected_outcome: `页面显示登录表单，包含邮箱输入框、密码输入框和蓝色【登录】按钮；页面标题为'用户登录'`
      },
      {
        step_no: 2,
        intent: '输入测试账号凭证',
        human_instruction: `在邮箱输入框中输入 ${account.username}，在密码输入框中输入 ${account.password}，点击蓝色【登录】按钮`,
        locators: this.locatorGen.generate('click', 'login'),
        expected_outcome: `页面显示加载动画（按钮文字变为'登录中...'），2-3 秒后页面重定向至 ${payload.expected_redirect || '/dashboard'}，顶部导航栏右侧显示用户头像和用户名 ${account.username.split('@')[0]}`
      }
    ];
  }

  /**
   * Expand generic functional steps
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandGenericFunctionalSteps(testPoint, requirement, fixtures) {
    const givenWhenThen = requirement.givenWhenThen || { given: [], when: [], then: [] };

    const steps = [];
    let stepNo = 1;

    // If we have When actions, expand them
    if (givenWhenThen.when && givenWhenThen.when.length > 0) {
      givenWhenThen.when.forEach((when, index) => {
        const correspondingThen = givenWhenThen.then[index] || '操作完成';
        
        steps.push({
          step_no: stepNo++,
          intent: this.extractIntent(when),
          human_instruction: this.makeHumanReadable(when, fixtures),
          locators: {
            visual_anchor: this.extractVisualCue(when),
            dom_selector: this.guessSelector(when)
          },
          expected_outcome: this.makeHumanReadable(correspondingThen, fixtures)
        });
      });
    }

    // Fallback: single generic step
    if (steps.length === 0) {
      steps.push({
        step_no: 1,
        intent: testPoint.title || '执行测试操作',
        human_instruction: `执行测试场景：${testPoint.description || requirement.title}。需要补充具体操作步骤。`,
        locators: {
          visual_anchor: '待补充',
          dom_selector: '[data-testid="test-action"]'
        },
        expected_outcome: '需要补充具体的预期结果，包括：UI 视觉反馈、API 响应状态、数据变更明细'
      });
    }

    return steps;
  }

  /**
   * Expand Exception dimension steps (异常场景)
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandExceptionSteps(testPoint, requirement, fixtures) {
    const title = (testPoint.title || '').toLowerCase();
    const description = (testPoint.description || '').toLowerCase();

    // Detect exception type
    if (title.includes('余额不足') || title.includes('insufficient balance')) {
      return this.expandInsufficientBalanceSteps(testPoint, requirement, fixtures);
    }

    if (title.includes('验证码错误') || title.includes('invalid code')) {
      return this.expandInvalidSmsCodeSteps(testPoint, requirement, fixtures);
    }

    if (title.includes('超时') || title.includes('timeout')) {
      return this.expandTimeoutSteps(testPoint, requirement, fixtures);
    }

    // Generic exception handling
    return [{
      step_no: 1,
      intent: '触发异常场景',
      human_instruction: `执行异常测试：${testPoint.description || testPoint.title}`,
      locators: {
        visual_anchor: '待补充',
        dom_selector: '[data-testid="error-trigger"]'
      },
      expected_outcome: `系统应显示明确的错误提示信息，并阻止操作继续执行。需补充具体的错误文案、错误码和 UI 表现。`
    }];
  }

  /**
   * Expand insufficient balance exception
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandInsufficientBalanceSteps(testPoint, requirement, fixtures) {
    return [
      {
        step_no: 1,
        intent: '使用余额不足账号尝试支付',
        human_instruction: `确保当前登录账号为余额不足的测试账号（当前余额 ¥${fixtures.test_account.initial_balance}），在购物车中添加价格为 ¥${fixtures.test_payload.item_price || '9999.00'} 的商品，进入结算页并点击【立即支付】`,
        locators: this.locatorGen.generate('click', 'pay'),
        expected_outcome: `页面不发生跳转或弹窗，而是在支付按钮上方显示红色错误提示条：'账户余额不足，请先充值'或'当前余额不足以完成支付（需要 ¥XXX，可用 ¥${fixtures.test_account.initial_balance}）'；支付按钮变为灰色不可点击状态`
      },
      {
        step_no: 2,
        intent: '验证数据未发生变更',
        human_instruction: `打开新标签页访问 /wallet 查看钱包余额，刷新页面`,
        locators: {
          visual_anchor: '钱包余额区域',
          dom_selector: 'div.wallet-balance'
        },
        expected_outcome: `账户余额保持不变，仍为 ¥${fixtures.test_account.initial_balance}；账单明细中没有新增扣款记录；订单列表中没有生成新订单`
      }
    ];
  }

  /**
   * Expand invalid SMS code exception
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandInvalidSmsCodeSteps(testPoint, requirement, fixtures) {
    return [
      {
        step_no: 1,
        intent: '触发短信验证并输入错误验证码',
        human_instruction: `按照正常支付流程进入短信验证弹窗后，故意输入错误的验证码 '000000'（而非正确的测试码 '${fixtures.test_payload.mock_sms_code}'），然后点击【确认划扣并支付】`,
        locators: this.locatorGen.generate('input', 'sms_code'),
        expected_outcome: `弹窗不关闭，验证码输入框上方出现红色错误提示：'验证码错误，请重新输入'；输入框边框变为红色；输入框自动清空，允许重新输入；【确认划扣并支付】按钮保持可点击状态`
      },
      {
        step_no: 2,
        intent: '验证连续错误处理机制',
        human_instruction: `再次输入错误验证码并提交，重复此操作 3 次`,
        locators: this.locatorGen.generate('input', 'sms_code'),
        expected_outcome: `第 3 次错误后，弹窗显示更严厉的提示：'验证码已连续输入错误 3 次，请 60 秒后重试'或'为保护账户安全，已临时锁定支付功能'；验证码输入框变为灰色不可输入；按钮变为灰色不可点击`
      }
    ];
  }

  /**
   * Expand timeout exception steps
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandTimeoutSteps(testPoint, requirement, fixtures) {
    return [{
      step_no: 1,
      intent: '模拟网络超时场景',
      human_instruction: `打开浏览器开发者工具（F12），切换到 Network 标签页，选择 'Slow 3G' 网络模拟；然后执行正常的支付操作`,
      locators: {
        visual_anchor: '开发者工具 Network 面板',
        dom_selector: 'button#submit-payment-btn'
      },
      expected_outcome: `操作按钮显示加载动画（旋转图标），等待 30 秒后显示超时提示：'网络请求超时，请检查网络连接后重试'；页面提供【重新尝试】按钮；用户数据和订单状态保持不变，未发生扣款`
    }];
  }

  /**
   * Expand Security dimension steps (安全测试)
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandSecuritySteps(testPoint, requirement, fixtures) {
    const title = (testPoint.title || '').toLowerCase();

    if (title.includes('认证') || title.includes('auth')) {
      return this.expandAuthSecuritySteps(testPoint, requirement, fixtures);
    }

    if (title.includes('越权') || title.includes('authorization')) {
      return this.expandAuthorizationSteps(testPoint, requirement, fixtures);
    }

    if (title.includes('注入') || title.includes('injection') || title.includes('xss')) {
      return this.expandInjectionSteps(testPoint, requirement, fixtures);
    }

    // Generic security test
    return [{
      step_no: 1,
      intent: '执行安全测试',
      human_instruction: `测试安全场景：${testPoint.description || testPoint.title}`,
      locators: {
        visual_anchor: '待补充',
        dom_selector: '[data-testid="security-test"]'
      },
      expected_outcome: '系统应正确阻止未授权操作，并返回明确的错误信息（如 401 Unauthorized 或 403 Forbidden）'
    }];
  }

  /**
   * Expand authentication security steps
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandAuthSecuritySteps(testPoint, requirement, fixtures) {
    return [
      {
        step_no: 1,
        intent: '在未登录状态下访问受保护页面',
        human_instruction: `打开浏览器无痕模式（Ctrl+Shift+N 或 Cmd+Shift+N），在地址栏直接输入 ${fixtures.environment.base_url}/checkout 或 ${fixtures.environment.base_url}/wallet`,
        locators: {
          visual_anchor: '浏览器地址栏',
          dom_selector: 'body'
        },
        expected_outcome: `页面不显示目标内容，而是自动重定向至登录页 /login，URL 参数中包含返回地址 ?redirect=/checkout；登录页顶部显示提示信息：'请先登录以继续访问'`
      }
    ];
  }

  /**
   * Expand authorization security steps
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandAuthorizationSteps(testPoint, requirement, fixtures) {
    return [{
      step_no: 1,
      intent: '尝试访问其他用户的资源',
      human_instruction: `登录账号 ${fixtures.test_account.username} 后，手动修改浏览器地址栏 URL，将用户 ID 改为其他值（如 /users/999/orders），尝试访问他人订单`,
      locators: {
        visual_anchor: '浏览器地址栏',
        dom_selector: 'body'
      },
      expected_outcome: `页面显示 403 错误页面，文案为：'无权访问该资源'或'您没有权限查看此订单'；不泄露他人订单的任何信息（如订单号、金额、收货地址）`
    }];
  }

  /**
   * Expand injection security steps
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandInjectionSteps(testPoint, requirement, fixtures) {
    return [{
      step_no: 1,
      intent: '测试输入字段的注入防护',
      human_instruction: `在登录页的邮箱输入框中输入潜在恶意字符串 "<script>alert('XSS')</script>" 或 "' OR '1'='1"，然后提交表单`,
      locators: this.locatorGen.generate('input', 'email'),
      expected_outcome: `系统应正确转义或拒绝该输入，显示错误提示：'邮箱格式不正确'；页面不执行脚本代码（不弹出 alert 框）；数据库查询不受影响，返回正常的认证失败提示`
    }];
  }

  /**
   * Expand Performance dimension steps (性能测试)
   * @param {Object} testPoint - Test point
   * @param {Object} requirement - Requirement
   * @param {Object} fixtures - Fixtures
   * @returns {Array} Expanded steps
   */
  expandPerformanceSteps(testPoint, requirement, fixtures) {
    return [
      {
        step_no: 1,
        intent: '测量页面响应时间',
        human_instruction: `打开浏览器开发者工具（F12），切换到 Network 标签页，勾选 'Disable cache'；刷新页面或执行目标操作：${testPoint.description || requirement.title}`,
        locators: {
          visual_anchor: 'Network 面板',
          dom_selector: 'body'
        },
        expected_outcome: `在 Network 面板底部查看总加载时间：DOMContentLoaded 应 < 800ms，Load 应 < 2000ms；主要 API 请求（如 /api/checkout）响应时间应 < 500ms；页面无明显卡顿，用户可流畅操作`
      },
      {
        step_no: 2,
        intent: '验证并发场景下的性能表现',
        human_instruction: `使用浏览器多标签页（推荐 5 个标签页）同时执行相同操作，观察响应时间变化`,
        locators: {
          visual_anchor: '多标签页',
          dom_selector: 'body'
        },
        expected_outcome: `所有标签页均能在 3 秒内完成操作；不出现 502/504 网关超时错误；服务端日志无异常报错；数据一致性保持正确（无重复扣款或订单）`
      }
    ];
  }

  /**
   * Helper: Calculate balance after deduction
   * @param {string} initial - Initial balance
   * @param {string} deduction - Amount to deduct
   * @returns {string} Remaining balance
   */
  calculateBalance(initial, deduction) {
    const result = parseFloat(initial) - parseFloat(deduction);
    return result.toFixed(2);
  }

  /**
   * Helper: Mask phone number
   * @param {string} phone - Phone number
   * @returns {string} Masked phone
   */
  maskPhone(phone) {
    if (!phone || phone.length < 11) return '***';
    return phone.substring(0, 3) + '****' + phone.substring(7);
  }

  /**
   * Helper: Extract intent from action description
   * @param {string} action - Action description
   * @returns {string} Intent
   */
  extractIntent(action) {
    // Remove common prefixes
    const cleaned = action
      .replace(/^(When|当|操作:)\s*/i, '')
      .replace(/^(User|用户)\s*/i, '');
    
    return cleaned;
  }

  /**
   * Helper: Make text human-readable
   * @param {string} text - Original text
   * @param {Object} fixtures - Fixtures for data substitution
   * @returns {string} Human-readable text
   */
  makeHumanReadable(text, fixtures) {
    // Substitute placeholders with concrete data
    let readable = text
      .replace(/\$\{username\}/g, fixtures.test_account.username)
      .replace(/\$\{password\}/g, fixtures.test_account.password)
      .replace(/\$\{balance\}/g, `¥${fixtures.test_account.initial_balance}`)
      .replace(/\$\{phone\}/g, fixtures.test_account.bound_phone);

    return readable;
  }

  /**
   * Helper: Extract visual cue from action
   * @param {string} action - Action description
   * @returns {string} Visual cue
   */
  extractVisualCue(action) {
    // Extract button names, links, etc.
    const buttonMatch = action.match(/点击[【"'](.+?)[】"']/);
    if (buttonMatch) return `【${buttonMatch[1]}】按钮`;

    const inputMatch = action.match(/输入[【"'](.+?)[】"']/);
    if (inputMatch) return `【${inputMatch[1]}】输入框`;

    return action;
  }

  /**
   * Helper: Guess DOM selector from action
   * @param {string} action - Action description
   * @returns {string} Guessed selector
   */
  guessSelector(action) {
    const lower = action.toLowerCase();
    
    if (lower.includes('登录')) return 'button#login-btn';
    if (lower.includes('提交')) return 'button[type="submit"]';
    if (lower.includes('支付')) return 'button#submit-payment-btn';
    if (lower.includes('购物车')) return 'button.cart-icon';
    
    return '[data-testid="action-button"]';
  }
}

module.exports = {
  StepExpander,
  LocatorGenerator
};
