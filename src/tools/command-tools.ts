import { spawn } from "node:child_process";
import { ToolHandler } from "./types.js";
import { logger } from "../utils/logger.js";

export function createCommandTools(workingDir: string): ToolHandler[] {
  const runCommand: ToolHandler = {
    definition: {
      name: "run_command",
      description:
        "Execute a shell command in the project directory. Use this for running build tools, package managers, linters, test suites, etc. Commands are executed with a timeout of 120 seconds.",
      input_schema: {
        type: "object" as const,
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          timeout: {
            type: "number",
            description: "Timeout in milliseconds (default: 120000)",
          },
        },
        required: ["command"],
      },
    },
    async execute(input) {
      const command = input.command as string;
      const timeout = (input.timeout as number) || 120000;

      // Block dangerous commands
      const blocked = [
        /\brm\s+-rf\s+[\/~]/,
        /\bsudo\b/,
        /\bchmod\s+777\b/,
        /\bmkfs\b/,
        /\bdd\s+if=/,
        />\s*\/dev\//,
      ];

      for (const pattern of blocked) {
        if (pattern.test(command)) {
          return `Error: Command blocked for safety: ${command}`;
        }
      }

      logger.debug({ command, workingDir }, "Executing command");

      return new Promise<string>((resolve) => {
        const proc = spawn("sh", ["-c", command], {
          cwd: workingDir,
          timeout,
          env: { ...process.env, NODE_ENV: "development" },
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        proc.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          const output = [];
          if (stdout.trim()) output.push(`stdout:\n${stdout.trim()}`);
          if (stderr.trim()) output.push(`stderr:\n${stderr.trim()}`);
          output.push(`exit code: ${code}`);
          resolve(output.join("\n\n"));
        });

        proc.on("error", (error) => {
          resolve(`Error executing command: ${error.message}`);
        });
      });
    },
  };

  return [runCommand];
}
