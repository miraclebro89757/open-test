import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardMetrics, getProjects } from '../api';
import './Dashboard.css';

function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [metricsRes, projectsRes] = await Promise.all([
        getDashboardMetrics(),
        getProjects()
      ]);
      setMetrics(metricsRes.data);
      setProjects(projectsRes.data);
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <Link to="/new" className="btn btn-primary">+ New Project</Link>
      </div>

      {/* Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">{metrics?.total_projects || 0}</div>
          <div className="metric-label">Total Projects</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics?.total_executions || 0}</div>
          <div className="metric-label">Total Executions</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics?.recent_pass_rate?.toFixed(1) || 0}%</div>
          <div className="metric-label">Recent Pass Rate</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">{metrics?.avg_execution_time || '0s'}</div>
          <div className="metric-label">Avg Execution Time</div>
        </div>
      </div>

      {/* Projects List */}
      <div className="card">
        <h3 className="card-title">Recent Projects</h3>
        {projects.length === 0 ? (
          <p className="empty-state">
            No projects yet. <Link to="/new">Create your first project</Link> to get started.
          </p>
        ) : (
          <div className="projects-list">
            {projects.map((project) => (
              <Link 
                key={project.id} 
                to={`/projects/${project.id}`}
                className="project-item"
              >
                <div className="project-info">
                  <h4>{project.name}</h4>
                  <p>{project.description || 'No description'}</p>
                  <div className="project-meta">
                    <span className={`status-badge status-${project.status}`}>
                      {project.status}
                    </span>
                    <span className="project-date">
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="project-arrow">→</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
