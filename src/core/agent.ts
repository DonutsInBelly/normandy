import Anthropic from "@anthropic-ai/sdk";
import { AgentConfig, Task, TaskResult, GeneratedFile } from "./types.js";
import { ConversationManager } from "./conversation.js";
import { ToolRegistry } from "../tools/registry.js";
import { getClient } from "./client.js";
import { withRetry, MaxTurnsExceededError } from "./errors.js";
import { createAgentLogger } from "../utils/logger.js";
import { createProgressIndicator, formatTokenUsage } from "../utils/stream.js";

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected client: Anthropic;
  protected conversation: ConversationManager;
  protected toolRegistry: ToolRegistry;
  protected logger: ReturnType<typeof createAgentLogger>;
  protected generatedFiles: GeneratedFile[] = [];

  constructor(config: AgentConfig, toolRegistry: ToolRegistry) {
    this.config = config;
    this.client = getClient();
    this.conversation = new ConversationManager();
    this.toolRegistry = toolRegistry;
    this.logger = createAgentLogger(config.id);
  }

  async run(task: Task): Promise<TaskResult> {
    this.logger.info(
      { taskId: task.id, description: task.description },
      "Agent starting task",
    );

    this.conversation.clear();
    this.generatedFiles = [];

    const userMessage = this.buildInitialMessage(task);
    this.conversation.addUserMessage(userMessage);

    try {
      const finalResponse = await this.executeLoop();

      const output = this.extractTextOutput(finalResponse);
      const usage = this.conversation.getTotalUsage();

      this.logger.info(
        { taskId: task.id, tokens: formatTokenUsage(usage) },
        "Agent completed task",
      );

      return {
        taskId: task.id,
        agentId: this.config.id,
        success: true,
        output,
        files: this.generatedFiles,
        tokenUsage: usage,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error({ taskId: task.id, error: message }, "Agent failed");

      return {
        taskId: task.id,
        agentId: this.config.id,
        success: false,
        output: "",
        files: this.generatedFiles,
        error: message,
        tokenUsage: this.conversation.getTotalUsage(),
      };
    }
  }

  protected async executeLoop(): Promise<Anthropic.Message> {
    const tools = this.toolRegistry.getDefinitions(this.config.tools);
    let turns = 0;

    while (true) {
      if (turns >= this.config.maxTurns) {
        throw new MaxTurnsExceededError(this.config.id, this.config.maxTurns);
      }

      turns++;
      const progress = createProgressIndicator(
        `${this.config.name} (turn ${turns})`,
      );

      const message = await withRetry(async () => {
        progress.update("calling API...");

        const stream = this.client.messages.stream({
          model: this.config.model,
          max_tokens: 16384,
          system: this.config.systemPrompt,
          messages: this.conversation.getMessages(),
          tools: tools.length > 0 ? tools : undefined,
        });

        stream.on("text", (text) => {
          const preview = text.slice(0, 60).replace(/\n/g, " ");
          progress.update(preview);
        });

        return stream.finalMessage();
      });

      this.conversation.trackUsage(message.usage);
      this.conversation.addAssistantMessage(message.content);

      // Check stop reason
      if (message.stop_reason === "end_turn") {
        progress.done("complete");
        return message;
      }

      // Extract tool use blocks
      const toolUseBlocks = message.content.filter(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        progress.done("complete (no tool calls)");
        return message;
      }

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        progress.update(`running ${toolUse.name}...`);
        this.logger.debug(
          { tool: toolUse.name, input: toolUse.input },
          "Executing tool",
        );

        try {
          const result = await this.toolRegistry.execute(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
          );

          // Track file writes
          if (toolUse.name === "write_file") {
            const input = toolUse.input as {
              path: string;
              content: string;
            };
            this.trackGeneratedFile(input.path, input.content);
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            { tool: toolUse.name, error: errorMsg },
            "Tool execution failed",
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error: ${errorMsg}`,
            is_error: true,
          });
        }
      }

      this.conversation.addToolResults(toolResults);
      progress.done(`${toolUseBlocks.length} tool(s) executed`);
    }
  }

  async chat(message: string): Promise<{ output: string; files: GeneratedFile[] }> {
    this.logger.info({ message: message.slice(0, 100) }, "Chat message received");

    this.conversation.addUserMessage(message);

    try {
      const finalResponse = await this.executeLoop();
      const output = this.extractTextOutput(finalResponse);
      return { output, files: [...this.generatedFiles] };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: errMsg }, "Chat turn failed");
      return { output: `Error: ${errMsg}`, files: [] };
    }
  }

  protected buildInitialMessage(task: Task): string {
    let message = task.description;
    if (task.context) {
      message += `\n\nAdditional context:\n${task.context}`;
    }
    return message;
  }

  protected extractTextOutput(message: Anthropic.Message): string {
    return message.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      )
      .map((block) => block.text)
      .join("\n");
  }

  private trackGeneratedFile(filePath: string, content: string): void {
    const ext = filePath.split(".").pop() || "";
    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      rs: "rust",
      go: "go",
      html: "html",
      css: "css",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      md: "markdown",
      sql: "sql",
      sh: "shell",
      dart: "dart",
      swift: "swift",
      kt: "kotlin",
      java: "java",
      cs: "csharp",
      cpp: "cpp",
      c: "c",
      gdscript: "gdscript",
    };

    const existing = this.generatedFiles.findIndex(
      (f) => f.path === filePath,
    );
    const file: GeneratedFile = {
      path: filePath,
      content,
      language: languageMap[ext] || ext,
    };

    if (existing >= 0) {
      this.generatedFiles[existing] = file;
    } else {
      this.generatedFiles.push(file);
    }
  }
}
