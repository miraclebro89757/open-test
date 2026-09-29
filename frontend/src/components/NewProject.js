import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject } from '../api';
import './NewProject.css';

function NewProject() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    requirement: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.requirement) {
      setError('Name and requirement are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await createProject(formData);
      // Navigate to project detail page
      navigate(`/projects/${response.data.id}`);
    } catch (err) {
      setError('Failed to create project. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="new-project">
      <div className="card">
        <h2 className="card-title">Create New Test Project</h2>
        
        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit} className="project-form">
          <div className="form-group">
            <label htmlFor="name">Project Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., E-commerce Login Flow"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <input
              type="text"
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Brief description of the project"
            />
          </div>

          <div className="form-group">
            <label htmlFor="requirement">Requirements *</label>
            <textarea
              id="requirement"
              name="requirement"
              value={formData.requirement}
              onChange={handleChange}
              placeholder="Describe what you want to test. Be as detailed as possible.

Example:
- Test user login with valid and invalid credentials
- Verify forgot password flow
- Check session persistence
- Test logout functionality"
              rows="12"
              required
            />
            <small className="form-help">
              The AI agent will analyze these requirements and generate test cases automatically.
            </small>
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={() => navigate('/')}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewProject;
