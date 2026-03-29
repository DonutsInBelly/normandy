import Anthropic from "@anthropic-ai/sdk";

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  maxTurns: number;
  maxTokens?: number;
  timeoutMs?: number;
  thinking?: { type: "enabled"; budgetTokens: number } | { type: "disabled" };
  webSearch?: boolean;
}

export interface Task {
  id: string;
  parentId?: string;
  agentId: string;
  description: string;
  context: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: TaskResult;
  dependencies: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  success: boolean;
  output: string;
  files: GeneratedFile[];
  error?: string;
  tokenUsage: TokenUsage;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface ToolHandler {
  definition: Anthropic.Tool;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface McpServerEntry {
  /** The command to spawn the MCP server process */
  command: string;
  /** Arguments passed to the command */
  args?: string[];
  /** Environment variables for the server process */
  env?: Record<string, string>;
  /** Working directory for the server process */
  cwd?: string;
  /** Which agent IDs should receive these tools (empty = all agents) */
  agentIds?: string[];
}

export interface OrchestratorConfig {
  outputDir: string;
  verbose: boolean;
  defaultModel: string;
  maxRetries: number;
  mcpServers?: Record<string, McpServerEntry>;
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  outputDir: "./output",
  verbose: false,
  defaultModel: "claude-opus-4-6",
  maxRetries: 5,
};
