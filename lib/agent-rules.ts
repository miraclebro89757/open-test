import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The file a web session reads from a directory, in Pi's order. */
const CONTEXT_FILES = ["AGENTS.override.md", "AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"] as const;

export const AGENT_RULES_FILENAME = "AGENTS.md";
/** A system prompt, not a document. Larger text is refused. */
export const AGENT_RULES_MAX_BYTES = 200_000;

export class AgentRulesError extends Error {
  constructor(readonly code: "missing-directory" | "not-a-file" | "symlink" | "outside" | "too-large") {
    super(code);
    this.name = "AgentRulesError";
  }
}

export interface AgentRulesDocument {
  /** Absolute path of the AGENTS.md this editor writes. */
  path: string;
  content: string;
  exists: boolean;
  /**
   * The context file a web session actually loads from this directory.
   * Null when the directory has none. A different name means this AGENTS.md
   * is not the file the session reads.
   */
  activeFile: string | null;
}

export function agentRulesPath(directory: string): string {
  return join(directory, AGENT_RULES_FILENAME);
}

/** Which context file Pi would load from this directory, if any. */
export function activeContextFile(directory: string): string | null {
  for (const name of CONTEXT_FILES) {
    const filePath = join(directory, name);
    if (!existsSync(filePath)) continue;
    try {
      if (lstatSync(filePath).isFile() || lstatSync(filePath).isSymbolicLink()) return name;
    } catch {
      continue;
    }
  }
  return null;
}

function assertDirectory(directory: string): string {
  if (!existsSync(directory)) throw new AgentRulesError("missing-directory");
  let root: string;
  try {
    root = realpathSync(directory);
  } catch {
    throw new AgentRulesError("missing-directory");
  }
  if (!lstatSync(root).isDirectory()) throw new AgentRulesError("missing-directory");
  return root;
}

function assertEditableFile(root: string): string {
  const filePath = join(root, AGENT_RULES_FILENAME);
  if (!existsSync(filePath)) return filePath;
  const stat = lstatSync(filePath);
  if (stat.isSymbolicLink()) throw new AgentRulesError("symlink");
  if (!stat.isFile()) throw new AgentRulesError("not-a-file");
  if (realpathSync(filePath) !== filePath) throw new AgentRulesError("outside");
  return filePath;
}

export function readAgentRules(directory: string): AgentRulesDocument {
  const root = assertDirectory(directory);
  const filePath = join(root, AGENT_RULES_FILENAME);
  const activeFile = activeContextFile(root);
  if (!existsSync(filePath)) {
    return { path: filePath, content: "", exists: false, activeFile };
  }
  const editable = assertEditableFile(root);
  return {
    path: editable,
    content: readFileSync(editable, "utf8"),
    exists: true,
    activeFile,
  };
}

export function writeAgentRules(directory: string, content: string): AgentRulesDocument {
  if (Buffer.byteLength(content, "utf8") > AGENT_RULES_MAX_BYTES) throw new AgentRulesError("too-large");
  const root = assertDirectory(directory);
  const filePath = assertEditableFile(root);
  const temporary = join(root, `.${AGENT_RULES_FILENAME}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode: 0o644 });
    renameSync(temporary, filePath);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file was already moved, or never created.
    }
    throw error;
  }
  return readAgentRules(root);
}
