"""Universal OpenAI-compatible adapter with a failover chain."""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from agent.llm.config import LLMConfig, is_placeholder_key, is_usable


TRANSIENT_STATUSES = {402, 408, 425, 429, 500, 502, 503, 504}


class ProviderRequestError(Exception):
    def __init__(self, message: str, status: int = 0, retryable: bool = False, provider: str = ""):
        super().__init__(message)
        self.status = status
        self.retryable = retryable
        self.provider = provider


def _transient(status: int, body: str) -> bool:
    if status in TRANSIENT_STATUSES:
        return True
    text = body or ""
    lowered = text.lower()
    return any(
        token in lowered
        for token in (
            "insufficient_quota",
            "insufficient quota",
            "rate limit",
            "too many requests",
            "overloaded",
            "temporarily unavailable",
        )
    )


def _headers(config: LLMConfig) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    key = config.apiKey or ""
    send_auth = config.provider != "ollama" or (key and key != "ollama-no-key-required")
    if send_auth and key:
        headers["Authorization"] = f"Bearer {key}"
    if config.provider == "openrouter":
        headers["HTTP-Referer"] = "https://github.com/miraclebro89757/open-test"
        headers["X-Title"] = "OpenTest QA Agent"
    return headers


def urllib_transport(config: LLMConfig, body: dict[str, Any], timeout_s: float) -> tuple[int, str]:
    endpoint = f"{config.baseUrl.rstrip('/')}/chat/completions"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers=_headers(config),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        return exc.code, raw
    except (TimeoutError, socket.timeout) as exc:
        raise ProviderRequestError(
            f"LLM provider [{config.provider}] timed out after {timeout_s}s",
            status=408,
            retryable=True,
            provider=config.provider,
        ) from exc
    except urllib.error.URLError as exc:
        raise ProviderRequestError(
            f"LLM provider [{config.provider}] request failed: {exc.reason}",
            status=0,
            retryable=True,
            provider=config.provider,
        ) from exc


def chat_complete(
    config: LLMConfig,
    messages: list[dict[str, str]],
    transport: Callable[[LLMConfig, dict[str, Any], float], tuple[int, str]] | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    timeout_ms: int | None = None,
) -> str:
    if not is_usable(config) or (config.provider != "ollama" and is_placeholder_key(config.apiKey)):
        raise ProviderRequestError(
            f"Profile provider [{config.provider or 'unknown'}] has no usable API key, base URL, or model",
            status=0,
            retryable=False,
            provider=config.provider,
        )

    payload = {
        "model": config.model,
        "messages": messages,
        "temperature": config.temperature if temperature is None else temperature,
        "max_tokens": config.maxTokens if max_tokens is None else max_tokens,
    }
    timeout_s = ((timeout_ms or config.timeoutMs or 30000)) / 1000
    sender = transport or urllib_transport
    status, text = sender(config, payload, timeout_s)
    if status < 200 or status >= 300:
        raise ProviderRequestError(
            f"LLM provider [{config.provider}] returned HTTP {status}: {text[:300]}",
            status=status,
            retryable=_transient(status, text),
            provider=config.provider,
        )
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProviderRequestError(
            f"LLM provider [{config.provider}] returned invalid JSON",
            status=status,
            retryable=True,
            provider=config.provider,
        ) from exc
    message = (data.get("choices") or [{}])[0].get("message") or {}
    content = message.get("content") or message.get("reasoning") or message.get("reasoning_content") or ""
    if not str(content).strip():
        raise ProviderRequestError(
            f"LLM provider [{config.provider}] returned an empty completion",
            status=status,
            retryable=True,
            provider=config.provider,
        )
    return content


def complete_with_failover(
    chain: list[dict[str, Any]],
    prompt: str,
    system_prompt: str | None = None,
    transport: Callable | None = None,
    retries_per_provider: int = 2,
    sleep=None,
    logger=None,
) -> tuple[str, str]:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    errors: list[str] = []

    for index, entry in enumerate(chain):
        config = entry["config"]
        name = entry["name"]
        if not is_usable(config):
            errors.append(f"{name}: skipped: api key, base URL, or model is not usable")
            continue
        attempt = 0
        while True:
            try:
                content = chat_complete(config, messages, transport=transport)
                return content, name
            except ProviderRequestError as exc:
                errors.append(f"{name}: {exc}")
                if exc.retryable and attempt < retries_per_provider:
                    attempt += 1
                    if sleep:
                        sleep(0.2)
                    continue
                if logger and index < len(chain) - 1:
                    logger(
                        {
                            "from": name,
                            "to": chain[index + 1]["name"],
                            "status": exc.status,
                        }
                    )
                break

    raise ProviderRequestError("All LLM providers failed. " + " | ".join(errors), status=0, retryable=False)


def ping(config: LLMConfig, transport: Callable | None = None, timeout_ms: int = 20000) -> dict[str, Any]:
    import time

    start = time.monotonic()
    try:
        content = chat_complete(
            config,
            [
                {"role": "system", "content": "Respond only with pong"},
                {"role": "user", "content": "ping"},
            ],
            transport=transport,
            temperature=0,
            max_tokens=16,
            timeout_ms=min(timeout_ms, config.timeoutMs or timeout_ms),
        )
        return {
            "ok": True,
            "latencyMs": int((time.monotonic() - start) * 1000),
            "status": 200,
            "message": f"HTTP 200{f' · {content.strip()[:80]}' if content else ''}",
        }
    except ProviderRequestError as exc:
        return {
            "ok": False,
            "latencyMs": int((time.monotonic() - start) * 1000),
            "status": exc.status,
            "message": str(exc),
        }
