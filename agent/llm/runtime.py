"""Chat model used by the test agent."""

from __future__ import annotations

from agent.llm.adapter import complete_with_failover
from agent.llm.config import ResolvedLLM, is_usable, mask_key, resolve_llm_config


class ChatResult:
    def __init__(self, content: str, profile: str):
        self.content = content
        self.profile = profile


class FailoverChatModel:
    def __init__(self, resolved: ResolvedLLM):
        self.resolved = resolved

    def invoke(self, prompt: str, system_prompt: str | None = None) -> ChatResult:
        if not isinstance(prompt, str):
            prompt = str(prompt)
        chain = [{"name": entry.name, "config": entry.config} for entry in self.resolved.chain]
        content, profile = complete_with_failover(
            chain,
            prompt,
            system_prompt=system_prompt,
            logger=_log_failover,
        )
        return ChatResult(content, profile)


def build_chat_model(model_override: str | None = None) -> FailoverChatModel:
    overrides = {"model": model_override} if model_override else None
    resolved = resolve_llm_config(overrides=overrides)
    _log_resolution(resolved)
    return FailoverChatModel(resolved)


def _log_resolution(resolved: ResolvedLLM) -> None:
    config = resolved.config
    print(
        "LLM active profile: "
        f"{resolved.active_profile} ({resolved.profile_source}) "
        f"provider={config.provider} model={config.model or '(empty)'} "
        f"key={mask_key(config.apiKey)}"
    )
    if not is_usable(config):
        print(
            "LLM config has no usable API key. "
            "Run: npx open-test config set --provider openrouter "
            "--api-key <key> --model deepseek/deepseek-r1:free"
        )


def _log_failover(event: dict) -> None:
    print(f"LLM failover: {event['from']} HTTP {event['status']} -> {event['to']}", flush=True)
