#!/bin/bash
# Fix Pi Agent model configuration

echo "═══════════════════════════════════════════════════════════"
echo "  修复 Pi Agent 模型配置"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if models.json exists
MODELS_FILE="$HOME/.opentest/models.json"

if [ -f "$MODELS_FILE" ]; then
  echo "✓ 发现配置文件: $MODELS_FILE"
  echo ""
  echo "当前配置:"
  cat "$MODELS_FILE" | head -20
  echo ""
  read -p "是否删除此配置并重新配置？ (y/N): " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm "$MODELS_FILE"
    echo "✓ 已删除旧配置"
  fi
else
  echo "ℹ️  未找到配置文件"
fi

echo ""
echo "请选择配置方式："
echo ""
echo "1. 使用 DeepSeek（推荐，性价比高）"
echo "2. 使用 OpenAI GPT-4o-mini"
echo "3. 使用 Ollama（本地免费）"
echo "4. 自定义配置向导"
echo ""
read -p "选择 (1-4): " choice

case $choice in
  1)
    echo ""
    echo "配置 DeepSeek..."
    read -p "请输入 DeepSeek API Key: " api_key
    
    mkdir -p "$HOME/.opentest"
    cat > "$MODELS_FILE" <<EOF
{
  "active_profile": "deepseek",
  "profiles": {
    "deepseek": {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "apiKey": "$api_key",
      "baseUrl": "https://api.deepseek.com/v1"
    }
  },
  "failover_order": ["deepseek"]
}
EOF
    echo ""
    echo "✅ DeepSeek 配置完成！"
    echo ""
    echo "获取 API Key: https://platform.deepseek.com/"
    ;;
    
  2)
    echo ""
    echo "配置 OpenAI..."
    read -p "请输入 OpenAI API Key: " api_key
    
    mkdir -p "$HOME/.opentest"
    cat > "$MODELS_FILE" <<EOF
{
  "active_profile": "openai",
  "profiles": {
    "openai": {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "apiKey": "$api_key",
      "baseUrl": "https://api.openai.com/v1"
    }
  },
  "failover_order": ["openai"]
}
EOF
    echo ""
    echo "✅ OpenAI 配置完成！"
    ;;
    
  3)
    echo ""
    echo "配置 Ollama（本地）..."
    echo ""
    echo "确保 Ollama 已安装并运行："
    echo "  brew install ollama"
    echo "  ollama pull qwen2.5:14b"
    echo "  ollama serve"
    echo ""
    
    mkdir -p "$HOME/.opentest"
    cat > "$MODELS_FILE" <<EOF
{
  "active_profile": "ollama",
  "profiles": {
    "ollama": {
      "provider": "ollama",
      "model": "qwen2.5:14b",
      "apiKey": "ollama-no-key-required",
      "baseUrl": "http://localhost:11434/v1"
    }
  },
  "failover_order": ["ollama"]
}
EOF
    echo ""
    echo "✅ Ollama 配置完成！"
    ;;
    
  4)
    echo ""
    echo "启动配置向导..."
    node cli/commands/llm-config.js
    ;;
    
  *)
    echo ""
    echo "无效选择"
    exit 1
    ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  配置完成"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "配置文件: $MODELS_FILE"
echo ""
echo "测试配置:"
echo "  node diagnose-llm.js"
echo ""
echo "现在可以重新启动 Agent 并使用 /explore 了！"
echo ""
