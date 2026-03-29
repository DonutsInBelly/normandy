import { ToolHandler } from "./types.js";
import { MemoryManager } from "../core/memory.js";

export function createMemoryTools(memoryManager: MemoryManager): ToolHandler[] {
  const saveMemory: ToolHandler = {
    definition: {
      name: "save_memory",
      description:
        "Save a mission log entry for this project. This persists between sessions so you can pick up where you left off. Write notes about what you built, key decisions, architecture choices, known issues, and anything your future self should know. IMPORTANT: Always call this at the end of a task to record what you did.",
      input_schema: {
        type: "object" as const,
        properties: {
          content: {
            type: "string",
            description:
              "Markdown-formatted notes to save. Include: what was built, technologies used, key decisions and why, file structure, known issues, and next steps.",
          },
        },
        required: ["content"],
      },
    },
    async execute(input) {
      const content = input.content as string;

      // The agent ID gets injected at execution time by the orchestrator
      // For now, we use a special key that gets replaced
      const agentId = (input as Record<string, unknown>)._agentId as string;
      if (!agentId) {
        return "Error: No agent ID provided. This is an internal error.";
      }

      await memoryManager.save(agentId, content);
      return `Mission log saved. Your future self will thank you.`;
    },
  };

  const readMemory: ToolHandler = {
    definition: {
      name: "read_memory",
      description:
        "Read the mission log of any squad member for this project. Use this to understand what another agent has done previously, or to review your own past notes.",
      input_schema: {
        type: "object" as const,
        properties: {
          agentId: {
            type: "string",
            description:
              "The squad member whose log to read",
            enum: [
              "shepard",
              "tali",
              "garrus",
              "liara",
              "legion",
              "kasumi",
              "samara",
              "mordin",
              "miranda",
              "thane",
              "edi",
              "javik",
            ],
          },
        },
        required: ["agentId"],
      },
    },
    async execute(input) {
      const agentId = input.agentId as string;
      const memory = await memoryManager.load(agentId);

      if (!memory) {
        return `No mission log found for ${agentId}. They haven't worked on this project yet.`;
      }

      return `Mission log for ${agentId}:\n\n${memory}`;
    },
  };

  return [saveMemory, readMemory];
}
