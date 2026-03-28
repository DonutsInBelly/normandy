export function formatTokenUsage(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}): string {
  const parts = [
    `in: ${usage.inputTokens.toLocaleString()}`,
    `out: ${usage.outputTokens.toLocaleString()}`,
  ];
  if (usage.cacheReadTokens > 0) {
    parts.push(`cache-read: ${usage.cacheReadTokens.toLocaleString()}`);
  }
  if (usage.cacheCreationTokens > 0) {
    parts.push(`cache-write: ${usage.cacheCreationTokens.toLocaleString()}`);
  }
  return parts.join(" | ");
}

export function createProgressIndicator(label: string): {
  update: (text: string) => void;
  done: (text?: string) => void;
} {
  const start = Date.now();

  return {
    update(text: string) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stderr.write(`\r  [${elapsed}s] ${label}: ${text}`);
    },
    done(text?: string) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stderr.write(
        `\r  [${elapsed}s] ${label}: ${text || "done"}\n`,
      );
    },
  };
}
