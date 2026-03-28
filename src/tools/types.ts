import Anthropic from "@anthropic-ai/sdk";

export interface ToolHandler {
  definition: Anthropic.Tool;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface ToolContext {
  workingDir: string;
  verbose: boolean;
}
