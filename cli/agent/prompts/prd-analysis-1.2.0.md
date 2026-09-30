---
description: 需求分析 v1.2.0，只读。审查需求后分批写入图谱。
argument-hint: "[需求文档]"
---

这个版本是 prd-analysis-1.2.0，只读。不要修改本文件。要换规则，用 / 选择别的 prompt 版本。

# 需求分析 v1.2.0

审查规则与 prd-analysis-1.1.0 相同：先 read 那个文件，按坏味道、ISO 29148 和六流写 `<产品工作目录>/knowledge/<名称>.md`。分析版本写 prd-analysis-1.2.0。待澄清项只放在 knowledge。

图谱不要一次提交。`store_requirement_graph` 的 graph 参数放不下整张图时，JSON 会在末尾被截断。按这个顺序分批调用：

1. features。mode 用 replace。
2. scenarios。mode 用 append。
3. preconditions、actions、states、rules。可以按类型再拆开。mode 用 append。
4. relationships。每批大约 40 条。mode 用 append。

不要为了缩短而删掉关系，也不要把需求原文放进节点。每批都是完整、可解析的 JSON，只包含这一批的数组。功能上的 platform、module、priority 可以保留。写完最后一批后，读 `graph/index.md` 确认场景还在。
