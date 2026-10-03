'use strict';

const { resolveLLMConfig, isUsableConfig } = require('../../llm/config-store');
const { completeWithFailover } = require('../../llm/adapter');

/**
 * Build a chat client from the resolved LLM profiles, reusing the same
 * failover ordering the agent itself runs on.
 *
 * Returns null when no profile is usable so callers can fall back to rule-based
 * analysis. It never invents a client: an unconfigured machine gets null, not a
 * stub that silently pretends a model answered.
 */
function createLLMClient(context = {}) {
  let resolved;
  try {
    resolved = resolveLLMConfig({
      cwd: process.cwd(),
      env: process.env,
      ...context,
    });
  } catch {
    return null;
  }

  const chain = (resolved.chain || []).filter(
    (entry) => entry && entry.config && isUsableConfig(entry.config)
  );
  if (!chain.length) return null;

  return {
    activeProfile: resolved.activeProfile,
    async chat(messages, options = {}) {
      const systemPrompt = messages.find((message) => message.role === 'system');
      const prompt = messages
        .filter((message) => message.role !== 'system')
        .map((message) => message.content)
        .join('\n\n');
      const result = await completeWithFailover(chain, prompt, {
        ...options,
        systemPrompt,
      });
      return result.content;
    },
  };
}

module.exports = { createLLMClient };