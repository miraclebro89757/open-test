"""The five jobs this bench is allowed to run."""

from __future__ import annotations

import json
from typing import Any

from agent.llm.config import ResolvedLLM, is_usable, mask_key


KINDS = ("cases", "review", "defects", "report", "locator")

LABELS = {
    "cases": "生成用例",
    "review": "评审用例",
    "defects": "缺陷汇总",
    "report": "高管简报",
    "locator": "定位器修复",
}


class JobError(ValueError):
    """A request the bench can refuse before calling a model."""


def public_status(resolved: ResolvedLLM) -> dict[str, Any]:
    config = resolved.config
    return {
        "ok": is_usable(config),
        "profile": resolved.active_profile,
        "source": resolved.profile_source,
        "provider": config.provider,
        "model": config.model,
        "key": mask_key(config.apiKey),
    }


def prepare(kind: str, text: str, memory: dict[str, Any]) -> str:
    if kind not in KINDS:
        raise JobError("这个操作台只做生成用例、评审用例、缺陷汇总、高管简报、定位器修复。")
    cleaned = (text or "").strip()
    if kind in {"cases", "defects", "locator"} and not cleaned:
        raise JobError("先把材料贴进来。")
    if kind in {"review", "report"} and not cleaned and not memory.get("cases"):
        raise JobError("先生成一组用例，或把内容贴进来。")
    return cleaned


def extract_json(content: str) -> Any:
    text = (content or "").strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()
    return json.loads(text)


def execute(kind: str, text: str, memory: dict[str, Any]) -> dict[str, Any]:
    cleaned = prepare(kind, text, memory)
    if kind == "cases":
        artifact = _cases(cleaned)
        memory["cases"] = artifact["cases"]
        return artifact
    if kind == "review":
        source = cleaned or json.dumps(memory.get("cases") or [], ensure_ascii=False)
        return _structured(
            "review",
            "你是测试负责人。只评审用例是否能被测试员执行。指出缺口，不要重写整组用例。",
            source,
            {"summary": "一句话", "findings": [{"severity": "high", "title": "", "detail": ""}]},
        )
    if kind == "defects":
        return _structured(
            "defects",
            "你是测试负责人。把贴进来的 Jira 或禅道记录收成一份汇总。不要编造没出现的单号。",
            cleaned,
            {"headline": "", "groups": [{"name": "", "items": [""]}], "ask": ""},
        )
    if kind == "report":
        source = cleaned
        if memory.get("cases"):
            source = "已有用例：\n" + json.dumps(memory["cases"], ensure_ascii=False) + "\n\n补充：\n" + cleaned
        return _structured(
            "report",
            "你是测试负责人，写给高管的简报。短句。只根据给定材料，不夸大覆盖率。",
            source,
            {"title": "", "headline": "", "bullets": [""], "risks": [""], "next": [""]},
        )
    return _structured(
        "locator",
        "你是前端测试工程师。根据失败记录提出一个更稳的定位器。这是文本修复，不是在浏览器里实际点击。",
        cleaned,
        {"old": "", "proposed": "", "why": "", "confidence": "medium"},
    )


def _cases(requirement: str) -> dict[str, Any]:
    from agent.llm.runtime import build_chat_model

    prompt = f"""根据需求写 5 条能执行的测试用例。每条最多 4 个步骤，每步一句话。

需求：
{requirement}

只返回 JSON 数组。每项包含 name, description, type, priority, steps, expected_result。
type 取 ui、api、integration。priority 取 high、medium、low。"""
    content = build_chat_model().invoke(
        prompt,
        system_prompt="你是测试工程师。只返回 JSON 数组，不要写解释。",
    ).content
    try:
        parsed = extract_json(content)
    except (json.JSONDecodeError, IndexError):
        return {
            "kind": "text",
            "text": content,
            "warning": "模型返回的内容不是完整 JSON。原文在下面。",
        }
    if isinstance(parsed, dict):
        parsed = parsed.get("cases") or parsed.get("items") or [parsed]
    if not isinstance(parsed, list):
        return {"kind": "text", "text": content, "warning": "模型没有返回用例数组。"}
    return {"kind": "cases", "cases": parsed}


def _structured(kind: str, system: str, user: str, shape: dict[str, Any]) -> dict[str, Any]:
    from agent.llm.runtime import build_chat_model

    prompt = (
        f"{user}\n\n只返回 JSON，形状如下：\n"
        f"{json.dumps(shape, ensure_ascii=False)}"
    )
    content = build_chat_model().invoke(prompt, system_prompt=system).content
    try:
        parsed = extract_json(content)
    except (json.JSONDecodeError, IndexError):
        return {"kind": "text", "text": content}
    if not isinstance(parsed, dict):
        return {"kind": "text", "text": content}
    parsed["kind"] = kind
    return parsed
