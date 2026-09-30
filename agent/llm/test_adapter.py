import json
import unittest

from agent.llm.adapter import complete_with_failover, ping
from agent.llm.config import LLMConfig


def config(provider, base_url, key, model):
    return LLMConfig(provider=provider, baseUrl=base_url, apiKey=key, model=model, timeoutMs=1000)


DEEPSEEK = config("deepseek", "https://api.deepseek.com/v1", "sk-project-deepseek-key-1234", "deepseek-chat")
OPENROUTER = config("openrouter", "https://openrouter.ai/api/v1", "sk-or-v1-real-key-abcdef", "deepseek/deepseek-r1:free")
CHAIN = [
    {"name": "deepseek-prod", "config": DEEPSEEK},
    {"name": "free-openrouter", "config": OPENROUTER},
]


class Script:
    def __init__(self, steps):
        self.steps = steps
        self.calls = []

    def __call__(self, config, body, timeout_s):
        self.calls.append({"model": config.model, "body": body, "headers_model": config.provider})
        step = self.steps[len(self.calls) - 1]
        if "error" in step:
            raise step["error"]
        return step["status"], step["body"] if isinstance(step["body"], str) else json.dumps(step["body"])


class AdapterTests(unittest.TestCase):
    def test_rate_limit_retries_then_fails_over(self):
        script = Script(
            [
                {"status": 429, "body": "rate limit"},
                {"status": 429, "body": "rate limit"},
                {"status": 429, "body": "rate limit"},
                {"status": 200, "body": {"choices": [{"message": {"content": "pong"}}]}},
            ]
        )
        content, profile = complete_with_failover(CHAIN, "ping", transport=script, sleep=lambda _s: None)
        self.assertEqual(content, "pong")
        self.assertEqual(profile, "free-openrouter")
        self.assertEqual(len(script.calls), 4)

    def test_auth_failure_skips_without_retry(self):
        script = Script(
            [
                {"status": 401, "body": "invalid api key"},
                {"status": 200, "body": {"choices": [{"message": {"content": "backup"}}]}},
            ]
        )
        content, _profile = complete_with_failover(CHAIN, "hello", transport=script, sleep=lambda _s: None)
        self.assertEqual(content, "backup")
        self.assertEqual(len(script.calls), 2)

    def test_empty_content_retries_and_reads_reasoning(self):
        script = Script(
            [
                {"status": 200, "body": {"choices": [{"message": {"content": ""}}]}},
                {"status": 200, "body": {"choices": [{"message": {"content": None, "reasoning": "pong"}}]}},
            ]
        )
        content, _profile = complete_with_failover(
            [CHAIN[0]],
            "ping",
            transport=script,
            sleep=lambda _s: None,
        )
        self.assertEqual(content, "pong")
        self.assertEqual(len(script.calls), 2)

    def test_ping_reports_http_status(self):
        script = Script([{"status": 401, "body": "bad key"}])
        result = ping(DEEPSEEK, transport=script)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], 401)

    def test_placeholder_is_not_sent(self):
        called = {"value": False}

        def transport(_config, _body, _timeout):
            called["value"] = True
            return 200, "{}"

        result = ping(
            config("openrouter", "https://openrouter.ai/api/v1", "sk-or-v1-xxxxxxxxxxxx", "deepseek/deepseek-r1:free"),
            transport=transport,
        )
        self.assertFalse(called["value"])
        self.assertFalse(result["ok"])


if __name__ == "__main__":
    unittest.main()
