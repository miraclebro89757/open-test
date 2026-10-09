'use strict';

const { readPiModel } = require('../pi-config');
const { completeWithFailover } = require('../../llm/adapter');

/**
 * Chat client for tools that call the model directly (HAR analysis, explore).
 *
 * It uses the same model the Terminal Agent and Pi Web run on: the default
 * model in Pi's agent directory, with the provider's address and key taken
 * from the same models.json that Pi Web's model page edits. There is no second
 * configuration to keep in step.
 *
 * Returns null when that model cannot be called over an OpenAI-compatible HTTP
 * endpoint (nothing configured, a key that comes from a shell command, or a
 * provider with its own protocol), so callers fall back to rule-based analysis.
 * It never invents a client or pretends a model answered.
 *
 * @param {Object|string} [context]
 * @param {Object} [context.env] Environment, defaults to process.env
 * @param {string} [context.homeDir] Home directory override, for tests
 */
async function createLLMClient(context = {}) {
  const options = context && typeof context === 'object' ? context : {};
  const info = readPiModel({ env: options.env || process.env, homeDir: options.homeDir });
  if (!info.direct) return null;

  const config = { ...info.direct };
  const chain = [{ name: `${config.provider}/${config.model}`, config }];

  return {
    activeProfile: chain[0].name,
    config,

    /** Chat-style completion (multiple messages). */
    async chat(messages, callOptions = {}) {
      const systemPrompt = messages.find((message) => message.role === 'system');
      const prompt = messages
        .filter((message) => message.role !== 'system')
        .map((message) => message.content)
        .join('\n\n');
      try {
        const result = await completeWithFailover(chain, prompt, {
          ...callOptions,
          systemPrompt: systemPrompt ? systemPrompt.content : undefined,
        });
        return result.content;
      } catch (error) {
        throw new Error(`LLM call failed: ${error.message}`);
      }
    },

    /** Simple text completion. */
    async complete(prompt, callOptions = {}) {
      try {
        const result = await completeWithFailover(chain, prompt, callOptions);
        return {
          content: result.content,
          model: config.model,
          provider: result.provider,
        };
      } catch (error) {
        throw new Error(`LLM call failed: ${error.message}`);
      }
    },
  };
}

module.exports = { createLLMClient };
