import fs from "node:fs";
import path from "node:path";
import { readCheckpoint, type CheckpointTask } from "./checkpoint";
import {
  STATUS_CONFIRMED,
  listAutomationScripts,
  listMarkdownFiles,
  readCases,
  readGraphSummary,
  readTestPoints,
} from "./assets";

/** The seven stages shown in the pipeline bar, in order. */
export const PIPELINE = [
  { id: "analysis", label: "需求", task: "analysis", panel: "knowledge" },
  { id: "test-points", label: "测试点", task: "test-points", panel: "test-points" },
  { id: "cases", label: "用例", task: "cases", panel: "cases" },
  { id: "record", label: "录制", task: "record", panel: "record" },
  { id: "run", label: "执行", task: null, panel: "run" },
  { id: "defects", label: "缺陷", task: "defects", panel: "defects" },
  { id: "report", label: "报告", task: "report", panel: "report" },
] as const;

export type PipelineId = (typeof PIPELINE)[number]["id"];
export type StageStatus = "pending" | "in_progress" | "failed" | "done";

export interface StageOverview {
  id: PipelineId;
  label: string;
  panel: string;
  status: StageStatus;
  /** Steps registered with task_checkpoint, when the agent has planned any. */
  stepsDone: number;
  stepsTotal: number;
  /** The step the agent would resume from. */
  nextStep: string;
}

export interface QaCounts {
  knowledge: number;
  graphNodes: number;
  points: number;
  pointsConfirmed: number;
  cases: number;
  casesAutomated: number;
  uiScripts: number;
  apiScripts: number;
  defects: number;
  reports: number;
}

export interface QaOverview {
  workspace: string;
  product: string;
  stages: StageOverview[];
  /** First stage that is not done, or null once everything is. */
  currentStage: PipelineId | null;
  counts: QaCounts;
}

function hasRunResults(workspace: string): boolean {
  return fs.existsSync(path.join(workspace, "reports", "runs"));
}

function taskStage(task: CheckpointTask | undefined, fallbackHasFiles: boolean): Omit<StageOverview, "id" | "label" | "panel"> {
  const steps = task?.steps ?? [];
  const stepsDone = steps.filter((step) => step.status === "done").length;
  const next = steps.find((step) => step.status === "failed" || step.status === "pending");
  let status: StageStatus;
  if (steps.length) {
    if (steps.some((step) => step.status === "failed")) status = "failed";
    else if (stepsDone === steps.length) status = "done";
    else status = stepsDone ? "in_progress" : "pending";
  } else {
    status = fallbackHasFiles ? "in_progress" : "pending";
  }
  return { status, stepsDone, stepsTotal: steps.length, nextStep: next?.id ?? "" };
}

export function readQaOverview(workspace: string): QaOverview {
  const checkpoint = readCheckpoint(workspace);
  const points = readTestPoints(workspace).flatMap((file) => file.items);
  const cases = readCases(workspace).flatMap((file) => file.items);
  const scripts = listAutomationScripts(workspace);
  const counts: QaCounts = {
    knowledge: listMarkdownFiles(workspace, "knowledge").length,
    graphNodes: readGraphSummary(workspace)?.nodes ?? 0,
    points: points.length,
    pointsConfirmed: points.filter((point) => point.status === STATUS_CONFIRMED).length,
    cases: cases.length,
    casesAutomated: cases.filter((item) => item.automated).length,
    uiScripts: scripts.filter((script) => script.kind === "ui").length,
    apiScripts: scripts.filter((script) => script.kind === "api").length,
    defects: listMarkdownFiles(workspace, "defects").length,
    reports: listMarkdownFiles(workspace, "reports").length,
  };

  const filesFor: Record<PipelineId, boolean> = {
    analysis: counts.knowledge > 0 || counts.graphNodes > 0,
    "test-points": counts.points > 0,
    cases: counts.cases > 0,
    record: counts.uiScripts + counts.apiScripts > 0,
    run: hasRunResults(workspace),
    defects: counts.defects > 0,
    report: counts.reports > 0,
  };

  const stages = PIPELINE.map<StageOverview>((stage) => {
    let overview = taskStage(stage.task ? checkpoint?.tasks?.[stage.task] : undefined, filesFor[stage.id]);
    // Without a registered plan, test points are finished once a person has confirmed them all.
    // With a plan, its steps decide: points still to be written are not done.
    if (stage.id === "test-points" && overview.stepsTotal === 0 && counts.points > 0 && counts.pointsConfirmed === counts.points) {
      overview = { ...overview, status: "done" };
    }
    // Without a registered plan, the run stage is whatever files say.
    if (stage.id === "run" && filesFor.run) overview = { ...overview, status: "done" };
    return { id: stage.id, label: stage.label, panel: stage.panel, ...overview };
  });

  return {
    workspace,
    product: checkpoint?.product || path.basename(workspace),
    stages,
    currentStage: stages.find((stage) => stage.status !== "done")?.id ?? null,
    counts,
  };
}
