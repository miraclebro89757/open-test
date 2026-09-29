# Open-Test Quick Start Guide

## Prerequisites

- Docker and Docker Compose installed
- OpenAI API key (for AI agent)
- At least 4GB RAM available for Docker

## Setup Steps

### 1. Configure Environment

Copy the example environment file and add your OpenAI API key:

```bash
cp .env.example .env
```

Edit `.env` and set your OpenAI API key:
```
OPENAI_API_KEY=sk-your-actual-key-here
```

### 2. Start All Services

Build and start all services:

```bash
make up
```

This will start:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Neo4j (port 7474, 7687)
- Elasticsearch (port 9200)
- API Gateway (port 8000)
- Agent (background service)
- Executor (background service)
- Frontend (port 3000)

### 3. Verify Services

Check that all services are running:

```bash
docker compose ps
```

All services should show "Up" or "running" status.

### 4. Access the Application

Open your browser and navigate to:

**http://localhost:3000**

### 5. Create Your First Project

1. Click "New Project" button
2. Fill in the form:
   - **Name**: "E-commerce Login Tests"
   - **Description**: "Testing user authentication flows"
   - **Requirements**: 
     ```
     Test the following scenarios:
     1. User can login with valid credentials
     2. System shows error with invalid credentials
     3. User can logout successfully
     4. Session persists after page refresh
     5. Forgot password flow works correctly
     ```
3. Click "Create Project"

### 6. Watch the AI Agent Work

The system will:
1. Create the project (status: pending)
2. AI agent picks up the requirement (status: processing)
3. Agent generates test cases automatically (status: ready)
4. You can now execute the tests

### 7. Run Tests

1. On the project detail page, click "▶ Run Tests"
2. Navigate to the execution results page
3. Watch as tests are executed in real-time
4. See pass/fail results for each test case

## Service URLs

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8000
- **API Health Check**: http://localhost:8000/health
- **Neo4j Browser**: http://localhost:7474 (user: neo4j, pass: password)
- **Elasticsearch**: http://localhost:9200

## Useful Commands

```bash
# View all logs
make logs

# View specific service logs
make api      # API gateway logs
make agent    # Agent logs
make executor # Executor logs
make frontend # Frontend logs

# Stop all services
make down

# Rebuild and restart
make up
```

## Testing the API Directly

### Create a project via API:

```bash
curl -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Project",
    "description": "My first test",
    "requirement": "Test login functionality with valid and invalid credentials"
  }'
```

### Get dashboard metrics:

```bash
curl http://localhost:8000/api/dashboard/metrics
```

### List all projects:

```bash
curl http://localhost:8000/api/projects
```

## Troubleshooting

### Agent not generating test cases?

Check agent logs:
```bash
make agent
```

Make sure your OPENAI_API_KEY is set correctly in `.env`.

### Database connection errors?

Wait 10-20 seconds after starting services for PostgreSQL to initialize.

### Executor failing?

The executor uses Playwright for browser automation. The first run may take longer as it downloads browser binaries.

### Frontend not loading?

Check if the API is running:
```bash
curl http://localhost:8000/health
```

## Architecture Overview

```
User → Frontend (React) 
        ↓
      API Gateway (Go)
        ↓
      Database (PostgreSQL)
        ↓
      Redis (Message Queue)
        ↓
   ┌────┴────┐
   ↓         ↓
Agent     Executor
(Python)  (Go + Playwright)
```

## Next Steps

- Explore the dashboard to see metrics
- Create multiple projects with different requirements
- Run executions and compare results
- Check the generated test cases

## Support

For issues or questions, check the logs first:
```bash
make logs
```

The logs will show you exactly what each service is doing.
