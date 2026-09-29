# Open-Test

AI-powered agentic test platform that turns requirements into executable QA workflows.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🎯 What is Open-Test?

Open-Test is a next-generation testing platform where **AI agents** do the heavy lifting:

- 📝 **Write requirements** in natural language
- 🤖 **AI generates test cases** automatically using LLM reasoning
- ⚡ **Automated execution** with Playwright browser automation
- 📊 **Real-time dashboards** show results and metrics

No more manual test case writing. No more rigid test frameworks. Just describe what you want to test, and let the AI handle the rest.

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- OpenAI API key
- 4GB+ RAM

### Start in 3 Steps

1. **Clone and configure**
   ```bash
   git clone <repository>
   cd open-test
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

2. **Start all services**
   ```bash
   make up
   ```

3. **Open the app**
   ```
   http://localhost:3000
   ```

👉 **See [QUICKSTART.md](QUICKSTART.md) for detailed setup guide**

## 🏗️ Architecture

```
┌─────────────┐
│   Frontend  │  React dashboard & reports
│  (Port 3000)│
└──────┬──────┘
       │
┌──────▼──────┐
│ API Gateway │  Go REST API + WebSocket
│  (Port 8000)│
└──────┬──────┘
       │
   ┌───┴───┐
   │ Redis │  Message queue & pub/sub
   └───┬───┘
       │
   ┌───┴────────┐
   │            │
┌──▼───┐   ┌───▼────┐
│Agent │   │Executor│
│Python│   │Go+PW   │
└──┬───┘   └───┬────┘
   │           │
   └─────┬─────┘
         │
   ┌─────▼──────┐
   │ PostgreSQL │  Structured data
   └────────────┘
```

### Tech Stack

- **Frontend**: React, React Router, Axios
- **API Gateway**: Go, Echo framework, WebSocket
- **Agent**: Python, LangGraph, LangChain, OpenAI
- **Executor**: Go, Playwright for browser automation
- **Databases**: PostgreSQL, Redis, Neo4j, Elasticsearch

## 📋 Core Features

### ✨ Implemented (MVP)

- ✅ Natural language requirement input
- ✅ AI-powered test case generation (LangGraph + OpenAI)
- ✅ Automated UI test execution (Playwright)
- ✅ Real-time execution monitoring
- ✅ Dashboard with metrics and reports
- ✅ Project management (CRUD)
- ✅ Test result tracking and history

### 🔮 Roadmap

- 🔄 RAG-based knowledge retrieval (Neo4j + Elasticsearch)
- 🔄 Advanced test strategies (API testing, integration tests)
- 🔄 Failure analysis and auto-diagnosis
- 🔄 Test optimization and flaky test detection
- 🔄 CI/CD integration
- 🔄 Multi-tenant support

## 🎬 How It Works

1. **Submit Requirements**
   ```
   "Test user login with valid and invalid credentials,
   verify session persistence, and check forgot password flow"
   ```

2. **AI Agent Analyzes**
   - Parses requirements using LLM
   - Identifies test scenarios
   - Generates structured test cases with steps
   - Saves to database

3. **Execute Tests**
   - Executor picks up test cases
   - Runs Playwright browser automation
   - Records results, screenshots, timing
   - Updates database in real-time

4. **View Results**
   - Dashboard shows pass/fail metrics
   - Detailed execution logs
   - Historical trends

## 🛠️ Development

### Project Structure

```
open-test/
├── api/              # Go API Gateway
│   ├── cmd/
│   ├── internal/
│   └── Dockerfile
├── agent/            # Python AI Agent
│   ├── core/
│   ├── main.py
│   └── Dockerfile
├── executor/         # Go + Playwright Executor
│   ├── cmd/
│   ├── internal/
│   └── Dockerfile
├── frontend/         # React Frontend
│   ├── src/
│   ├── public/
│   └── Dockerfile
├── db/              # Database schemas
├── docker-compose.yml
└── Makefile
```

### Available Commands

```bash
make up       # Start all services
make down     # Stop all services
make logs     # View all logs
make api      # View API logs
make agent    # View agent logs
make executor # View executor logs
make frontend # View frontend logs
```

## 📊 Service Endpoints

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| API | 8000 | http://localhost:8000 |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |
| Neo4j | 7474, 7687 | http://localhost:7474 |
| Elasticsearch | 9200 | http://localhost:9200 |

## 🧪 API Examples

```bash
# Create a project
curl -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Login Tests",
    "requirement": "Test login with valid/invalid credentials"
  }'

# Get dashboard metrics
curl http://localhost:8000/api/dashboard/metrics

# List projects
curl http://localhost:8000/api/projects
```

## 🤝 Contributing

Contributions welcome! This is an MVP showcasing agentic testing architecture.

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 💡 Philosophy

Traditional testing tools focus on UI orchestration and manual workflows. Open-Test flips this:

- **AI does the thinking**: Requirements → Test Cases
- **Automation does the work**: Test Cases → Results  
- **UI shows the outcomes**: Results → Insights

The goal is a testing platform that feels more like a copilot than a tool.

---

Built with ❤️ for the future of QA automation
