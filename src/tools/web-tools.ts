import { ToolHandler } from "./types.js";
import { logger } from "../utils/logger.js";

export function createWebTools(): ToolHandler[] {
  const webSearch: ToolHandler = {
    definition: {
      name: "web_search",
      description:
        "Search the web using Brave Search API. Returns titles, URLs, and descriptions of matching results. Use this to find documentation, API references, package info, tutorials, and other web resources. Chain with web_fetch to read the full content of a result.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description:
              'Search query (e.g., "Next.js app router documentation", "Phaser 3 sprite animation tutorial")',
          },
          count: {
            type: "number",
            description: "Number of results to return (default: 5, max: 20)",
          },
        },
        required: ["query"],
      },
    },
    async execute(input) {
      const query = input.query as string;
      const count = Math.min((input.count as number) || 5, 20);

      const apiKey = process.env.BRAVE_SEARCH_API_KEY;
      if (!apiKey) {
        return "Error: BRAVE_SEARCH_API_KEY not set. Get a free key at https://brave.com/search/api/";
      }

      try {
        const params = new URLSearchParams({
          q: query,
          count: String(count),
        });

        const response = await fetch(
          `https://api.search.brave.com/res/v1/web/search?${params}`,
          {
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "gzip",
              "X-Subscription-Token": apiKey,
            },
          },
        );

        if (!response.ok) {
          return `Search API error (${response.status}): ${response.statusText}`;
        }

        const data = (await response.json()) as BraveSearchResponse;
        const results = data.web?.results || [];

        if (results.length === 0) {
          return `No results found for "${query}"`;
        }

        const formatted = results.map((r, i) => {
          const parts = [`${i + 1}. ${r.title}`, `   URL: ${r.url}`];
          if (r.description) {
            parts.push(`   ${r.description}`);
          }
          return parts.join("\n");
        });

        return `Search results for "${query}":\n\n${formatted.join("\n\n")}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error: msg }, "Web search failed");
        return `Search error: ${msg}`;
      }
    },
  };

  const webFetch: ToolHandler = {
    definition: {
      name: "web_fetch",
      description:
        "Fetch a web page and extract its text content. HTML is stripped to readable text. Use this after web_search to read the full content of a page (documentation, API references, tutorials, etc.).",
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch",
          },
          maxLength: {
            type: "number",
            description:
              "Maximum characters of content to return (default: 15000). Truncates from the end if exceeded.",
          },
        },
        required: ["url"],
      },
    },
    async execute(input) {
      const url = input.url as string;
      const maxLength = (input.maxLength as number) || 15000;

      // Basic URL validation
      try {
        new URL(url);
      } catch {
        return `Error: Invalid URL: ${url}`;
      }

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; NormandyBot/1.0; +https://github.com/DonutsInBelly/normandy)",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          return `Fetch error (${response.status}): ${response.statusText}`;
        }

        const contentType = response.headers.get("content-type") || "";
        const body = await response.text();

        let text: string;
        if (contentType.includes("text/html") || contentType.includes("xhtml")) {
          text = htmlToText(body);
        } else {
          // Plain text, JSON, etc. — return as-is
          text = body;
        }

        if (text.length > maxLength) {
          text = text.slice(0, maxLength) + `\n\n[Truncated at ${maxLength} characters]`;
        }

        if (!text.trim()) {
          return "Page fetched but no readable text content was extracted (may be a JavaScript-only page).";
        }

        return `Content from ${url}:\n\n${text}`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error: msg, url }, "Web fetch failed");
        return `Fetch error: ${msg}`;
      }
    },
  };

  return [webSearch, webFetch];
}

// Brave Search API response types
interface BraveSearchResponse {
  web?: {
    results: Array<{
      title: string;
      url: string;
      description?: string;
    }>;
  };
}

/**
 * Strips HTML to readable plain text.
 * Handles common elements, removes scripts/styles, preserves structure.
 */
function htmlToText(html: string): string {
  let text = html;

  // Remove script, style, nav, footer, header tags and their content
  text = text.replace(
    /<(script|style|nav|footer|header|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  );

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Convert common block elements to newlines
  text = text.replace(/<(br|hr)\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)>/gi, "\n\n");
  text = text.replace(/<li[^>]*>/gi, "  - ");
  text = text.replace(/<h([1-6])[^>]*>/gi, "\n\n");

  // Extract href from links
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10)),
  );

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}
