'use strict';

const { resolveLLMConfig, isUsableConfig } = require('../../llm/config-store');
const { completeWithFailover } = require('../../llm/adapter');

/**
 * Build a chat client from the resolved LLM profiles, reusing the same
 * failover ordering the agent itself runs on.
 *
 * This is the SINGLE source of LLM configuration for all OpenTest features.
 * Once configured, all features (explore, analyze, points, cases, etc.) 
 * automatically use this configuration unless explicitly overridden.
 *
 * Configuration priority:
 * 1. Explicit overrides (passed as parameters)
 * 2. Project config (opentest.config.json)
 * 3. User config (~/.opentest/models.json)
 * 4. Environment variables
 *
 * Returns null when no profile is usable so callers can fall back to rule-based
 * analysis. It never invents a client: an unconfigured machine gets null, not a
 * stub that silently pretends a model answered.
 *
 * @param {Object} context - Context options
 * @param {string} context.cwd - Current working directory
 * @param {Object} context.env - Environment variables
 * @param {Object} context.overrides - Explicit overrides (provider, model, apiKey, etc.)
 * @returns {Promise<Object|null>} LLM client or null if not configured
 */
async function createLLMClient(context = {}) {
  let resolved;
  try {
    // Resolve LLM configuration from all sources
    // This automatically uses project/user config if available
    resolved = resolveLLMConfig({
      cwd: context.cwd || process.cwd(),
      env: context.env || process.env,
      overrides: context.overrides || null,
    });
  } catch (error) {
    // LLM not configured, return null for graceful degradation
    return null;
  }

  const chain = (resolved.chain || []).filter(
    (entry) => entry && entry.config && isUsableConfig(entry.config)
  );
  
  if (!chain.length) {
    // No usable profiles, return null
    return null;
  }

  return {
    activeProfile: resolved.activeProfile,
    config: resolved.config,
    
    /**
     * Chat-style completion (multiple messages)
     */
    async chat(messages, options = {}) {
      const systemPrompt = messages.find((message) => message.role === 'system');
      const prompt = messages
        .filter((message) => message.role !== 'system')
        .map((message) => message.content)
        .join('\n\n');
      
      try {
        const result = await completeWithFailover(chain, prompt, {
          ...options,
          systemPrompt,
        });
        return result.content;
      } catch (error) {
        // LLM call failed, let caller handle fallback
        throw new Error(`LLM call failed: ${error.message}`);
      }
    },
    
    /**
     * Simple text completion
     */
    async complete(prompt, options = {}) {
      try {
        const result = await completeWithFailover(chain, prompt, options);
        return {
          content: result.content,
          model: result.model,
          provider: result.provider,
        };
      } catch (error) {
        // LLM call failed, let caller handle fallback
        throw new Error(`LLM call failed: ${error.message}`);
      }
    },
  };
}

module.exports = { createLLMClient };