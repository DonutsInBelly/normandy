import Anthropic from "@anthropic-ai/sdk";
import { TokenUsage } from "./types.js";

export class ConversationManager {
  private messages: Anthropic.MessageParam[] = [];
  private totalUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };

  addUserMessage(
    content: string | Anthropic.ContentBlockParam[],
  ): void {
    this.messages.push({ role: "user", content });
  }

  addAssistantMessage(content: Anthropic.ContentBlock[]): void {
    // Preserve all content blocks as-is for multi-turn conversations.
    // Server tool blocks (server_tool_use, web_search_tool_result) must be
    // passed back unchanged for citations and context to work.
    this.messages.push({
      role: "assistant",
      content: content as unknown as Anthropic.ContentBlockParam[],
    });
  }

  addToolResults(
    results: Anthropic.ToolResultBlockParam[],
  ): void {
    this.messages.push({ role: "user", content: results });
  }

  getMessages(): Anthropic.MessageParam[] {
    return [...this.messages];
  }

  trackUsage(usage: Anthropic.Usage): void {
    this.totalUsage.inputTokens += usage.input_tokens;
    this.totalUsage.outputTokens += usage.output_tokens;
    const usageAny = usage as unknown as Record<string, number>;
    if ("cache_read_input_tokens" in usage) {
      this.totalUsage.cacheReadTokens +=
        usageAny.cache_read_input_tokens || 0;
    }
    if ("cache_creation_input_tokens" in usage) {
      this.totalUsage.cacheCreationTokens +=
        usageAny.cache_creation_input_tokens || 0;
    }
  }

  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  clear(): void {
    this.messages = [];
    this.totalUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  }

  getMessageCount(): number {
    return this.messages.length;
  }
}
