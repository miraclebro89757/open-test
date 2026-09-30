import unittest

from agent.llm.config import resolve_llm_config


class ResolveTests(unittest.TestCase):
    def test_project_site_url_is_not_the_llm_endpoint(self):
        resolved = resolve_llm_config(
            env={"OPENAI_API_KEY": "sk-real-openai-key-123456"},
            project_doc={"name": "demo", "baseUrl": "http://localhost:3000"},
            user_doc=None,
            read_files=False,
        )
        self.assertEqual(resolved.config.baseUrl, "https://api.openai.com/v1")
        self.assertEqual(resolved.config.model, "gpt-4o-mini")
        self.assertEqual(resolved.active_profile, "env")

    def test_project_key_beats_environment(self):
        resolved = resolve_llm_config(
            env={"OPENTEST_API_KEY": "sk-env-key-should-lose-9999"},
            project_doc={
                "active_profile": "deepseek-prod",
                "profiles": {
                    "deepseek-prod": {
                        "provider": "deepseek",
                        "baseUrl": "https://api.deepseek.com/v1",
                        "apiKey": "sk-project-deepseek-key-1234",
                        "model": "deepseek-chat",
                    }
                },
            },
            user_doc={
                "active_profile": "free-openrouter",
                "profiles": {"deepseek-prod": {"apiKey": "sk-user-key-should-lose-8888"}},
            },
            read_files=False,
        )
        self.assertEqual(resolved.config.apiKey, "sk-project-deepseek-key-1234")
        self.assertEqual(resolved.profile_source, "project")

    def test_placeholder_falls_through(self):
        resolved = resolve_llm_config(
            env={"OPENTEST_API_KEY": "sk-real-deepseek-key-1234"},
            project_doc={
                "active_profile": "deepseek-prod",
                "profiles": {
                    "deepseek-prod": {
                        "provider": "deepseek",
                        "baseUrl": "https://api.deepseek.com/v1",
                        "apiKey": "sk-xxxxxxxxxxxxxxxxxxxx",
                        "model": "deepseek-chat",
                    }
                },
            },
            user_doc=None,
            read_files=False,
        )
        self.assertEqual(resolved.config.apiKey, "sk-real-deepseek-key-1234")
        self.assertEqual(resolved.config.provider, "deepseek")

    def test_failover_order_starts_with_active_profile(self):
        resolved = resolve_llm_config(
            env={},
            project_doc={
                "active_profile": "deepseek-prod",
                "failover_order": ["deepseek-prod", "cc-switch-enterprise", "free-openrouter"],
                "profiles": {
                    "deepseek-prod": {
                        "provider": "deepseek",
                        "apiKey": "sk-project-deepseek-key-1234",
                        "model": "deepseek-chat",
                        "baseUrl": "https://api.deepseek.com/v1",
                    }
                },
            },
            user_doc=None,
            read_files=False,
        )
        self.assertEqual(
            [entry.name for entry in resolved.chain],
            ["deepseek-prod", "cc-switch-enterprise", "free-openrouter"],
        )


if __name__ == "__main__":
    unittest.main()
