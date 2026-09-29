import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getDashboardMetrics = () => api.get('/api/dashboard/metrics');

export const getProjects = () => api.get('/api/projects');

export const getProject = (id) => api.get(`/api/projects/${id}`);

export const createProject = (data) => api.post('/api/projects', data);

export const getTestCases = (projectId) => api.get(`/api/projects/${projectId}/test-cases`);

export const executeTests = (projectId) => api.post(`/api/projects/${projectId}/execute`);

export const getExecution = (executionId) => api.get(`/api/executions/${executionId}`);

export default api;
