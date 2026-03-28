import fs from "node:fs";
import path from "node:path";
import { ToolHandler } from "./types.js";

export function createCodeTools(workingDir: string): ToolHandler[] {
  const searchCode: ToolHandler = {
    definition: {
      name: "search_code",
      description:
        "Search for a text pattern across files in the project directory. Returns matching lines with file paths and line numbers. Useful for finding function definitions, imports, usage patterns, etc.",
      input_schema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description: "Text or regex pattern to search for",
          },
          filePattern: {
            type: "string",
            description:
              'Optional glob pattern to filter files (e.g., "*.ts", "*.tsx")',
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50)",
          },
        },
        required: ["pattern"],
      },
    },
    async execute(input) {
      const searchPattern = input.pattern as string;
      const filePattern = input.filePattern as string | undefined;
      const maxResults = (input.maxResults as number) || 50;

      const results: string[] = [];
      let regex: RegExp;

      try {
        regex = new RegExp(searchPattern, "gi");
      } catch {
        regex = new RegExp(escapeRegex(searchPattern), "gi");
      }

      async function searchDir(dir: string): Promise<void> {
        if (results.length >= maxResults) return;

        try {
          const entries = await fs.promises.readdir(dir, {
            withFileTypes: true,
          });

          for (const entry of entries) {
            if (results.length >= maxResults) break;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              if (
                !["node_modules", ".git", "dist", ".next", "build"].includes(
                  entry.name,
                )
              ) {
                await searchDir(fullPath);
              }
            } else {
              if (filePattern && !matchSimpleGlob(entry.name, filePattern)) {
                continue;
              }

              if (isBinaryFile(entry.name)) continue;

              try {
                const content = await fs.promises.readFile(fullPath, "utf-8");
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                  if (results.length >= maxResults) break;
                  regex.lastIndex = 0;
                  if (regex.test(lines[i])) {
                    const relativePath = path.relative(workingDir, fullPath);
                    results.push(`${relativePath}:${i + 1}: ${lines[i].trim()}`);
                  }
                }
              } catch {
                // Skip unreadable files
              }
            }
          }
        } catch {
          // Skip unreadable directories
        }
      }

      await searchDir(workingDir);

      if (results.length === 0) {
        return `No matches found for "${searchPattern}"`;
      }

      return results.join("\n");
    },
  };

  return [searchCode];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchSimpleGlob(filename: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    return filename.endsWith(pattern.slice(1));
  }
  return filename === pattern;
}

function isBinaryFile(filename: string): boolean {
  const binaryExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".bmp", ".webp",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".zip", ".tar", ".gz", ".bz2", ".7z",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".exe", ".dll", ".so", ".dylib",
    ".mp3", ".mp4", ".avi", ".mov", ".wav",
    ".sqlite", ".db",
  ];
  return binaryExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
}
