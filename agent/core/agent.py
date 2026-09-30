import json
from typing import Dict, Any, List
from langgraph.graph import StateGraph, END
from pydantic import BaseModel, Field

from agent.llm.runtime import build_chat_model


class AgentState(BaseModel):
    """State for the agent workflow"""
    project_id: str = ""
    requirement: str = ""
    parsed_requirements: Dict[str, Any] = Field(default_factory=dict)
    test_cases: List[Dict[str, Any]] = Field(default_factory=list)
    status: str = "pending"
    error: str = ""


class TestAgent:
    """AI Agent for generating test cases from requirements"""
    
    def __init__(self, llm_model: str | None = None):
        self.llm = build_chat_model(model_override=llm_model)
        self.workflow = self._build_workflow()
    
    def _build_workflow(self) -> StateGraph:
        """Build the LangGraph workflow"""
        workflow = StateGraph(AgentState)
        
        # Add nodes
        workflow.add_node("parse_requirement", self._parse_requirement)
        workflow.add_node("generate_test_cases", self._generate_test_cases)
        workflow.add_node("finalize", self._finalize)
        
        # Add edges
        workflow.set_entry_point("parse_requirement")
        workflow.add_edge("parse_requirement", "generate_test_cases")
        workflow.add_edge("generate_test_cases", "finalize")
        workflow.add_edge("finalize", END)
        
        return workflow.compile()
    
    def _parse_requirement(self, state: AgentState) -> Dict[str, Any]:
        """Parse and analyze the requirement"""
        prompt = f"""
You are a QA expert. Analyze this requirement and extract key testing points.

Requirement:
{state.requirement}

Provide a JSON response with:
- main_features: list of main features to test
- user_flows: list of user workflows
- edge_cases: list of edge cases to consider
- test_types: list of test types needed (ui, api, integration, etc.)

Response format:
{{"main_features": [], "user_flows": [], "edge_cases": [], "test_types": []}}
"""
        
        try:
            response = self.llm.invoke(prompt)
            content = response.content
            
            # Extract JSON from response
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            parsed = json.loads(content)
            
            return {
                "parsed_requirements": parsed,
                "status": "parsed"
            }
        except Exception as e:
            print(f"Error parsing requirement: {e}")
            return {
                "parsed_requirements": {
                    "main_features": ["Login", "User Management"],
                    "user_flows": ["User registration and login"],
                    "edge_cases": ["Invalid credentials"],
                    "test_types": ["ui", "api"]
                },
                "status": "parsed",
                "error": str(e)
            }
    
    def _generate_test_cases(self, state: AgentState) -> Dict[str, Any]:
        """Generate concrete test cases"""
        parsed = state.parsed_requirements
        
        prompt = f"""
You are a QA expert. Generate detailed test cases based on this analysis:

Main Features: {parsed.get('main_features', [])}
User Flows: {parsed.get('user_flows', [])}
Edge Cases: {parsed.get('edge_cases', [])}
Test Types: {parsed.get('test_types', [])}

Original Requirement:
{state.requirement}

Generate 5-8 test cases. For each test case, provide:
- name: clear test case name
- description: what this test validates
- type: one of [ui, api, integration]
- priority: one of [high, medium, low]
- steps: array of step descriptions
- expected_result: what should happen

Response format (JSON array):
[
  {{
    "name": "TC-01: User login with valid credentials",
    "description": "Verify user can login with correct username and password",
    "type": "ui",
    "priority": "high",
    "steps": ["Navigate to login page", "Enter valid credentials", "Click login button"],
    "expected_result": "User is redirected to dashboard"
  }}
]
"""
        
        try:
            response = self.llm.invoke(prompt)
            content = response.content
            
            # Extract JSON from response
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            test_cases = json.loads(content)
            
            # Ensure test_cases is a list
            if not isinstance(test_cases, list):
                test_cases = [test_cases]
            
            return {
                "test_cases": test_cases,
                "status": "generated"
            }
        except Exception as e:
            print(f"Error generating test cases: {e}")
            # Fallback test cases
            return {
                "test_cases": [
                    {
                        "name": "TC-01: Basic login test",
                        "description": "Verify user can login",
                        "type": "ui",
                        "priority": "high",
                        "steps": ["Open login page", "Enter credentials", "Submit"],
                        "expected_result": "User logged in successfully"
                    },
                    {
                        "name": "TC-02: Invalid login test",
                        "description": "Verify error on invalid credentials",
                        "type": "ui",
                        "priority": "high",
                        "steps": ["Open login page", "Enter invalid credentials", "Submit"],
                        "expected_result": "Error message displayed"
                    }
                ],
                "status": "generated",
                "error": str(e)
            }
    
    def _finalize(self, state: AgentState) -> Dict[str, Any]:
        """Finalize the workflow"""
        return {
            "status": "completed"
        }
    
    def run(self, project_id: str, requirement: str) -> AgentState:
        """Execute the workflow"""
        initial_state = AgentState(
            project_id=project_id,
            requirement=requirement
        )
        
        result = self.workflow.invoke(initial_state)
        return result
