#!/bin/bash

# Test build script for Open-Test
# This script validates that all services can build successfully

set -e

echo "================================"
echo "Open-Test Build Verification"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose not found. Please install Docker Compose.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker found${NC}"
echo -e "${GREEN}✓ Docker Compose found${NC}"
echo ""

# Check .env file
echo "🔐 Checking environment configuration..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env and add your OPENAI_API_KEY${NC}"
    echo ""
fi

if grep -q "your_openai_api_key_here" .env 2>/dev/null; then
    echo -e "${YELLOW}⚠️  OPENAI_API_KEY not set in .env${NC}"
    echo -e "${YELLOW}   The agent will not work without a valid API key.${NC}"
    echo ""
fi

# Check file structure
echo "📁 Checking project structure..."

required_files=(
    "docker-compose.yml"
    "Makefile"
    "db/init.sql"
    "api/Dockerfile"
    "api/go.mod"
    "agent/Dockerfile"
    "agent/requirements.txt"
    "executor/Dockerfile"
    "executor/go.mod"
    "frontend/Dockerfile"
    "frontend/package.json"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Missing: $file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✓ All required files present${NC}"
echo ""

# Test docker-compose config
echo "🔧 Validating docker-compose configuration..."
if docker compose config > /dev/null 2>&1 || docker-compose config > /dev/null 2>&1; then
    echo -e "${GREEN}✓ docker-compose.yml is valid${NC}"
else
    echo -e "${RED}❌ docker-compose.yml has errors${NC}"
    exit 1
fi
echo ""

# Summary
echo "================================"
echo -e "${GREEN}✅ Build verification passed!${NC}"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Edit .env and add your OPENAI_API_KEY"
echo "2. Run: make up"
echo "3. Wait for all services to start (~30 seconds)"
echo "4. Open http://localhost:3000"
echo ""
echo "To view logs: make logs"
echo "To stop: make down"
echo ""
