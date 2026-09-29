import psycopg2
import json
from typing import Dict, Any, List
import os


class WorkflowDB:
    """Database operations for workflow"""
    
    def __init__(self):
        self.conn = None
        self.connect()
    
    def connect(self):
        """Connect to PostgreSQL"""
        db_url = os.getenv("DATABASE_URL", "postgresql://admin:password@postgres:5432/wharttest")
        try:
            self.conn = psycopg2.connect(db_url)
            print("Database connected successfully")
        except Exception as e:
            print(f"Failed to connect to database: {e}")
    
    def update_project_status(self, project_id: str, status: str):
        """Update project status"""
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    "UPDATE projects SET status = %s, updated_at = NOW() WHERE id = %s",
                    (status, project_id)
                )
                self.conn.commit()
        except Exception as e:
            print(f"Failed to update project status: {e}")
            self.conn.rollback()
    
    def save_test_cases(self, project_id: str, test_cases: List[Dict[str, Any]]):
        """Save generated test cases to database"""
        try:
            with self.conn.cursor() as cur:
                for tc in test_cases:
                    steps_json = json.dumps(tc.get("steps", []))
                    cur.execute(
                        """
                        INSERT INTO test_cases 
                        (project_id, name, description, type, steps, expected_result, priority)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            project_id,
                            tc.get("name", "Untitled Test"),
                            tc.get("description", ""),
                            tc.get("type", "ui"),
                            steps_json,
                            tc.get("expected_result", ""),
                            tc.get("priority", "medium")
                        )
                    )
                self.conn.commit()
                print(f"Saved {len(test_cases)} test cases for project {project_id}")
        except Exception as e:
            print(f"Failed to save test cases: {e}")
            self.conn.rollback()
    
    def get_test_cases(self, project_id: str) -> List[Dict[str, Any]]:
        """Get test cases for a project"""
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, description, type, steps, expected_result, priority
                    FROM test_cases
                    WHERE project_id = %s
                    ORDER BY created_at DESC
                    """,
                    (project_id,)
                )
                rows = cur.fetchall()
                
                test_cases = []
                for row in rows:
                    test_cases.append({
                        "id": str(row[0]),
                        "name": row[1],
                        "description": row[2],
                        "type": row[3],
                        "steps": json.loads(row[4]) if row[4] else [],
                        "expected_result": row[5],
                        "priority": row[6]
                    })
                
                return test_cases
        except Exception as e:
            print(f"Failed to get test cases: {e}")
            return []
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
