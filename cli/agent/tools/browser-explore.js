/**
 * Browser Explore
 * 
 * 捕获浏览器操作原始事件，记录用户交互轨迹。
 * 
 * 核心设计：
 * 1. Raw Event Capture - 原始事件捕获
 * 2. Context Collection - 上下文信息收集
 * 3. Screenshot & DOM - 截图和 DOM 状态
 * 4. Network Trace - 网络请求追踪
 * 
 * @module browser-explore
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

/**
 * Event types that we care about for test automation
 */
const TRACKABLE_EVENTS = [
  'click',
  'dblclick',
  'input',
  'change',
  'keydown',
  'submit',
  'focus',
  'blur',
  'mousedown',
  'mouseup',
  'dragstart',
  'drop',
];

/**
 * Create browser exploration session
 * 
 * @param {Object} options
 * @param {string} options.url - Starting URL
 * @param {string} options.outputDir - Directory to save exploration data
 * @param {boolean} options.headless - Run in headless mode
 * @param {number} options.timeout - Session timeout in ms
 * @returns {Promise<Object>} Exploration session result
 */
async function exploreBrowser({
  url,
  outputDir,
  headless = false,
  timeout = 15 * 60 * 1000, // 15 minutes
}) {
  const sessionId = `explore-${Date.now()}`;
  const sessionDir = path.join(outputDir, sessionId);
  
  await fs.promises.mkdir(sessionDir, { recursive: true });
  
  const events = [];
  const screenshots = [];
  const networkRequests = [];
  const consoleMessages = [];
  
  let browser;
  let context;
  let page;
  
  try {
    // Launch browser
    browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
      ],
    });
    
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: {
        dir: sessionDir,
        size: { width: 1280, height: 720 },
      },
    });
    
    page = await context.newPage();
    
    // Track console messages
    page.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });
    
    // Track network requests
    page.on('request', (request) => {
      const url = request.url();
      // Filter out static assets
      if (!url.match(/\.(png|jpg|jpeg|gif|svg|css|woff|woff2|ttf|ico)$/i)) {
        networkRequests.push({
          method: request.method(),
          url: url,
          headers: request.headers(),
          postData: request.postData(),
          timestamp: Date.now(),
          resourceType: request.resourceType(),
        });
      }
    });
    
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.match(/\.(png|jpg|jpeg|gif|svg|css|woff|woff2|ttf|ico)$/i)) {
        const request = networkRequests.find(
          (r) => r.url === url && r.timestamp > Date.now() - 5000
        );
        if (request) {
          request.status = response.status();
          request.statusText = response.statusText();
          try {
            request.responseHeaders = response.headers();
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('json') || contentType.includes('text')) {
              request.responseBody = await response.text();
            }
          } catch (e) {
            // Ignore response body errors
          }
        }
      }
    });
    
    // Inject event tracking script
    await page.addInitScript(() => {
      window.__opentestEvents = [];
      window.__opentestEventId = 0;
      
      // Helper to get element selector
      function getElementSelector(element) {
        if (!element) return null;
        
        // Try ID first
        if (element.id) {
          return `#${element.id}`;
        }
        
        // Try data-testid
        if (element.dataset.testid) {
          return `[data-testid="${element.dataset.testid}"]`;
        }
        
        // Try aria-label
        if (element.getAttribute('aria-label')) {
          return `[aria-label="${element.getAttribute('aria-label')}"]`;
        }
        
        // Try name attribute for form elements
        if (element.name) {
          return `[name="${element.name}"]`;
        }
        
        // Build path with classes
        let selector = element.tagName.toLowerCase();
        if (element.className && typeof element.className === 'string') {
          const classes = element.className.trim().split(/\s+/).slice(0, 3);
          if (classes.length) {
            selector += '.' + classes.join('.');
          }
        }
        
        // Add text content for buttons and links
        if (['BUTTON', 'A'].includes(element.tagName)) {
          const text = element.textContent.trim().substring(0, 30);
          if (text) {
            return `${selector}:has-text("${text}")`;
          }
        }
        
        return selector;
      }
      
      // Helper to get element context
      function getElementContext(element) {
        if (!element) return {};
        
        return {
          tagName: element.tagName,
          type: element.type,
          value: element.value,
          textContent: element.textContent?.trim().substring(0, 100),
          innerText: element.innerText?.trim().substring(0, 100),
          placeholder: element.placeholder,
          href: element.href,
          src: element.src,
          alt: element.alt,
          title: element.title,
          ariaLabel: element.getAttribute('aria-label'),
          role: element.getAttribute('role'),
          className: element.className,
          id: element.id,
          name: element.name,
          dataset: { ...element.dataset },
        };
      }
      
      // Track events
      const trackEvent = (eventType, event) => {
        const eventData = {
          id: ++window.__opentestEventId,
          type: eventType,
          timestamp: Date.now(),
          url: window.location.href,
          selector: getElementSelector(event.target),
          context: getElementContext(event.target),
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        };
        
        // Add event-specific data
        if (eventType === 'click' || eventType === 'dblclick') {
          eventData.coordinates = {
            x: event.clientX,
            y: event.clientY,
          };
        }
        
        if (eventType === 'input' || eventType === 'change') {
          eventData.value = event.target.value;
        }
        
        if (eventType === 'keydown') {
          eventData.key = event.key;
          eventData.code = event.code;
          eventData.ctrlKey = event.ctrlKey;
          eventData.shiftKey = event.shiftKey;
          eventData.altKey = event.altKey;
        }
        
        window.__opentestEvents.push(eventData);
      };
      
      // Register event listeners
      const eventTypes = [
        'click',
        'dblclick',
        'input',
        'change',
        'keydown',
        'submit',
        'focus',
        'blur',
      ];
      
      eventTypes.forEach((type) => {
        document.addEventListener(type, (e) => trackEvent(type, e), true);
      });
      
      // Track navigation
      let lastUrl = window.location.href;
      setInterval(() => {
        if (window.location.href !== lastUrl) {
          window.__opentestEvents.push({
            id: ++window.__opentestEventId,
            type: 'navigation',
            timestamp: Date.now(),
            url: window.location.href,
            from: lastUrl,
          });
          lastUrl = window.location.href;
        }
      }, 500);
    });
    
    // Navigate to starting URL
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Wait for user to complete exploration or timeout
    const startTime = Date.now();
    let eventCount = 0;
    
    // Periodically collect events and take screenshots
    const collectInterval = setInterval(async () => {
      try {
        // Collect events from browser
        const newEvents = await page.evaluate(() => {
          const events = window.__opentestEvents || [];
          window.__opentestEvents = [];
          return events;
        });
        
        if (newEvents.length > 0) {
          events.push(...newEvents);
          eventCount = events.length;
          
          // Take screenshot after significant events
          const lastEvent = newEvents[newEvents.length - 1];
          if (['click', 'submit', 'navigation'].includes(lastEvent.type)) {
            const screenshotPath = path.join(
              sessionDir,
              `screenshot-${lastEvent.id}.png`
            );
            await page.screenshot({ path: screenshotPath, fullPage: false });
            screenshots.push({
              eventId: lastEvent.id,
              path: screenshotPath,
              timestamp: Date.now(),
            });
          }
        }
        
        // Check timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(collectInterval);
        }
      } catch (e) {
        // Page might be closed
        clearInterval(collectInterval);
      }
    }, 1000);
    
    // Wait for page to be closed (user closes browser)
    await page.waitForEvent('close', { timeout }).catch(() => {
      // Timeout is expected
    });
    
    clearInterval(collectInterval);
    
    // Collect any remaining events
    try {
      const remainingEvents = await page.evaluate(() => {
        return window.__opentestEvents || [];
      });
      events.push(...remainingEvents);
    } catch (e) {
      // Page already closed
    }
    
  } finally {
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
  }
  
  // Save session data
  const sessionData = {
    sessionId,
    startUrl: url,
    timestamp: Date.now(),
    duration: Date.now() - Date.now(),
    events,
    screenshots,
    networkRequests,
    consoleMessages,
  };
  
  const sessionFile = path.join(sessionDir, 'session.json');
  await fs.promises.writeFile(
    sessionFile,
    JSON.stringify(sessionData, null, 2),
    'utf8'
  );
  
  // Save events separately for easier processing
  const eventsFile = path.join(sessionDir, 'events.json');
  await fs.promises.writeFile(
    eventsFile,
    JSON.stringify(events, null, 2),
    'utf8'
  );
  
  return {
    sessionId,
    sessionDir,
    sessionFile,
    eventsFile,
    eventCount: events.length,
    screenshotCount: screenshots.length,
    networkRequestCount: networkRequests.length,
  };
}

module.exports = {
  exploreBrowser,
  TRACKABLE_EVENTS,
};
