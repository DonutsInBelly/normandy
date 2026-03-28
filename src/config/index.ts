import { OrchestratorConfig, DEFAULT_CONFIG } from "../core/types.js";

export function loadConfig(
  overrides: Partial<OrchestratorConfig> = {},
): OrchestratorConfig {
  return {
    ...DEFAULT_CONFIG,
    outputDir: process.env.OUTPUT_DIR || DEFAULT_CONFIG.outputDir,
    verbose: process.env.VERBOSE === "true" || DEFAULT_CONFIG.verbose,
    ...overrides,
  };
}

export { MODELS } from "./models.js";
