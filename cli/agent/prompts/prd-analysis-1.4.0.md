---
description: 需求分析 v1.4.0，只读。按章节写入图谱，中断后从任务断点继续。
argument-hint: "[需求文档]"
---

这个版本是 prd-analysis-1.4.0，只读。不要修改本文件。

# 需求分析 v1.4.0

坏味道、ISO 29148 和六流的判断与 prd-analysis-1.1.0 相同。先 read 那个文件。待澄清项写到 `<产品工作目录>/knowledge/<名称>.md`，分析版本写 prd-analysis-1.4.0。

开始前调用 `task_checkpoint`，action 为 status。已完成的章节不要重做。

长文档不要一次处理完。还没有步骤时，用 action plan、task analysis，把文档标题一行一个放进 steps。然后只处理下一步：

1. 用 read 的 offset 和 limit 读这一节。
2. 立刻调用 `store_requirement_graph`。第一节 mode 为 replace，之后为 append。这一批最多 20 个节点和 20 条关系。同一节的最后一批才把 taskStep 设为这一节的标题。
3. 工具没有记下该步时，再调用 `task_checkpoint`，action 为 complete。

禁止在回复里估算整图字数、列出后续章节的规则，或先起草完整 JSON。写完一节再读下一节。一批被拒绝或会话中断时，下次从 `tasks/status.md` 的下一步继续，不要从头再来，也不要删掉已经确认的关系。
