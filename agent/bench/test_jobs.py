import json
import unittest

from agent.bench.jobs import JobError, extract_json, prepare, public_status
from agent.llm.config import LLMConfig, ResolvedLLM


class JobTests(unittest.TestCase):
    def test_extract_json_from_fence(self):
        parsed = extract_json('说明\n```json\n{"headline": "登录"}\n```')
        self.assertEqual(parsed["headline"], "登录")

    def test_prepare_rejects_empty_cases(self):
        with self.assertRaises(JobError):
            prepare("cases", "  ", {})

    def test_review_can_use_memory(self):
        self.assertEqual(prepare("review", "", {"cases": [{"name": "TC"}]}), "")

    def test_unknown_kind(self):
        with self.assertRaises(JobError):
            prepare("deploy", "x", {})

    def test_status_masks_key(self):
        secret = "sk-or-v1-super-secret-value-1b11"
        resolved = ResolvedLLM(
            active_profile="free-openrouter",
            profile_source="user",
            config=LLMConfig(
                provider="openrouter",
                baseUrl="https://openrouter.ai/api/v1",
                apiKey=secret,
                model="stealth/space-bunny-alpha",
            ),
        )
        payload = public_status(resolved)
        encoded = json.dumps(payload)
        self.assertNotIn(secret, encoded)
        self.assertTrue(payload["ok"])
        self.assertIn("…", payload["key"])


if __name__ == "__main__":
    unittest.main()
