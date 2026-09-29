import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, getTestCases, executeTests } from '../api';
import './ProjectDetail.css';

function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProject();
    const interval = setInterval(loadProject, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [id]);

  const loadProject = async () => {
    try {
      const [projectRes, testCasesRes] = await Promise.all([
        getProject(id),
        getTestCases(id)
      ]);
      setProject(projectRes.data);
      setTestCases(testCasesRes.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load project');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    try {
      setExecuting(true);
      const response = await executeTests(id);
      // Navigate to execution detail
      navigate(`/executions/${response.data.execution_id}`);
    } catch (err) {
      setError('Failed to start execution');
      console.error(err);
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading project</div>;
  }

  if (error && !project) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="project-detail">
      <div className="project-header">
        <div>
          <button onClick={() => navigate('/')} className="back-button">
            ← Back to Dashboard
          </button>
          <h2>{project.name}</h2>
          <p className="project-description">{project.description}</p>
        </div>
        <span className={`status-badge status-${project.status}`}>
          {project.status}
        </span>
      </div>

      <div className="card">
        <h3 className="card-title">Requirements</h3>
        <div className="requirement-text">{project.requirement}</div>
      </div>

      <div className="card">
        <div className="test-cases-header">
          <h3 className="card-title">Test Cases ({testCases.length})</h3>
          {project.status === 'ready' && testCases.length > 0 && (
            <button 
              className="btn btn-success"
              onClick={handleExecute}
              disabled={executing}
            >
              {executing ? 'Starting...' : '▶ Run Tests'}
            </button>
          )}
        </div>

        {project.status === 'pending' && (
          <div className="info-message">
            <p>⏳ Waiting for AI agent to process requirements...</p>
          </div>
        )}

        {project.status === 'processing' && (
          <div className="info-message">
            <p>🤖 AI agent is generating test cases...</p>
          </div>
        )}

        {testCases.length === 0 && project.status === 'ready' && (
          <p className="empty-state">No test cases generated yet.</p>
        )}

        {testCases.length > 0 && (
          <div className="test-cases-list">
            {testCases.map((tc, index) => (
              <div key={tc.id} className="test-case-item">
                <div className="test-case-header">
                  <h4>
                    <span className="test-case-number">#{index + 1}</span>
                    {tc.name}
                  </h4>
                  <div className="test-case-badges">
                    <span className={`badge badge-${tc.type}`}>{tc.type}</span>
                    <span className={`badge badge-priority-${tc.priority}`}>
                      {tc.priority}
                    </span>
                  </div>
                </div>
                <p className="test-case-description">{tc.description}</p>
                
                {tc.steps && tc.steps.length > 0 && (
                  <div className="test-case-steps">
                    <strong>Steps:</strong>
                    <ol>
                      {tc.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                
                {tc.expected_result && (
                  <div className="test-case-expected">
                    <strong>Expected Result:</strong> {tc.expected_result}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectDetail;
