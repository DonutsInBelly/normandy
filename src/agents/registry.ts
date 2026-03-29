import { AgentConfig } from "../core/types.js";
import { BaseAgent } from "../core/agent.js";
import { ToolRegistry } from "../tools/registry.js";

export type AgentFactory = (
  config: AgentConfig,
  toolRegistry: ToolRegistry,
) => BaseAgent;

export class AgentRegistry {
  private factories = new Map<string, AgentFactory>();
  private configs = new Map<string, AgentConfig>();

  register(config: AgentConfig, factory: AgentFactory): void {
    this.configs.set(config.id, config);
    this.factories.set(config.id, factory);
  }

  createAgent(
    agentId: string,
    toolRegistry: ToolRegistry,
    maxTurnsOverride?: number,
    extraTools?: string[],
  ): BaseAgent {
    const factory = this.factories.get(agentId);
    const config = this.configs.get(agentId);

    if (!factory || !config) {
      throw new Error(
        `Agent "${agentId}" not registered. Available: ${this.getAvailableIds().join(", ")}`,
      );
    }

    let effectiveConfig = config;

    if (maxTurnsOverride || (extraTools && extraTools.length > 0)) {
      effectiveConfig = {
        ...config,
        ...(maxTurnsOverride ? { maxTurns: maxTurnsOverride } : {}),
        ...(extraTools && extraTools.length > 0
          ? { tools: [...config.tools, ...extraTools] }
          : {}),
      };
    }

    return factory(effectiveConfig, toolRegistry);
  }

  getConfig(agentId: string): AgentConfig | undefined {
    return this.configs.get(agentId);
  }

  getAvailableIds(): string[] {
    return Array.from(this.configs.keys());
  }

  getAvailableAgents(): { id: string; name: string; description: string }[] {
    return Array.from(this.configs.values()).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    }));
  }
}
