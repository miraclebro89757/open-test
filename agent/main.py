import os
import json
import time
import redis
from dotenv import load_dotenv
from agent.core.agent import TestAgent
from agent.core.workflow import WorkflowDB

load_dotenv()


def main():
    print("=" * 60)
    print("Open-Test Agent Starting")
    print("=" * 60)
    
    # Initialize components
    agent = TestAgent()
    db = WorkflowDB()
    
    # Connect to Redis
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    r = redis.from_url(redis_url)
    
    print(f"Connected to Redis: {redis_url}")
    print("Listening for agent tasks on channel: agent:tasks")
    print()
    
    # Subscribe to Redis channel
    pubsub = r.pubsub()
    pubsub.subscribe("agent:tasks")
    
    for message in pubsub.listen():
        if message["type"] == "message":
            try:
                # Parse message
                data = json.loads(message["data"])
                action = data.get("action")
                
                if action == "generate_tests":
                    project_id = data.get("project_id")
                    requirement = data.get("requirement")
                    
                    print(f"\n{'='*60}")
                    print(f"Processing project: {project_id}")
                    print(f"Requirement: {requirement[:100]}...")
                    print(f"{'='*60}\n")
                    
                    # Update status to processing
                    db.update_project_status(project_id, "processing")
                    
                    # Publish status update
                    r.publish("updates:projects", json.dumps({
                        "project_id": project_id,
                        "status": "processing",
                        "message": "Agent is analyzing requirements..."
                    }))
                    
                    # Run agent workflow
                    print("Running AI agent workflow...")
                    result = agent.run(project_id, requirement)
                    
                    # Save test cases to database
                    test_cases = result.get("test_cases", [])
                    print(f"Generated {len(test_cases)} test cases")
                    
                    for i, tc in enumerate(test_cases, 1):
                        print(f"  {i}. {tc.get('name')} [{tc.get('type')}]")
                    
                    db.save_test_cases(project_id, test_cases)
                    
                    # Update status to ready
                    db.update_project_status(project_id, "ready")
                    
                    # Publish completion update
                    r.publish("updates:projects", json.dumps({
                        "project_id": project_id,
                        "status": "ready",
                        "test_case_count": len(test_cases),
                        "message": f"Generated {len(test_cases)} test cases"
                    }))
                    
                    print(f"\n✓ Project {project_id} processed successfully\n")
                
            except Exception as e:
                print(f"Error processing message: {e}")
                import traceback
                traceback.print_exc()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nAgent stopped by user")
    except Exception as e:
        print(f"\nAgent error: {e}")
        import traceback
        traceback.print_exc()
