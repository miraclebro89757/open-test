from typing import Dict, Any

class AgentCore:
    def __init__(self, workflow: Any):
        self.workflow = workflow

    async def run(self, requirement: str) -> Dict[str, Any]:
        parsed = await self.workflow.parse_requirement({"requirement": requirement})
        cases = await self.workflow.generate_cases(parsed)
        execution = await self.workflow.execute(cases)
        result = await self.workflow.summarize(execution)
        return result
