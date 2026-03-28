import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger.js";

export class OrchestratorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}

export class AgentError extends OrchestratorError {
  constructor(
    message: string,
    public readonly agentId: string,
    retryable: boolean = false,
  ) {
    super(message, "AGENT_ERROR", retryable);
    this.name = "AgentError";
  }
}

export class ToolExecutionError extends OrchestratorError {
  constructor(
    message: string,
    public readonly toolName: string,
  ) {
    super(message, "TOOL_ERROR", false);
    this.name = "ToolExecutionError";
  }
}

export class MaxTurnsExceededError extends AgentError {
  constructor(agentId: string, maxTurns: number) {
    super(
      `Agent "${agentId}" exceeded maximum turns (${maxTurns})`,
      agentId,
      false,
    );
    this.name = "MaxTurnsExceededError";
  }
}

export function classifyApiError(error: unknown): {
  retryable: boolean;
  message: string;
} {
  if (error instanceof Anthropic.RateLimitError) {
    return { retryable: true, message: "Rate limited by API" };
  }
  if (error instanceof Anthropic.InternalServerError) {
    return { retryable: true, message: "API server error" };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { retryable: true, message: "API connection error" };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return { retryable: false, message: "Invalid API key" };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { retryable: false, message: `Bad request: ${error.message}` };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      retryable: error.status >= 500,
      message: `API error (${error.status}): ${error.message}`,
    };
  }
  return {
    retryable: false,
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const { retryable, message } = classifyApiError(error);

      if (!retryable || attempt === maxRetries) {
        logger.error({ error: message, attempt }, "Non-retryable error or max retries reached");
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      logger.warn({ message, attempt, delay: Math.round(delay) }, "Retrying after error");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
