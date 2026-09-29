import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import Dashboard from './components/Dashboard';
import NewProject from './components/NewProject';
import ProjectDetail from './components/ProjectDetail';
import ExecutionDetail from './components/ExecutionDetail';

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <div className="nav-container">
            <Link to="/" className="nav-brand">
              <h1>Open-Test</h1>
              <span className="nav-subtitle">AI-Powered Testing</span>
            </Link>
            <div className="nav-links">
              <Link to="/" className="nav-link">Dashboard</Link>
              <Link to="/new" className="nav-link nav-link-primary">New Project</Link>
            </div>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewProject />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/executions/:id" element={<ExecutionDetail />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
