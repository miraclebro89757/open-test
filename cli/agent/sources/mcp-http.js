'use strict';

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return match ? headers[match] : null;
}

function parseSseJson(text) {
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      const payload = trimmed.slice(5).trim();
      if (payload && payload !== '[DONE]') return JSON.parse(payload);
    }
  }
  throw new Error('MCP did not return JSON');
}

function createMcpHttpClient(url, options = {}) {
  if (!url) throw new Error('An MCP address is required');
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('This environment cannot send an MCP request');
  let nextId = 1;
  let sessionId = '';

  async function send(payload, expectResult) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const nextSession = headerValue(response.headers, 'mcp-session-id');
    if (nextSession) sessionId = nextSession;
    if (!expectResult) return null;
    const type = headerValue(response.headers, 'content-type') || '';
    const body = type.includes('text/event-stream')
      ? parseSseJson(await response.text())
      : await response.json();
    if (body && body.error) {
      const message = body.error.message || JSON.stringify(body.error);
      throw new Error(message);
    }
    return body && Object.prototype.hasOwnProperty.call(body, 'result') ? body.result : body;
  }

  return {
    async initialize() {
      const result = await send({
        jsonrpc: '2.0',
        id: nextId,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'opentest', version: '1.0.0' },
        },
      }, true);
      nextId += 1;
      await send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, false);
      return result;
    },
    async request(method, params) {
      const id = nextId;
      nextId += 1;
      return send({ jsonrpc: '2.0', id, method, params: params || {} }, true);
    },
  };
}

module.exports = { createMcpHttpClient };
