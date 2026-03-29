import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Anthropic from "@anthropic-ai/sdk";
import { ToolHandler } from "./types.js";
import { logger } from "../utils/logger.js";

export interface McpServerConfig {
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

interface ConnectedServer {
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport;
  tools: McpToolInfo[];
}

interface McpToolInfo {
  /** The original tool name from the MCP server */
  name: string;
  /** Namespaced name: mcp__{serverName}__{toolName} */
  qualifiedName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export class McpManager {
  private servers = new Map<string, ConnectedServer>();

  /**
   * Connect to an MCP server and discover its tools.
   */
  async connect(serverName: string, config: McpServerConfig): Promise<void> {
    logger.info(
      { server: serverName, command: config.command },
      "Connecting to MCP server",
    );

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd,
      stderr: "pipe",
    });

    const client = new Client(
      { name: "normandy", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    // Discover tools
    const toolsResult = await client.listTools();
    const tools: McpToolInfo[] = toolsResult.tools.map((tool) => ({
      name: tool.name,
      qualifiedName: `mcp__${serverName}__${tool.name}`,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));

    this.servers.set(serverName, { config, client, transport, tools });

    logger.info(
      { server: serverName, toolCount: tools.length },
      "MCP server connected",
    );
  }

  /**
   * Get ToolHandlers for all tools from a specific server,
   * ready to register in Normandy's ToolRegistry.
   */
  getToolHandlers(serverName: string): ToolHandler[] {
    const server = this.servers.get(serverName);
    if (!server) return [];

    return server.tools.map((tool) => ({
      definition: {
        name: tool.qualifiedName,
        description: tool.description || `MCP tool: ${tool.name}`,
        input_schema: tool.inputSchema as Anthropic.Tool["input_schema"],
      },
      execute: async (input: Record<string, unknown>) => {
        const result = await server.client.callTool({
          name: tool.name,
          arguments: input,
        });

        // Convert MCP result content to string
        if ("content" in result && Array.isArray(result.content)) {
          return result.content
            .map((block) => {
              if ("text" in block) return block.text;
              if ("data" in block) return `[${block.type}: ${block.mimeType || "binary"}]`;
              return JSON.stringify(block);
            })
            .join("\n");
        }

        return JSON.stringify(result);
      },
    }));
  }

  /**
   * Get all tool handlers across all connected servers.
   */
  getAllToolHandlers(): ToolHandler[] {
    const handlers: ToolHandler[] = [];
    for (const serverName of this.servers.keys()) {
      handlers.push(...this.getToolHandlers(serverName));
    }
    return handlers;
  }

  /**
   * Get qualified tool names for a specific server.
   */
  getToolNames(serverName: string): string[] {
    const server = this.servers.get(serverName);
    if (!server) return [];
    return server.tools.map((t) => t.qualifiedName);
  }

  /**
   * Get all qualified tool names across all servers.
   */
  getAllToolNames(): string[] {
    const names: string[] = [];
    for (const serverName of this.servers.keys()) {
      names.push(...this.getToolNames(serverName));
    }
    return names;
  }

  /**
   * Get tool names filtered by agent ID.
   * Returns tools from servers whose agentIds list includes this agent,
   * or from servers with no agentIds restriction.
   */
  getToolNamesForAgent(agentId: string): string[] {
    const names: string[] = [];
    for (const [serverName, server] of this.servers) {
      const allowedAgents = server.config.agentIds;
      if (!allowedAgents || allowedAgents.length === 0 || allowedAgents.includes(agentId)) {
        names.push(...this.getToolNames(serverName));
      }
    }
    return names;
  }

  /**
   * Get connected server names.
   */
  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Get a summary of all connected servers and their tool counts.
   */
  getSummary(): string {
    if (this.servers.size === 0) return "No MCP servers connected";

    const lines: string[] = [];
    for (const [name, server] of this.servers) {
      const agentScope = server.config.agentIds?.join(", ") || "all agents";
      lines.push(`${name}: ${server.tools.length} tools (${agentScope})`);
    }
    return `MCP servers: ${lines.join(", ")}`;
  }

  /**
   * Disconnect all MCP servers.
   */
  async disconnect(): Promise<void> {
    for (const [name, server] of this.servers) {
      try {
        await server.transport.close();
        logger.info({ server: name }, "MCP server disconnected");
      } catch (error) {
        logger.warn(
          { server: name, error: String(error) },
          "Error disconnecting MCP server",
        );
      }
    }
    this.servers.clear();
  }
}
