import { loadAgentModule } from "./legacy";

export interface EvolutionDecision {
  asset_id: string;
  action: string;
}

interface MigrationModule {
  readPlan(workspace: string): Record<string, unknown> | null;
  applyMigration(options: { workspace: string; decisions: EvolutionDecision[] }): Record<string, unknown>;
}

function migrationModule(): MigrationModule {
  return loadAgentModule<MigrationModule>("evolution/migrate.js");
}

export function readEvolutionPlan(workspace: string): Record<string, unknown> | null {
  return migrationModule().readPlan(workspace);
}

export function applyEvolutionPlan(workspace: string, decisions: EvolutionDecision[]): Record<string, unknown> {
  return migrationModule().applyMigration({ workspace, decisions });
}
