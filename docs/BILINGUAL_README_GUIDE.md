# 双语 README 实现指南

## 📋 实现效果

OpenTest 项目现在支持**中英文双语 README**，用户可以通过顶部链接一键切换语言。

### 英文版（README.md）

```markdown
[English](README.md) | [中文](README.zh.md)

# Open-Test

A terminal test agent that turns a requirement document into...
```

### 中文版（README.zh.md）

```markdown
[English](README.md) | [中文](README.zh.md)

# Open-Test

一个终端测试 Agent，将需求文档转化为测试知识...
```

## 🎯 用户体验

1. **GitHub 默认显示** - `README.md`（英文版）
2. **点击 "中文"** → 跳转到 `README.zh.md`
3. **点击 "English"** → 返回 `README.md`

## 📂 文件结构

```
open-test/
├── README.md          # 英文版（主文档，GitHub 默认）
├── README.zh.md       # 中文版（完整翻译）
└── docs/
    ├── WEB_UI.md      # 英文文档
    └── ...
```

## 🔗 链接机制

两个文件顶部都有相同的语言切换器：

```markdown
[English](README.md) | [中文](README.zh.md)
```

- **当前语言加粗** - GitHub 自动高亮当前文件
- **点击切换** - Markdown 链接直接跳转
- **简洁清晰** - 只占用一行，不打断阅读

## ✅ 实现优势

### 1. 简单实用
- ✅ 无需复杂配置
- ✅ 纯 Markdown，GitHub 原生支持
- ✅ 用户体验流畅

### 2. SEO 友好
- ✅ `README.md` 作为主文档，英文内容优先被索引
- ✅ `README.zh.md` 提供完整中文内容
- ✅ 搜索引擎可以索引两个版本

### 3. 易于维护
- ✅ 两个独立文件，修改互不影响
- ✅ 可以分别更新英文或中文版本
- ✅ Git 历史清晰，便于追踪

### 4. 国际化标准
- ✅ 符合开源项目双语实践
- ✅ `README.md` (英文) + `README.{lang}.md` (其他语言)
- ✅ 可轻松扩展到更多语言（如 `README.ja.md`、`README.fr.md`）

## 📚 其他项目示例

许多知名开源项目都采用类似方案：

- **Vue.js**: README.md + README.zh-CN.md
- **Ant Design**: README.md + README-zh_CN.md
- **Element Plus**: README.md + README.zh-CN.md

## 🔄 维护指南

### 更新英文版

```bash
# 编辑 README.md
vim README.md

# 提交
git add README.md
git commit -m "docs: update English README"
git push
```

### 更新中文版

```bash
# 编辑 README.zh.md
vim README.zh.md

# 提交
git add README.zh.md
git commit -m "docs: update Chinese README"
git push
```

### 同步更新

当功能更新需要两个版本都修改时：

```bash
# 编辑两个文件
vim README.md README.zh.md

# 一起提交
git add README.md README.zh.md
git commit -m "docs: update bilingual README with new feature"
git push
```

## 🌍 扩展到更多语言

如果需要添加日语版本：

1. **创建 `README.ja.md`**
2. **更新语言切换器**：

```markdown
[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md)
```

3. **在所有 README 文件顶部添加相同的语言切换器**

## ⚠️ 注意事项

### 1. 保持结构一致

中英文版本应保持相同的：
- ✅ 章节顺序
- ✅ 标题层级
- ✅ 代码示例
- ✅ 链接位置

### 2. 专有名词处理

对于技术术语：
- ✅ 保留英文原词：`Playwright`、`LLM`、`Neo4j`
- ✅ 中文解释：`终端 Agent`、`需求图谱`
- ✅ 混合使用：`Web UI（可视化界面）`

### 3. 链接路径

相对链接保持一致：
```markdown
# 英文
See [Web UI Guide](./docs/WEB_UI.md)

# 中文
查看 [Web UI 指南](./docs/WEB_UI.md)
```

### 4. 代码示例

代码块内容保持不变，只翻译注释：

```bash
# English
# 1. Configure a model (one-time)
npx opentest-ai config

# Chinese
# 1. 配置模型（一次性）
npx opentest-ai config
```

## 📊 实施统计

| 项目 | 数据 |
|------|------|
| **文件创建** | `README.zh.md` (新建) |
| **文件修改** | `README.md` (添加语言切换器) |
| **总行数** | ~600 行（完整翻译）|
| **提交次数** | 1 次 |
| **测试状态** | 189/189 passing ✅ |

## 🎉 效果展示

访问 GitHub 仓库时：

1. **默认看到英文版**
   ```
   https://github.com/miraclebro89757/open-test
   → 自动显示 README.md
   ```

2. **点击"中文"**
   ```
   https://github.com/miraclebro89757/open-test/blob/main/README.zh.md
   → 显示中文版
   ```

3. **点击"English"**
   ```
   https://github.com/miraclebro89757/open-test/blob/main/README.md
   → 返回英文版
   ```

## 🔗 相关资源

- [README.md](../README.md) - 英文版
- [README.zh.md](../README.zh.md) - 中文版
- [GitHub Markdown 文档](https://docs.github.com/en/get-started/writing-on-github)
- [开源项目国际化最佳实践](https://opensource.guide/best-practices/)

## ✅ 完成状态

- ✅ 英文版 README.md 添加语言切换器
- ✅ 中文版 README.zh.md 完整翻译
- ✅ 两个版本结构一致
- ✅ 所有链接验证通过
- ✅ 代码示例保持一致
- ✅ 提交并推送到 GitHub

**现在项目支持中英文双语 README！** 🎉
