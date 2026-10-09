# Pi Web 上游记录

根目录的 `app/`、`components/`、`hooks/`、`lib/`（`lib/qa/` 除外）、`public/`、`bin/`、`e2e/` 以及 `next.config.ts`、`proxy.ts`、`instrumentation*.ts`、`tsconfig.json`、`postcss.config.mjs`、`tailwind.config.ts`、`eslint.config.mjs` 来自 [agegr/pi-web](https://github.com/agegr/pi-web)，协议是 MIT，声明见同目录 `LICENSE`。

| 项 | 值 |
| --- | --- |
| 上游仓库 | https://github.com/agegr/pi-web |
| 引入的版本 | v0.11.0 |
| 上游提交 | `c9e1513245c7ea73dafb2bb81791e8da20bfe3cf` |
| 引入日期 | 2026-10-09 |
| 引入方式 | 整体复制，没有保留上游 git 历史 |

## 没有引入的内容

- `demo/`：上游用来截图的演示应用，有自己的 `package.json`。
- `.github/`：上游的发布流程。
- 上游的 `README*.md`：改放在本目录，根目录 `README.md` 是 OpenTest 自己的。
- 上游 `AGENTS.md`、`CONTEXT.md` 也放在本目录。放在根目录会被 Pi 当作上下文文件自动读取。

## 改动 Pi Web 原有文件时

- 尽量把 QA 相关代码放在 `lib/qa/` 和新增的 `app/qa/`、`components/qa/` 下，少动上游文件，这样以后同步上游时冲突更少。
- 必须改上游文件时，在提交信息里写明，方便之后对照上游差异。
- 同步上游：拉取新版本到临时目录，只对比上面列出的目录和文件，不要覆盖 `lib/qa/`。
