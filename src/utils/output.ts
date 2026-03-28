import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

export class OutputManager {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  resolvePath(relativePath: string): string {
    const resolved = path.resolve(this.baseDir, relativePath);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(
        `Path traversal detected: "${relativePath}" resolves outside output directory`,
      );
    }
    return resolved;
  }

  async writeFile(relativePath: string, content: string): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    const dir = path.dirname(fullPath);

    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(fullPath, content, "utf-8");

    logger.debug({ path: fullPath }, "File written");
    return fullPath;
  }

  async readFile(relativePath: string): Promise<string> {
    const fullPath = this.resolvePath(relativePath);
    return fs.promises.readFile(fullPath, "utf-8");
  }

  async fileExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(relativePath);
      await fs.promises.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async listDirectory(relativePath: string = "."): Promise<string[]> {
    const fullPath = this.resolvePath(relativePath);
    try {
      const entries = await fs.promises.readdir(fullPath, {
        withFileTypes: true,
      });
      return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    } catch {
      return [];
    }
  }
}
