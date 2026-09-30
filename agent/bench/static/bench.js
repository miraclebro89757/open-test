const HINTS = {
  cases: "贴一段需求。操作台会写出可执行的用例。",
  review: "留空则评审刚才生成的用例。也可以把用例贴进来。",
  defects: "贴 Jira 或禅道记录。只汇总原文里出现的内容。",
  report: "留空则根据刚才的用例写简报。也可以补一句你要强调的风险。",
  locator: "贴失败记录：旧定位器、页面上能看见的文字、报错。这里只给出新定位器，不会打开浏览器。",
};

const state = {
  kind: "cases",
  jobs: [],
  runs: [],
  selected: null,
  polling: 0,
};

const jobsEl = document.querySelector("#jobs");
const transcriptEl = document.querySelector("#transcript");
const sheetEl = document.querySelector("#sheet");
const inputEl = document.querySelector("#input");
const hintEl = document.querySelector("#hint");
const submitEl = document.querySelector("#submit");
const statusLine = document.querySelector("#status-line");
const statusDot = document.querySelector("#status-dot");
const modelEl = document.querySelector("#model");
const form = document.querySelector("#composer");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function priorityWord(value) {
  return { high: "高", medium: "中", low: "低" }[value] || value || "";
}

async function loadHealth() {
  const response = await fetch("/api/health");
  const data = await response.json();
  if (!data.ok) {
    modelEl.textContent = data.error || "模型配置还不能调用";
    return;
  }
  modelEl.textContent = `${data.profile}\n${data.provider} · ${data.model}\n${data.key}`;
}

async function loadJobs() {
  const response = await fetch("/api/jobs");
  const data = await response.json();
  state.jobs = data.jobs || [];
  renderJobs();
}

function renderJobs() {
  jobsEl.replaceChildren();
  for (const job of state.jobs) {
    const button = el("button", "job", job.label);
    button.type = "button";
    button.prepend(el("span", "swatch"));
    if (job.kind === state.kind) button.setAttribute("aria-current", "true");
    button.addEventListener("click", () => {
      state.kind = job.kind;
      hintEl.textContent = HINTS[job.kind] || "";
      submitEl.textContent = job.label;
      renderJobs();
    });
    jobsEl.append(button);
  }
}

function selectedRun() {
  return state.runs.find((run) => run.id === state.selected) || state.runs.at(-1) || null;
}

function renderTranscript() {
  const running = state.runs.some((run) => run.status === "running");
  submitEl.disabled = running;
  const current = selectedRun();
  if (running) {
    statusDot.dataset.on = "running";
    statusLine.textContent = "模型正在写。这一步通常要几十秒。";
  } else if (current && current.status === "error") {
    statusDot.dataset.on = "error";
    statusLine.textContent = current.error || "这次没有写完";
  } else if (current && current.status === "done") {
    statusDot.dataset.on = "done";
    statusLine.textContent = `${current.label} 已写好。产出在右侧。`;
  } else {
    statusDot.dataset.on = "idle";
    statusLine.textContent = "选一件事，把材料贴在下面。";
  }

  transcriptEl.replaceChildren();
  for (const run of state.runs) {
    const item = document.createElement("li");
    const button = el("button", "run");
    button.type = "button";
    if (run.id === state.selected) button.setAttribute("aria-current", "true");
    const head = el("div", "run-head");
    head.append(el("strong", "", run.label), el("span", "", run.createdAt.slice(11, 16)), el("span", "", statusWord(run.status)));
    button.append(head, el("p", "ask", run.input || "沿用上一份用例"));
    const events = el("ul", "events");
    for (const event of run.events || []) events.append(el("li", "", event.text));
    button.append(events);
    button.addEventListener("click", () => {
      state.selected = run.id;
      renderTranscript();
      renderSheet();
    });
    item.append(button);
    transcriptEl.append(item);
  }
  const last = transcriptEl.lastElementChild;
  if (last && running) last.scrollIntoView({ block: "nearest" });
}

function statusWord(status) {
  return { running: "进行中", done: "完成", error: "未完成" }[status] || status;
}

function renderSheet() {
  const run = selectedRun();
  const artifact = run && run.artifact;
  if (!artifact) {
    sheetEl.className = "sheet-empty";
    sheetEl.replaceChildren(el("p", "", run && run.status === "running" ? "正在写。" : "产出会写在这里。"));
    return;
  }
  sheetEl.className = "sheet";
  sheetEl.replaceChildren();
  const kind = artifact.kind;
  if (kind === "cases") renderCases(artifact);
  else if (kind === "review") renderReview(artifact);
  else if (kind === "defects") renderDefects(artifact);
  else if (kind === "report") renderReport(artifact);
  else if (kind === "locator") renderLocator(artifact);
  else {
    if (artifact.warning) sheetEl.append(el("p", "warn", artifact.warning));
    sheetEl.append(el("p", "plain", artifact.text || "模型没有返回可排版的内容。"));
  }
}

function renderCases(artifact) {
  sheetEl.append(el("h2", "", `用例 ${artifact.cases.length} 条`));
  if (artifact.warning) sheetEl.append(el("p", "warn", artifact.warning));
  for (const item of artifact.cases) {
    const block = el("article", "case");
    const title = el("h3", "");
    if (item.priority === "high") title.append(el("span", "mark"));
    title.append(document.createTextNode(item.name || "未命名用例"));
    block.append(title);
    block.append(el("p", "meta", [priorityWord(item.priority), item.type].filter(Boolean).join(" · ")));
    if (item.description) block.append(el("p", "", item.description));
    const steps = Array.isArray(item.steps) ? item.steps : [];
    if (steps.length) {
      const list = document.createElement("ol");
      for (const step of steps) list.append(el("li", "", typeof step === "string" ? step : JSON.stringify(step)));
      block.append(list);
    }
    if (item.expected_result) block.append(el("p", "", `期望：${item.expected_result}`));
    sheetEl.append(block);
  }
}

function renderReview(artifact) {
  sheetEl.append(el("h2", "", "评审"));
  if (artifact.summary) sheetEl.append(el("p", "lede", artifact.summary));
  for (const finding of artifact.findings || []) {
    const block = el("article", "finding");
    const title = el("h3", "");
    if (finding.severity === "high") title.append(el("span", "mark"));
    title.append(document.createTextNode(finding.title || "发现"));
    block.append(title, el("p", "meta", priorityWord(finding.severity)));
    if (finding.detail) block.append(el("p", "", finding.detail));
    sheetEl.append(block);
  }
}

function renderDefects(artifact) {
  sheetEl.append(el("h2", "", artifact.headline || "缺陷汇总"));
  for (const group of artifact.groups || []) {
    const block = el("section", "group");
    block.append(el("h3", "", group.name || "未分组"));
    const list = document.createElement("ul");
    for (const item of group.items || []) list.append(el("li", "", String(item)));
    block.append(list);
    sheetEl.append(block);
  }
  if (artifact.ask) sheetEl.append(el("p", "lede", artifact.ask));
}

function renderReport(artifact) {
  sheetEl.append(el("h2", "", artifact.title || "高管简报"));
  if (artifact.headline) sheetEl.append(el("p", "lede", artifact.headline));
  addList("结论", artifact.bullets);
  addList("风险", artifact.risks);
  addList("下一步", artifact.next);
}

function renderLocator(artifact) {
  sheetEl.append(el("h2", "", "定位器修复"));
  sheetEl.append(el("p", "meta", `把握：${priorityWord(artifact.confidence) || artifact.confidence || ""}`));
  if (artifact.old) sheetEl.append(el("p", "", `原来：${artifact.old}`));
  if (artifact.proposed) sheetEl.append(el("p", "lede", artifact.proposed));
  if (artifact.why) sheetEl.append(el("p", "", artifact.why));
}

function addList(title, items) {
  if (!items || !items.length) return;
  const block = el("section", "group");
  block.append(el("h3", "", title));
  const list = document.createElement("ul");
  for (const item of items) list.append(el("li", "", String(item)));
  block.append(list);
  sheetEl.append(block);
}

async function refresh() {
  const response = await fetch("/api/runs");
  const data = await response.json();
  state.runs = data.runs || [];
  if (!state.selected && state.runs.length) state.selected = state.runs.at(-1).id;
  renderTranscript();
  renderSheet();
  const running = state.runs.some((run) => run.status === "running");
  if (running && !state.polling) state.polling = window.setInterval(refresh, 1000);
  if (!running && state.polling) {
    window.clearInterval(state.polling);
    state.polling = 0;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitEl.disabled) return;
  const input = inputEl.value;
  submitEl.disabled = true;
  statusDot.dataset.on = "running";
  statusLine.textContent = "已提交。";
  const response = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: state.kind, input }),
  });
  const data = await response.json();
  if (!response.ok) {
    statusDot.dataset.on = "error";
    statusLine.textContent = data.error || "没有提交成功";
    submitEl.disabled = false;
    return;
  }
  inputEl.value = "";
  state.selected = data.id;
  await refresh();
});

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

loadJobs().then(loadHealth).then(refresh);
