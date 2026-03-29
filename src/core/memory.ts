import fs from "node:fs";
import path from "node:path";
import { logger } from "../utils/logger.js";

const MEMORY_DIR = ".normandy";

export class MemoryManager {
  private baseDir: string;
  private memoryDir: string;

  constructor(projectDir: string) {
    this.baseDir = path.resolve(projectDir);
    this.memoryDir = path.join(this.baseDir, MEMORY_DIR);
  }

  private getMemoryPath(agentId: string): string {
    return path.join(this.memoryDir, `${agentId}.md`);
  }

  async load(agentId: string): Promise<string | null> {
    const memoryPath = this.getMemoryPath(agentId);
    try {
      const content = await fs.promises.readFile(memoryPath, "utf-8");
      logger.debug({ agentId, path: memoryPath }, "Memory loaded");
      return content;
    } catch {
      return null;
    }
  }

  async save(agentId: string, content: string): Promise<void> {
    await fs.promises.mkdir(this.memoryDir, { recursive: true });

    const memoryPath = this.getMemoryPath(agentId);
    const timestamp = new Date().toISOString();

    // Prepend with a timestamp header
    const header = `<!-- Last updated: ${timestamp} -->\n`;
    await fs.promises.writeFile(memoryPath, header + content, "utf-8");

    logger.debug({ agentId, path: memoryPath }, "Memory saved");
  }

  async append(agentId: string, entry: string): Promise<void> {
    await fs.promises.mkdir(this.memoryDir, { recursive: true });

    const memoryPath = this.getMemoryPath(agentId);
    const timestamp = new Date().toISOString().split("T")[0];
    const formattedEntry = `\n## ${timestamp}\n\n${entry}\n`;

    try {
      await fs.promises.appendFile(memoryPath, formattedEntry, "utf-8");
    } catch {
      // File doesn't exist yet, create it
      await fs.promises.writeFile(memoryPath, formattedEntry.trimStart(), "utf-8");
    }

    logger.debug({ agentId, path: memoryPath }, "Memory entry appended");
  }

  async loadAll(): Promise<Map<string, string>> {
    const memories = new Map<string, string>();

    try {
      const entries = await fs.promises.readdir(this.memoryDir);
      for (const entry of entries) {
        if (entry.endsWith(".md")) {
          const agentId = entry.replace(".md", "");
          const content = await this.load(agentId);
          if (content) {
            memories.set(agentId, content);
          }
        }
      }
    } catch {
      // Memory dir doesn't exist yet
    }

    return memories;
  }

  /**
   * Build a system prompt supplement from memory.
   * Returns null if no memory exists.
   */
  async buildContext(agentId: string): Promise<string | null> {
    const memory = await this.load(agentId);
    if (!memory) return null;

    return [
      "## Mission Log (Previous Sessions)",
      "",
      "You have worked on this project before. Here are your notes from previous sessions:",
      "",
      memory,
      "",
      "Use this context to maintain consistency with your previous work. Update your mission log at the end of this session using the save_memory tool.",
    ].join("\n");
  }
}
