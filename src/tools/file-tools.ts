import fs from "node:fs";
import path from "node:path";
import { ToolHandler } from "./types.js";
import { OutputManager } from "../utils/output.js";

export function createFileTools(outputManager: OutputManager): ToolHandler[] {
  const readFile: ToolHandler = {
    definition: {
      name: "read_file",
      description:
        "Read the contents of a file. Use this to understand existing code, configuration, or documentation.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Relative path to the file within the project directory",
          },
        },
        required: ["path"],
      },
    },
    async execute(input) {
      const filePath = input.path as string;
      try {
        const content = await outputManager.readFile(filePath);
        return content;
      } catch {
        // Try reading as absolute path for existing files outside output dir
        try {
          const content = await fs.promises.readFile(filePath, "utf-8");
          return content;
        } catch {
          return `Error: File not found: ${filePath}`;
        }
      }
    },
  };

  const writeFile: ToolHandler = {
    definition: {
      name: "write_file",
      description:
        "Write content to a file. Creates parent directories if they don't exist. Use this to create new files or overwrite existing ones.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Relative path for the file within the project directory",
          },
          content: {
            type: "string",
            description: "The full content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
    async execute(input) {
      const filePath = input.path as string;
      const content = input.content as string;
      const fullPath = await outputManager.writeFile(filePath, content);
      return `File written: ${fullPath}`;
    },
  };

  const listDirectory: ToolHandler = {
    definition: {
      name: "list_directory",
      description:
        "List files and directories at the given path. Directories end with a trailing slash.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description:
              "Relative path to the directory (defaults to project root)",
          },
        },
        required: [],
      },
    },
    async execute(input) {
      const dirPath = (input.path as string) || ".";
      const entries = await outputManager.listDirectory(dirPath);
      if (entries.length === 0) {
        return "Directory is empty or does not exist.";
      }
      return entries.join("\n");
    },
  };

  const searchFiles: ToolHandler = {
    definition: {
      name: "search_files",
      description:
        "Search for files matching a glob pattern within the project directory.",
      input_schema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description:
              'Glob pattern to match (e.g., "**/*.ts", "src/**/*.tsx")',
          },
        },
        required: ["pattern"],
      },
    },
    async execute(input) {
      const pattern = input.pattern as string;
      const baseDir = outputManager.getBaseDir();
      // Use a simple recursive search
      const matches: string[] = [];

      async function walk(dir: string): Promise<void> {
        try {
          const entries = await fs.promises.readdir(dir, {
            withFileTypes: true,
          });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);

            if (entry.isDirectory()) {
              if (entry.name !== "node_modules" && entry.name !== ".git") {
                await walk(fullPath);
              }
            } else {
              if (matchGlob(relativePath, pattern)) {
                matches.push(relativePath);
              }
            }
          }
        } catch {
          // Directory doesn't exist, skip
        }
      }

      await walk(baseDir);

      if (matches.length === 0) {
        return `No files matching "${pattern}" found.`;
      }
      return matches.join("\n");
    },
  };

  return [readFile, writeFile, listDirectory, searchFiles];
}

function matchGlob(filePath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*");
  return new RegExp(`^${regexStr}$`).test(filePath);
}
