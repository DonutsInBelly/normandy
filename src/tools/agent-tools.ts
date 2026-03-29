import { ToolHandler } from "./types.js";
import type { TaskManager } from "../core/task-manager.js";

export function createAgentTools(taskManager: TaskManager): ToolHandler[] {
  const delegateTask: ToolHandler = {
    definition: {
      name: "delegate_task",
      description: `Assign a mission to a Normandy squad member. Available crew:

Builders:
- "tali": Tali'Zorah -- Chief Engineer. Web applications (React, Next.js, Vue, Angular)
- "garrus": Garrus Vakarian -- Calibration Expert. Video games (Phaser, Unity, Godot)
- "liara": Liara T'Soni -- Information Specialist. Mobile apps (React Native, Flutter, Swift)
- "legion": Legion -- Data Specialist. Databases, APIs, backend services

Designers:
- "kasumi": Kasumi Goto -- UX/Product Designer. User flows, wireframes, design systems
- "samara": Samara -- Game Designer. Mechanics, balancing, progression, game feel

Quality & Architecture:
- "mordin": Mordin Solus -- Scientist. System architecture and technical specs
- "miranda": Miranda Lawson -- Perfectionist. Code review, security, quality
- "thane": Thane Krios -- Testing. Unit, integration, and e2e tests

Operations:
- "edi": EDI -- DevOps. CI/CD, Docker, deployment, infrastructure
- "javik": Javik -- Documentation. READMEs, API docs, guides

The squad member will execute the mission and return a report with generated files and a summary.`,
      input_schema: {
        type: "object" as const,
        properties: {
          specialistId: {
            type: "string",
            description:
              "The squad member to assign",
            enum: ["tali", "garrus", "liara", "legion", "kasumi", "samara", "mordin", "miranda", "thane", "edi", "javik"],
          },
          description: {
            type: "string",
            description:
              "Detailed mission briefing -- what the squad member should build or do",
          },
          context: {
            type: "string",
            description:
              "Additional intel, requirements, or constraints for the mission",
          },
          maxTurns: {
            type: "number",
            description:
              "Override the maximum number of agentic loop turns for this mission (default is the agent's configured maxTurns)",
          },
        },
        required: ["specialistId", "description"],
      },
    },
    async execute(input) {
      const specialistId = input.specialistId as string;
      const description = input.description as string;
      const context = (input.context as string) || "";
      const maxTurns = input.maxTurns as number | undefined;

      const taskId = await taskManager.createAndExecuteTask(
        specialistId,
        description,
        context,
        undefined,
        maxTurns,
      );

      const result = taskManager.getTaskResult(taskId);
      if (!result) {
        return `Mission ${taskId} assigned but no report available yet.`;
      }

      if (!result.success) {
        return `Mission failed: ${result.error || "Unknown error"}`;
      }

      const fileSummary =
        result.files.length > 0
          ? `\n\nFiles generated:\n${result.files.map((f) => `  - ${f.path}`).join("\n")}`
          : "\n\nNo files were generated.";

      return `Mission completed successfully.\n\n${result.output}${fileSummary}`;
    },
  };

  const getMissionStatus: ToolHandler = {
    definition: {
      name: "get_task_status",
      description:
        "Check the status of a previously assigned mission. Returns the current status and report if completed.",
      input_schema: {
        type: "object" as const,
        properties: {
          taskId: {
            type: "string",
            description: "The mission ID to check",
          },
        },
        required: ["taskId"],
      },
    },
    async execute(input) {
      const taskId = input.taskId as string;
      const task = taskManager.getTask(taskId);

      if (!task) {
        return `Mission ${taskId} not found.`;
      }

      let response = `Mission ${taskId}: ${task.status}`;

      if (task.result) {
        response += `\nSuccess: ${task.result.success}`;
        response += `\nReport: ${task.result.output}`;
        if (task.result.files.length > 0) {
          response += `\nFiles: ${task.result.files.map((f) => f.path).join(", ")}`;
        }
        if (task.result.error) {
          response += `\nError: ${task.result.error}`;
        }
      }

      return response;
    },
  };

  return [delegateTask, getMissionStatus];
}
