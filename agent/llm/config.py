"""Resolve opentest.config.json the same way the CLI does."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


PROVIDERS = ["openrouter", "deepseek", "cc-switch", "ollama", "custom"]
DEFAULT_FAILOVER = ["deepseek-prod", "cc-switch-enterprise", "free-openrouter"]
SCHEMA_URL = (
    "https://raw.githubusercontent.com/miraclebro89757/open-test/main/schemas/llm-config.schema.json"
)

PRESETS: dict[str, dict[str, Any]] = {
    "openrouter": {
        "profile": "free-openrouter",
        "provider": "openrouter",
        "baseUrl": "https://openrouter.ai/api/v1",
        "model": "deepseek/deepseek-r1:free",
        "temperature": 0.2,
        "maxTokens": 4096,
        "timeoutMs": 45000,
        "description": "免费调试原型环境",
        "apiKey": "",
    },
    "deepseek": {
        "profile": "deepseek-prod",
        "provider": "deepseek",
        "baseUrl": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "temperature": 0.1,
        "maxTokens": 8192,
        "timeoutMs": 30000,
        "description": "生产级全量用例生成",
        "apiKey": "",
    },
    "cc-switch": {
        "profile": "cc-switch-enterprise",
        "provider": "cc-switch",
        "baseUrl": "https://api.ccswitch.com/v1",
        "model": "claude-3-5-sonnet-20241022",
        "temperature": 0.2,
        "maxTokens": 4096,
        "timeoutMs": 30000,
        "description": "企业中转聚合路由",
        "apiKey": "",
    },
    "ollama": {
        "profile": "local-ollama",
        "provider": "ollama",
        "baseUrl": "http://localhost:11434/v1",
        "model": "deepseek-r1:14b",
        "temperature": 0.1,
        "maxTokens": 4096,
        "timeoutMs": 60000,
        "description": "内网离线隐私环境",
        "apiKey": "ollama-no-key-required",
    },
    "custom": {
        "profile": "custom",
        "provider": "custom",
        "baseUrl": "",
        "model": "",
        "temperature": 0.2,
        "maxTokens": 4096,
        "timeoutMs": 30000,
        "description": "自定义 OpenAI 兼容端点",
        "apiKey": "",
    },
}

PROVIDER_ALIASES = {
    "openrouter": "openrouter",
    "open-router": "openrouter",
    "deepseek": "deepseek",
    "cc-switch": "cc-switch",
    "ccswitch": "cc-switch",
    "cc_switch": "cc-switch",
    "ollama": "ollama",
    "local": "ollama",
    "custom": "custom",
}

OPENAI_FALLBACK = {
    "provider": "custom",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "maxTokens": 4096,
    "timeoutMs": 30000,
    "description": "Legacy OPENAI_* environment fallback",
}


def presets_json() -> str:
    profiles = {}
    for preset in PRESETS.values():
        profiles[preset["profile"]] = {
            "provider": preset["provider"],
            "baseUrl": preset["baseUrl"],
            "apiKey": preset["apiKey"],
            "model": preset["model"],
            "temperature": preset["temperature"],
            "maxTokens": preset["maxTokens"],
            "timeoutMs": preset["timeoutMs"],
            "description": preset["description"],
        }
    return json.dumps(
        {
            "$schema": SCHEMA_URL,
            "active_profile": "free-openrouter",
            "profiles": profiles,
            "failover_order": list(DEFAULT_FAILOVER),
        },
        ensure_ascii=False,
    )


def normalize_provider(value: str) -> str:
    key = PROVIDER_ALIASES.get(str(value or "").strip().lower())
    if not key:
        raise ValueError(f"Unknown provider {value!r}. Expected one of: {', '.join(PROVIDERS)}")
    return key


def _blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def is_placeholder_key(key: Any) -> bool:
    if _blank(key):
        return True
    text = str(key).strip()
    if text == "ollama-no-key-required":
        return False
    if re.search(r"x{4,}", text, re.IGNORECASE):
        return True
    if "xxxxxxxxxxxx" in text:
        return True
    if re.match(r"^(sk-)?(your|demo|placeholder|changeme|example|test-testing-free)", text, re.IGNORECASE):
        return True
    return False


def mask_key(key: Any) -> str:
    if _blank(key):
        return "(empty)"
    text = str(key)
    if text == "ollama-no-key-required":
        return text
    if len(text) <= 8:
        return "***"
    return f"{text[:6]}…{text[-4:]}"


def _expand_env_ref(value: Any, env: dict[str, str]) -> Any:
    if not isinstance(value, str):
        return value
    match = re.match(r"^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$", value) or re.match(
        r"^env:([A-Za-z_][A-Za-z0-9_]*)$", value
    )
    if not match:
        return value
    return env.get(match.group(1), "")


def _infer_provider(base_url: str) -> str:
    url = str(base_url or "").lower()
    if "openrouter.ai" in url:
        return "openrouter"
    if "api.deepseek.com" in url:
        return "deepseek"
    if "ccswitch" in url:
        return "cc-switch"
    if "11434" in url:
        return "ollama"
    return ""


def _preset_by_profile(name: str) -> dict[str, Any] | None:
    for preset in PRESETS.values():
        if preset["profile"] == name:
            return preset
    return None


def _safe_provider(value: Any) -> str:
    if _blank(value):
        return ""
    try:
        return normalize_provider(str(value))
    except ValueError:
        return str(value)


@dataclass
class LLMConfig:
    provider: str
    baseUrl: str
    apiKey: str
    model: str
    temperature: float = 0.2
    maxTokens: int = 4096
    timeoutMs: int = 30000
    description: str = ""


@dataclass
class ChainEntry:
    name: str
    config: LLMConfig


@dataclass
class ResolvedLLM:
    active_profile: str
    profile_source: str
    config: LLMConfig
    chain: list[ChainEntry] = field(default_factory=list)
    failover_order: list[str] = field(default_factory=list)
    project_path: str = ""
    user_path: str = ""


def is_usable(config: LLMConfig) -> bool:
    if _blank(config.baseUrl) or _blank(config.model):
        return False
    if config.provider == "ollama":
        return True
    return not is_placeholder_key(config.apiKey)


def _env_profile(env: dict[str, str]) -> dict[str, Any] | None:
    api_key = env.get("OPENTEST_API_KEY") or env.get("OPENAI_API_KEY") or ""
    base_url = env.get("OPENTEST_BASE_URL") or env.get("OPENAI_BASE_URL") or ""
    model = env.get("OPENTEST_MODEL") or env.get("OPENAI_MODEL") or ""
    provider_raw = env.get("OPENTEST_PROVIDER") or ""
    if _blank(api_key) and _blank(base_url) and _blank(model) and _blank(provider_raw):
        return None
    profile: dict[str, Any] = {"description": "Environment variables"}
    if not _blank(api_key):
        profile["apiKey"] = api_key
    if not _blank(base_url):
        profile["baseUrl"] = base_url
    if not _blank(model):
        profile["model"] = model
    if not _blank(provider_raw):
        profile["provider"] = normalize_provider(provider_raw)
    elif not _blank(base_url):
        inferred = _infer_provider(base_url)
        if inferred:
            profile["provider"] = inferred
    return profile


def _first_string(layers: list[dict[str, Any]], field_name: str, env: dict[str, str]) -> str:
    for layer in layers:
        if not layer or _blank(layer.get(field_name)):
            continue
        expanded = _expand_env_ref(layer.get(field_name), env)
        if not _blank(expanded):
            return str(expanded)
    return ""


def _first_number(layers: list[dict[str, Any]], field_name: str, fallback: float) -> float:
    for layer in layers:
        if not layer or layer.get(field_name) in (None, ""):
            continue
        try:
            return float(layer[field_name])
        except (TypeError, ValueError):
            continue
    return fallback


def _first_key(layers: list[dict[str, Any]], env: dict[str, str]) -> str:
    placeholder = ""
    for layer in layers:
        if not layer or _blank(layer.get("apiKey")):
            continue
        expanded = _expand_env_ref(str(layer.get("apiKey")), env)
        if _blank(expanded):
            continue
        if is_placeholder_key(expanded):
            if not placeholder:
                placeholder = str(expanded)
            continue
        return str(expanded)
    return placeholder


def _collect(name: str, project_doc, user_doc, env, overrides, is_active: bool) -> LLMConfig:
    layers: list[dict[str, Any]] = []
    if is_active and overrides:
        layers.append(overrides)
    project_profiles = (project_doc or {}).get("profiles") or {}
    user_profiles = (user_doc or {}).get("profiles") or {}
    if name in project_profiles:
        layers.append(project_profiles[name])
    if name in user_profiles:
        layers.append(user_profiles[name])
    from_env = _env_profile(env)
    if is_active and from_env:
        layers.append(from_env)

    provider_hint = next((layer.get("provider") for layer in layers if not _blank(layer.get("provider"))), "")
    named = _preset_by_profile(name)
    preset = PRESETS.get(_safe_provider(provider_hint)) if provider_hint else None
    if preset is None:
        preset = named
    if preset:
        layers.append(preset)
    if is_active and not preset:
        layers.append(OPENAI_FALLBACK)

    provider = _first_string(layers, "provider", env) or (preset or {}).get("provider") or "custom"
    return LLMConfig(
        provider=_safe_provider(provider) or provider,
        baseUrl=_first_string(layers, "baseUrl", env) or (preset or {}).get("baseUrl") or "",
        apiKey=_first_key(layers, env),
        model=_first_string(layers, "model", env) or (preset or {}).get("model") or "",
        temperature=_first_number(layers, "temperature", float((preset or {}).get("temperature", 0.2))),
        maxTokens=int(_first_number(layers, "maxTokens", float((preset or {}).get("maxTokens", 4096)))),
        timeoutMs=int(_first_number(layers, "timeoutMs", float((preset or {}).get("timeoutMs", 30000)))),
        description=_first_string(layers, "description", env) or (preset or {}).get("description") or "",
    )


def _paths(cwd: str | None, home_dir: str | None, env: dict[str, str]) -> tuple[Path, Path]:
    root = Path(cwd or env.get("OPENTEST_CWD") or os.getcwd())
    home = Path(home_dir or env.get("OPENTEST_HOME") or str(Path.home()))
    project = Path(env["OPENTEST_CONFIG"]) if env.get("OPENTEST_CONFIG") else root / "opentest.config.json"
    user = home / ".opentest" / "config.json"
    return project, user


def _read(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    parsed = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError(f"LLM config {path} must be a JSON object")
    return parsed


def _choose_active(project_doc, user_doc, env, overrides) -> tuple[str, str]:
    if overrides and not _blank(overrides.get("profile")):
        return str(overrides["profile"]), "cli"
    if project_doc and not _blank(project_doc.get("active_profile")):
        return str(project_doc["active_profile"]), "project"
    if user_doc and not _blank(user_doc.get("active_profile")):
        return str(user_doc["active_profile"]), "user"
    if not _blank(env.get("OPENTEST_PROFILE")):
        return str(env["OPENTEST_PROFILE"]), "env"
    if _env_profile(env):
        return "env", "env"
    return "free-openrouter", "preset"


def _failover(overrides, project_doc, user_doc) -> list[str]:
    if overrides and overrides.get("failoverOrder"):
        return list(overrides["failoverOrder"])
    if project_doc and project_doc.get("failover_order"):
        return list(project_doc["failover_order"])
    if user_doc and user_doc.get("failover_order"):
        return list(user_doc["failover_order"])
    return list(DEFAULT_FAILOVER)


def resolve_llm_config(
    cwd: str | None = None,
    home_dir: str | None = None,
    env: dict[str, str] | None = None,
    overrides: dict[str, Any] | None = None,
    project_doc: dict[str, Any] | None = None,
    user_doc: dict[str, Any] | None = None,
    read_files: bool = True,
) -> ResolvedLLM:
    """Resolve the active profile.

    ``read_files`` is false when callers pass documents explicitly and must not
    touch the developer machine's config files.
    """
    environ = env if env is not None else dict(os.environ)
    project_path, user_path = _paths(cwd, home_dir, environ)
    if read_files and project_doc is None:
        project_doc = _read(project_path)
    if read_files and user_doc is None:
        user_doc = _read(user_path)

    active_name, source = _choose_active(project_doc, user_doc, environ, overrides)
    failover = _failover(overrides, project_doc, user_doc)
    names: list[str] = []
    for doc in (project_doc, user_doc):
        for name in (doc or {}).get("profiles") or {}:
            if name not in names:
                names.append(name)
    if active_name not in names:
        names.append(active_name)
    for name in failover:
        if name not in names:
            names.append(name)

    resolved = {
        name: _collect(name, project_doc, user_doc, environ, overrides, name == active_name)
        for name in names
    }
    chain_names: list[str] = []
    for name in [active_name, *failover]:
        if name and name not in chain_names and name in resolved:
            chain_names.append(name)

    return ResolvedLLM(
        active_profile=active_name,
        profile_source=source,
        config=resolved[active_name],
        chain=[ChainEntry(name=name, config=resolved[name]) for name in chain_names],
        failover_order=failover,
        project_path=str(project_path),
        user_path=str(user_path),
    )
