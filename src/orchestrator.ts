import { OrchestratorConfig, Task, GeneratedFile } from "./core/types.js";
import { TaskManager } from "./core/task-manager.js";
import { BaseAgent } from "./core/agent.js";
import { MemoryManager } from "./core/memory.js";
import { McpManager } from "./core/mcp.js";
import { ToolRegistry } from "./tools/registry.js";
import { createDefaultRegistry } from "./agents/index.js";
import { createFileTools } from "./tools/file-tools.js";
import { createCommandTools } from "./tools/command-tools.js";
import { createCodeTools } from "./tools/code-tools.js";
import { createAgentTools } from "./tools/agent-tools.js";
import { createGitTools } from "./tools/git-tools.js";
import { createMemoryTools } from "./tools/memory-tools.js";
import { OutputManager } from "./utils/output.js";
import { logger } from "./utils/logger.js";
import { formatTokenUsage } from "./utils/stream.js";
import { randomUUID } from "node:crypto";

export class Normandy {
  private config: OrchestratorConfig;
  private taskManager: TaskManager;
  private agentRegistry: ReturnType<typeof createDefaultRegistry>;
  private toolRegistry: ToolRegistry;
  private outputManager: OutputManager;
  private memoryManager: MemoryManager;
  private mcpManager: McpManager;
  private shepard: BaseAgent | null = null;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.taskManager = new TaskManager();
    this.agentRegistry = createDefaultRegistry();
    this.toolRegistry = new ToolRegistry();
    this.outputManager = new OutputManager(config.outputDir);
    this.memoryManager = new MemoryManager(config.outputDir);
    this.mcpManager = new McpManager();

    this.setupTools();
    this.setupExecutors();
  }

  /**
   * Initialize async resources (MCP servers).
   * Must be called before execute() or chat().
   */
  async init(): Promise<void> {
    if (this.config.mcpServers) {
      await this.connectMcpServers();
    }
  }

  private async connectMcpServers(): Promise<void> {
    const servers = this.config.mcpServers;
    if (!servers) return;

    for (const [name, config] of Object.entries(servers)) {
      try {
        await this.mcpManager.connect(name, config);

        // Register MCP tool handlers in our tool registry
        const handlers = this.mcpManager.getToolHandlers(name);
        this.toolRegistry.registerAll(handlers);

        logger.info(
          { server: name, tools: handlers.length },
          "MCP tools registered",
        );
      } catch (error) {
        logger.error(
          { server: name, error: String(error) },
          "Failed to connect MCP server — continuing without it",
        );
      }
    }

    if (this.mcpManager.getServerNames().length > 0) {
      logger.info(this.mcpManager.getSummary());
    }
  }

  private setupTools(): void {
    // Register file tools (shared by all specialists)
    this.toolRegistry.registerAll(createFileTools(this.outputManager));

    // Register command tools
    this.toolRegistry.registerAll(
      createCommandTools(this.outputManager.getBaseDir()),
    );

    // Register code search tools
    this.toolRegistry.registerAll(
      createCodeTools(this.outputManager.getBaseDir()),
    );

    // Register mission delegation tools (used by Shepard)
    this.toolRegistry.registerAll(createAgentTools(this.taskManager));

    // Register git/GitHub tools
    this.toolRegistry.registerAll(
      createGitTools(this.outputManager.getBaseDir()),
    );

    // Register memory tools (mission logs)
    this.toolRegistry.registerAll(createMemoryTools(this.memoryManager));
  }

  private setupExecutors(): void {
    // Register an executor for each squad member
    const squadIds = this.agentRegistry
      .getAvailableIds()
      .filter((id) => id !== "shepard");

    for (const agentId of squadIds) {
      this.taskManager.registerExecutor(agentId, async (task, maxTurnsOverride) => {
        const mcpTools = this.mcpManager.getToolNamesForAgent(agentId);
        const agent = this.agentRegistry.createAgent(
          agentId,
          this.toolRegistry,
          maxTurnsOverride,
          mcpTools,
        );
        agent.setMemoryManager(this.memoryManager);
        return agent.run(task);
      });
    }
  }

  async execute(
    request: string,
    options: { specialist?: string } = {},
  ): Promise<{
    output: string;
    files: { path: string; language: string }[];
    taskSummary: string;
  }> {
    logger.info(
      { request: request.slice(0, 100), specialist: options.specialist },
      "Orchestrator starting",
    );

    const task: Task = {
      id: randomUUID(),
      agentId: options.specialist || "shepard",
      description: request,
      context: "",
      status: "pending",
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // If a specific squad member is requested, run them directly
    const agentId = options.specialist || "shepard";
    const mcpTools = this.mcpManager.getToolNamesForAgent(agentId);
    const agent = this.agentRegistry.createAgent(agentId, this.toolRegistry, undefined, mcpTools);
    agent.setMemoryManager(this.memoryManager);
    const result = await agent.run(task);

    const allFiles = this.collectAllFiles();

    logger.info(
      {
        success: result.success,
        files: allFiles.length,
        tokens: formatTokenUsage(result.tokenUsage),
        tasks: this.taskManager.getSummary(),
      },
      "Normandy mission complete",
    );

    return {
      output: result.success
        ? result.output
        : `Error: ${result.error || "Unknown error"}`,
      files: allFiles.map((f) => ({ path: f.path, language: f.language })),
      taskSummary: this.taskManager.getSummary(),
    };
  }

  private getShepard(): BaseAgent {
    if (!this.shepard) {
      const mcpTools = this.mcpManager.getToolNamesForAgent("shepard");
      this.shepard = this.agentRegistry.createAgent(
        "shepard",
        this.toolRegistry,
        undefined,
        mcpTools,
      );
      this.shepard.setMemoryManager(this.memoryManager);
    }
    return this.shepard;
  }

  async chat(message: string): Promise<{
    output: string;
    files: GeneratedFile[];
  }> {
    logger.info({ message: message.slice(0, 100) }, "Incoming transmission");

    const shepard = this.getShepard();
    const result = await shepard.chat(message);

    // Also collect files from any delegated tasks
    const delegatedFiles = this.collectAllFiles();
    const allFiles = [...result.files];
    for (const f of delegatedFiles) {
      if (!allFiles.some((af) => af.path === f.path)) {
        allFiles.push(f);
      }
    }

    return { output: result.output, files: allFiles };
  }

  getMcpSummary(): string {
    return this.mcpManager.getSummary();
  }

  async shutdown(): Promise<void> {
    await this.mcpManager.disconnect();
  }

  private collectAllFiles(): GeneratedFile[] {
    const filesMap = new Map<string, GeneratedFile>();

    for (const task of this.taskManager.getAllTasks()) {
      if (task.result) {
        for (const file of task.result.files) {
          filesMap.set(file.path, file);
        }
      }
    }

    return Array.from(filesMap.values());
  }
}
