import { randomUUID } from "node:crypto";
import { Task, TaskResult } from "./types.js";
import { logger } from "../utils/logger.js";

export type AgentExecutor = (task: Task) => Promise<TaskResult>;

export class TaskManager {
  private tasks = new Map<string, Task>();
  private executors = new Map<string, AgentExecutor>();

  registerExecutor(agentId: string, executor: AgentExecutor): void {
    this.executors.set(agentId, executor);
  }

  async createAndExecuteTask(
    agentId: string,
    description: string,
    context: string,
    parentId?: string,
  ): Promise<string> {
    const executor = this.executors.get(agentId);
    if (!executor) {
      throw new Error(`No executor registered for agent: ${agentId}`);
    }

    const task: Task = {
      id: randomUUID(),
      parentId,
      agentId,
      description,
      context,
      status: "pending",
      dependencies: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.tasks.set(task.id, task);
    logger.info(
      { taskId: task.id, agentId, description: description.slice(0, 100) },
      "Task created",
    );

    // Execute synchronously
    task.status = "in_progress";
    task.updatedAt = new Date();

    try {
      const result = await executor(task);
      task.status = result.success ? "completed" : "failed";
      task.result = result;
      task.updatedAt = new Date();

      logger.info(
        { taskId: task.id, success: result.success },
        "Task finished",
      );
    } catch (error) {
      task.status = "failed";
      task.result = {
        taskId: task.id,
        agentId,
        success: false,
        output: "",
        files: [],
        error: error instanceof Error ? error.message : String(error),
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      };
      task.updatedAt = new Date();

      logger.error(
        { taskId: task.id, error: task.result.error },
        "Task failed",
      );
    }

    return task.id;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getTaskResult(taskId: string): TaskResult | undefined {
    return this.tasks.get(taskId)?.result;
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTasksByAgent(agentId: string): Task[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.agentId === agentId,
    );
  }

  getSummary(): string {
    const tasks = this.getAllTasks();
    const byStatus = {
      pending: tasks.filter((t) => t.status === "pending").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
    };

    return `Tasks: ${tasks.length} total (${byStatus.completed} completed, ${byStatus.failed} failed, ${byStatus.in_progress} in progress, ${byStatus.pending} pending)`;
  }
}
