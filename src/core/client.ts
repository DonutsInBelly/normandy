import Anthropic from "@anthropic-ai/sdk";

let clientInstance: Anthropic | null = null;

export function getClient(apiKey?: string): Anthropic {
  if (!clientInstance) {
    clientInstance = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      maxRetries: 5,
    });
  }
  return clientInstance;
}

export function resetClient(): void {
  clientInstance = null;
}
