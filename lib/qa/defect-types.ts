// Client-safe shapes for the defect panel: no node imports.

export interface Bug {
  source: "zentao" | "jira" | string;
  id: string;
  title: string;
  priority: string;
  status: string;
}

export interface DefectList {
  fetchedAt: string;
  bugs: Bug[];
}

export interface DefectSystemSetup {
  configured: boolean;
  /** Environment variable names still to be set. Names only, never values. */
  missing: string[];
  required: string[];
  optional?: string[];
}

export interface DefectSetup {
  zentao: DefectSystemSetup;
  jira: DefectSystemSetup;
}

export function countByStatus(bugs: Bug[]): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>();
  for (const bug of bugs) counts.set(bug.status || "未知", (counts.get(bug.status || "未知") ?? 0) + 1);
  return [...counts].map(([status, count]) => ({ status, count }));
}
