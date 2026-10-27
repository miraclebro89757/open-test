// Client-safe shapes for the defect panel: no node imports.

export interface Bug {
  source: string;
  id: string;
  title: string;
  priority: string;
  status: string;
}

export interface DefectList {
  fetchedAt: string;
  bugs: Bug[];
}

/** A bug tracker the user connected in MCP settings. No URL and no token. */
export interface TrackerMcp {
  name: string;
  kind: "jira" | "zentao" | "tracker" | string;
  enabled: boolean;
}

export interface DefectSetup {
  trackers: TrackerMcp[];
}

export function countByStatus(bugs: Bug[]): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>();
  for (const bug of bugs) counts.set(bug.status || "未知", (counts.get(bug.status || "未知") ?? 0) + 1);
  return [...counts].map(([status, count]) => ({ status, count }));
}
