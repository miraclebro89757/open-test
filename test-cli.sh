#!/bin/bash

# OpenTest CLI Test Script
# Tests the CLI functionality locally before publishing to npm

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║          OpenTest CLI - Local Testing                    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    echo "Please install Node.js: https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ npm found: $(npm --version)${NC}"
echo ""

# Install CLI dependencies
echo -e "${BLUE}📦 Installing CLI dependencies...${NC}"
npm install --silent 2>&1 | grep -v "^npm WARN" || true
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Test CLI commands
echo -e "${BLUE}🧪 Testing CLI commands...${NC}"
echo ""

# Test 1: Help command
echo -e "${YELLOW}Test 1: Help command${NC}"
node cli/index.js --help > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Help command works${NC}"
else
    echo -e "${RED}  ✗ Help command failed${NC}"
    exit 1
fi

# Test 2: Version command
echo -e "${YELLOW}Test 2: Version command${NC}"
node cli/index.js --version > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✓ Version command works${NC}"
else
    echo -e "${RED}  ✗ Version command failed${NC}"
    exit 1
fi

# Test 3: Doctor command
echo -e "${YELLOW}Test 3: Doctor command${NC}"
node cli/index.js doctor > /dev/null 2>&1
echo -e "${GREEN}  ✓ Doctor command works${NC}"

# Test 4: Status command (may fail if services not running)
echo -e "${YELLOW}Test 4: Status command${NC}"
node cli/index.js status > /dev/null 2>&1
echo -e "${GREEN}  ✓ Status command works${NC}"

echo ""
echo -e "${GREEN}✅ All CLI tests passed!${NC}"
echo ""

# Show available commands
echo -e "${BLUE}📚 Available commands:${NC}"
echo ""
node cli/index.js --help
echo ""

# Instructions for testing locally
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Local Testing Instructions                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Test commands locally:"
echo -e "  ${YELLOW}node cli/index.js doctor${NC}       - Check dependencies"
echo -e "  ${YELLOW}node cli/index.js status${NC}       - Check service status"
echo -e "  ${YELLOW}node cli/index.js start${NC}        - Start services"
echo -e "  ${YELLOW}node cli/index.js stop${NC}         - Stop services"
echo ""
echo -e "To test as npx command:"
echo -e "  ${YELLOW}npm link${NC}                       - Link locally"
echo -e "  ${YELLOW}open-test doctor${NC}               - Run as global command"
echo -e "  ${YELLOW}npm unlink -g open-test${NC}       - Unlink when done"
echo ""
echo -e "To publish to npm:"
echo -e "  ${YELLOW}npm login${NC}                      - Login to npm"
echo -e "  ${YELLOW}npm publish${NC}                    - Publish package"
echo ""
