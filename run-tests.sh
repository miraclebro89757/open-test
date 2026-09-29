#!/bin/bash

# OpenTest Integration Test Runner
# This script runs all integration tests for the core call chains

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     OpenTest Integration Test Suite                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to run tests
run_test() {
    local test_name=$1
    local test_file=$2
    
    echo -e "${YELLOW}Running: ${test_name}${NC}"
    echo "─────────────────────────────────────────────────────────"
    
    cd tests
    cargo test --test "$test_file" -- --nocapture
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${test_name} PASSED${NC}"
    else
        echo -e "${RED}✗ ${test_name} FAILED${NC}"
        exit 1
    fi
    
    echo ""
    cd ..
}

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Cargo not found. Please install Rust.${NC}"
    exit 1
fi

# Run all test suites
echo -e "${BLUE}Test Suite 1: Worker Pool${NC}"
run_test "Worker Pool Tests" "test_worker_pool"

echo -e "${BLUE}Test Suite 2: Semantic Engine${NC}"
run_test "Semantic Engine Tests" "test_semantic_engine"

echo -e "${BLUE}Test Suite 3: Event Bus${NC}"
run_test "Event Bus Tests" "test_event_bus"

echo -e "${BLUE}Test Suite 4: End-to-End Integration${NC}"
run_test "E2E Integration Tests" "integration_test"

# Summary
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     All Tests Passed                                     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Worker Pool Tests${NC}"
echo -e "${GREEN}✓ Semantic Engine Tests${NC}"
echo -e "${GREEN}✓ Event Bus Tests${NC}"
echo -e "${GREEN}✓ End-to-End Integration Tests${NC}"
echo ""
echo -e "${BLUE}All core call chains verified!${NC}"
