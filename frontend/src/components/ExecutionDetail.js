import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getExecution } from '../api';
import './ExecutionDetail.css';

function ExecutionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [execution, setExecution] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadExecution();
    const interval = setInterval(loadExecution, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [id]);

  const loadExecution = async () => {
    try {
      const response = await getExecution(id);
      setExecution(response.data.execution);
      setResults(response.data.results || []);
      setError(null);
    } catch (err) {
      setError('Failed to load execution');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;
    
    return { total, passed, failed, skipped, passRate };
  };

  if (loading) {
    return <div className="loading">Loading execution details</div>;
  }

  if (error && !execution) {
    return <div className="error">{error}</div>;
  }

  const stats = calculateStats();
  const isRunning = execution.status === 'running' || execution.status === 'queued';

  return (
    <div className="execution-detail">
      <div className="execution-header">
        <div>
          <button 
            onClick={() => navigate(`/projects/${execution.project_id}`)} 
            className="back-button"
          >
            ← Back to Project
          </button>
          <h2>Execution Results</h2>
          <p className="execution-id">ID: {execution.id}</p>
        </div>
        <span className={`status-badge status-${execution.status}`}>
          {execution.status}
        </span>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Tests</div>
        </div>
        <div className="stat-card stat-passed">
          <div className="stat-value">{stats.passed}</div>
          <div className="stat-label">Passed</div>
        </div>
        <div className="stat-card stat-failed">
          <div className="stat-value">{stats.failed}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.passRate}%</div>
          <div className="stat-label">Pass Rate</div>
        </div>
      </div>

      {/* Execution Timeline */}
      <div className="card">
        <h3 className="card-title">Timeline</h3>
        <div className="timeline">
          <div className="timeline-item">
            <strong>Created:</strong> {new Date(execution.created_at).toLocaleString()}
          </div>
          {execution.started_at && (
            <div className="timeline-item">
              <strong>Started:</strong> {new Date(execution.started_at).toLocaleString()}
            </div>
          )}
          {execution.completed_at && (
            <div className="timeline-item">
              <strong>Completed:</strong> {new Date(execution.completed_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Test Results */}
      <div className="card">
        <h3 className="card-title">Test Results</h3>
        
        {isRunning && (
          <div className="info-message">
            <p>⏳ Tests are running... Results will appear here.</p>
          </div>
        )}

        {results.length === 0 && !isRunning && (
          <p className="empty-state">No test results available.</p>
        )}

        {results.length > 0 && (
          <div className="results-list">
            {results.map((result, index) => (
              <div key={result.id} className={`result-item result-${result.status}`}>
                <div className="result-header">
                  <span className="result-number">#{index + 1}</span>
                  <span className={`result-status status-${result.status}`}>
                    {result.status === 'passed' && '✓'}
                    {result.status === 'failed' && '✗'}
                    {result.status === 'skipped' && '○'}
                    {' '}
                    {result.status.toUpperCase()}
                  </span>
                  <span className="result-duration">
                    {(result.duration_ms / 1000).toFixed(2)}s
                  </span>
                </div>
                
                {result.error_message && (
                  <div className="result-error">
                    <strong>Error:</strong> {result.error_message}
                  </div>
                )}

                <div className="result-time">
                  Executed at: {new Date(result.executed_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExecutionDetail;
