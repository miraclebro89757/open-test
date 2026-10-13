import { loadAgentModule } from "./legacy";

export interface CaseSheetBinding {
  nodeId?: string;
  url?: string;
  sheetId?: string;
  sheetName?: string;
  title?: string;
  lastPushAt?: string;
  lastPullAt?: string;
  hashes?: Record<string, string>;
  rowCount?: number;
}

export interface CaseSheetSyncResult {
  action: "push" | "pull";
  written?: number;
  updated?: number;
  imported?: number;
  conflicts?: number;
  missing?: number;
  lessons?: number;
  url?: string;
  nodeId?: string;
  sheetId?: string;
}

interface CaseSheetModule {
  inferWorkspaceVersion: (workspace: string) => string;
  readCaseSheetBinding: (workspace: string) => CaseSheetBinding | null;
  syncCaseSheet: (options: {
    workspace: string;
    product?: string;
    action?: string;
    url?: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<CaseSheetSyncResult>;
}

interface ExcelModule {
  findDingTalkExcelMcpUrl: (environment?: NodeJS.ProcessEnv) => string;
}

function caseSheetModule(): CaseSheetModule {
  return loadAgentModule<CaseSheetModule>("sources/case-sheet.js");
}

function excelModule(): ExcelModule {
  return loadAgentModule<ExcelModule>("sources/dingtalk-excel.js");
}

export function readCaseSheetBinding(workspace: string): CaseSheetBinding | null {
  return caseSheetModule().readCaseSheetBinding(workspace);
}

export function inferWorkspaceVersion(workspace: string): string {
  return caseSheetModule().inferWorkspaceVersion(workspace);
}

export function dingTalkExcelMcpConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(excelModule().findDingTalkExcelMcpUrl(environment));
}

export function syncCaseSheet(
  workspace: string,
  action: "push" | "pull",
  options: { product?: string; url?: string } = {},
): Promise<CaseSheetSyncResult> {
  return caseSheetModule().syncCaseSheet({
    workspace,
    product: options.product,
    action,
    url: options.url,
  });
}
