import { loadAgentModule } from "./legacy";

export interface SourcePackNode {
  nodeId: string;
  url: string;
  title: string;
  extension: string;
  role: "root" | "linked" | "attachment" | "unread";
  reason?: string;
  parentId?: string | null;
  path?: string;
  revision?: string;
}

export interface SourcePack {
  product: string;
  root: { nodeId?: string; url?: string; title?: string };
  ingestedAt: string;
  depth: number;
  nodes: SourcePackNode[];
}

export interface IngestResult {
  pack: SourcePack;
  ingested: number;
  unread: number;
  manifest: string;
}

interface IngestModule {
  ingestRequirementSources: (options: {
    workspace: string;
    product?: string;
    url: string;
    depth?: number;
    fetcher?: unknown;
    env?: NodeJS.ProcessEnv;
  }) => Promise<IngestResult>;
  readSourcePack: (workspace: string) => SourcePack | null;
}

interface DingTalkModule {
  findDingTalkMcpUrl: (environment?: NodeJS.ProcessEnv) => string;
}

export function ingestModule(): IngestModule {
  return loadAgentModule<IngestModule>("sources/ingest.js");
}

export function dingTalkModule(): DingTalkModule {
  return loadAgentModule<DingTalkModule>("sources/dingtalk-mcp.js");
}

export function readSourcePack(workspace: string): SourcePack | null {
  return ingestModule().readSourcePack(workspace);
}

export function dingTalkMcpConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(dingTalkModule().findDingTalkMcpUrl(environment));
}

export function ingestRequirementSources(
  workspace: string,
  url: string,
  options: { product?: string; depth?: number } = {},
): Promise<IngestResult> {
  return ingestModule().ingestRequirementSources({
    workspace,
    product: options.product,
    url,
    depth: options.depth,
  });
}
