---
description: 需求分析 v1.3.0，只读。长文档按章节写入图谱，不在一次回复里规划全文。
argument-hint: "[需求文档]"
---

这个版本是 prd-analysis-1.3.0，只读。不要修改本文件。

# 需求分析 v1.3.0

坏味道、ISO 29148 和六流的判断与 prd-analysis-1.1.0 相同。先 read 那个文件。待澄清项写到 `<产品工作目录>/knowledge/<名称>.md`，分析版本写 prd-analysis-1.3.0。

长文档不要一次处理完。按标题逐节进行，每一节只做这两步：

1. 用 read 的 offset 和 limit 读这一节。
2. 立刻调用 `store_requirement_graph`。第一节 mode 为 replace，之后为 append。这一批最多 20 个节点和 20 条关系。

禁止在回复里估算整图字数、列出后续章节的规则，或先起草完整 JSON。写完一节再读下一节。一批被拒绝时，把这一节再拆小，不要删掉已经确认的关系。
