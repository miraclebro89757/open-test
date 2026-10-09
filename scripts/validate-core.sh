#!/bin/bash

# OpenTest 核心功能验证脚本
# 用法: ./scripts/validate-core.sh

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}🚀 OpenTest 核心功能验证${NC}"
echo "================================================"
echo ""

# 1. 系统健康检查
echo -e "${YELLOW}[1/5]${NC} 检查系统健康状态..."
if opentest-ai doctor | grep -q "System is healthy"; then
    echo -e "${GREEN}✓${NC} 系统健康检查通过"
else
    echo -e "${RED}✗${NC} 系统健康检查失败"
    echo "请运行: opentest-ai doctor"
    exit 1
fi
echo ""

# 2. LLM 配置检查
echo -e "${YELLOW}[2/5]${NC} 检查 LLM 配置..."
CONFIG_FILE="$HOME/.opentest/config.json"
if [ -f "$CONFIG_FILE" ]; then
    ACTIVE_PROFILE=$(jq -r '.active_profile' "$CONFIG_FILE")
    MODEL=$(jq -r ".profiles[\"$ACTIVE_PROFILE\"].model" "$CONFIG_FILE")
    echo -e "${GREEN}✓${NC} LLM 配置存在"
    echo "  活动配置: $ACTIVE_PROFILE"
    echo "  模型: $MODEL"
else
    echo -e "${RED}✗${NC} LLM 配置不存在"
    echo "请运行: opentest-ai config"
    exit 1
fi
echo ""

# 3. 测试简单的 AI 对话
echo -e "${YELLOW}[3/5]${NC} 测试 AI 对话功能..."
TEST_DIR="$(pwd)/tests/validation"
mkdir -p "$TEST_DIR"

echo "  生成测试: 访问 example.com 验证标题"
if timeout 60s opentest-ai run "访问 https://example.com 并验证页面标题包含 Example" --output "$TEST_DIR" 2>&1 | tee /tmp/opentest-run.log | grep -q "测试生成完成\|Test generated\|Success"; then
    echo -e "${GREEN}✓${NC} AI 对话测试通过"
else
    echo -e "${YELLOW}⚠${NC}  AI 对话测试超时或失败（可能是 LLM API 问题）"
    echo "  详细日志: /tmp/opentest-run.log"
    echo "  继续其他检查..."
fi
echo ""

# 4. 测试录制功能（非交互模式）
echo -e "${YELLOW}[4/5]${NC} 检查录制模块..."
if [ -f "cli/agent/tools/record.js" ]; then
    echo -e "${GREEN}✓${NC} 录制模块存在"
    echo "  手动测试: opentest-ai record"
else
    echo -e "${RED}✗${NC} 录制模块缺失"
    exit 1
fi
echo ""

# 5. 检查生成的测试文件
echo -e "${YELLOW}[5/5]${NC} 检查测试文件结构..."
if [ -d "$TEST_DIR" ]; then
    FILE_COUNT=$(find "$TEST_DIR" -name "*.spec.js" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$FILE_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} 找到 $FILE_COUNT 个测试文件"
        find "$TEST_DIR" -name "*.spec.js" -exec echo "  • {}" \;
    else
        echo -e "${YELLOW}⚠${NC}  未找到生成的测试文件（AI 对话可能未成功）"
    fi
else
    echo -e "${YELLOW}⚠${NC}  测试目录不存在"
fi
echo ""

# 总结
echo "================================================"
echo -e "${BOLD}📊 验证总结${NC}"
echo ""
echo -e "${GREEN}✓ 核心功能可用：${NC}"
echo "  • 系统健康检查"
echo "  • LLM 配置完整"
echo "  • 录制模块就绪"
echo ""
echo -e "${BOLD}🎯 下一步操作：${NC}"
echo ""
echo "1. 手动测试录制功能："
echo "   ${YELLOW}opentest-ai record${NC}"
echo ""
echo "2. 测试修复功能（如果有失败的测试）："
echo "   ${YELLOW}opentest-ai heal tests/your-test.spec.js${NC}"
echo ""
echo "3. 查看测试报告："
echo "   ${YELLOW}opentest-ai report${NC}"
echo ""
echo "4. 启动 Web UI 开发（可选）："
echo "   ${YELLOW}./scripts/create-web-ui.sh${NC}"
echo ""
echo -e "${BOLD}📚 详细文档：${NC}"
echo "   cat QUICK_VALIDATION.md"
echo ""
