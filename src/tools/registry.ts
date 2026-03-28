import Anthropic from "@anthropic-ai/sdk";
import { ToolHandler } from "./types.js";
import { ToolExecutionError } from "../core/errors.js";
import { logger } from "../utils/logger.js";

export class ToolRegistry {
  private tools = new Map<string, ToolHandler>();

  register(handler: ToolHandler): void {
    const name = handler.definition.name;
    if (this.tools.has(name)) {
      logger.warn({ tool: name }, "Overwriting existing tool registration");
    }
    this.tools.set(name, handler);
  }

  registerAll(handlers: ToolHandler[]): void {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  get(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  getDefinitions(names: string[]): Anthropic.Tool[] {
    return names
      .map((name) => this.tools.get(name))
      .filter((t): t is ToolHandler => t !== undefined)
      .map((t) => t.definition);
  }

  getAllDefinitions(): Anthropic.Tool[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(name: string, input: Record<string, unknown>): Promise<string> {
    const handler = this.tools.get(name);
    if (!handler) {
      throw new ToolExecutionError(`Unknown tool: ${name}`, name);
    }

    try {
      return await handler.execute(input);
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ToolExecutionError(`Tool "${name}" failed: ${message}`, name);
    }
  }

  getRegisteredNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
