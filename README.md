# open-test

AI-TEST-AI is an agentic test platform that turns requirements into executable QA workflows with a minimal UI focused on dashboards, reports, and execution summaries.

The product is built for a new generation of automated testing: a reasoning-driven agent decides what to inspect, what to generate, what to execute, and how to summarize the outcome. The front end is intentionally thin and presentation-focused, while the real intelligence lives in the agentic system.

## Goal

We are trying to replace the usual manual, workflow-heavy QA toolchain with a system where:

- an agent understands requirements
- it retrieves relevant business context and historical knowledge
- it generates test cases automatically
- it runs them through UI or API execution layers
- it diagnoses failures and produces summaries, reports, and recommendations
- the UI is mostly a reporting layer, not an orchestration layer

## Problem being solved

Most traditional test automation tools are still built around rigid forms, manual test case creation, and heavy front-end orchestration. That creates friction, slows down iteration, and makes advanced automation feel like a product problem instead of an engineering workflow.

The real challenge is not only generating tests, but also creating a system that can reason over product context, choose execution paths, use external tools, and continuously self-assess quality while keeping the product experience simple for users.

## Architecture

- Go API gateway for high-performance orchestration and WebSocket streaming
- Python LangGraph agent for reasoning and workflow execution
- Go Playwright execution layer for browser automation
- PostgreSQL for structured state
- Redis for queues and streaming updates
- Neo4j for graph-based knowledge and relationships
- Elasticsearch for full-text retrieval and BM25 search
- React front-end focused on dashboards and reports

## High-level flow

1. User submits requirement or project context
2. Agent parses the requirement and retrieves related knowledge
3. Agent generates test plans and test cases
4. Execution engine runs Playwright and API checks
5. Failures are analyzed and summarized
6. Final output is presented through lightweight dashboards and reports

## Local startup

```bash
make up
```

## Services

- Frontend: http://localhost:3000
- API: http://localhost:8000
- Neo4j: http://localhost:7474
- Elasticsearch: http://localhost:9200
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Repository structure

```text
open-test/
├── api/
├── agent/
├── executor/
├── frontend/
├── docs/
├── docker-compose.yml
├── .env.example
├── Makefile
├── README.md
└── LICENSE
```

## Status

This repository is a starter architecture for the AI-TEST-AI system. It intentionally focuses on the new modality: agentic intelligence first, UI as a dashboard second.
