import path from "node:path";
import fs from "node:fs";
import { OrchestratorConfig, McpServerEntry, DEFAULT_CONFIG } from "../core/types.js";

export function loadConfig(
  overrides: Partial<OrchestratorConfig> = {},
): OrchestratorConfig {
  const outputDir = overrides.outputDir || process.env.OUTPUT_DIR || DEFAULT_CONFIG.outputDir;

  // Load MCP server config from .normandy/mcp.json in the project directory
  const mcpServers = loadMcpConfig(outputDir);

  return {
    ...DEFAULT_CONFIG,
    outputDir,
    verbose: process.env.VERBOSE === "true" || DEFAULT_CONFIG.verbose,
    ...(mcpServers ? { mcpServers } : {}),
    ...overrides,
  };
}

function loadMcpConfig(outputDir: string): Record<string, McpServerEntry> | undefined {
  const mcpConfigPath = path.join(outputDir, ".normandy", "mcp.json");
  try {
    const raw = fs.readFileSync(mcpConfigPath, "utf-8");
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, McpServerEntry> };
    return parsed.mcpServers;
  } catch {
    // No config file or invalid — that's fine
    return undefined;
  }
}

export { MODELS } from "./models.js";
