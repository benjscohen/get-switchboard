import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";

const client = new Anthropic();

/**
 * Generate a concise 3-7 word title for an agent session.
 * Never throws — returns null on failure.
 */
export async function generateTitle(
  prompt: string,
  result: string,
): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      system:
        "Generate a concise 3-7 word title summarizing this task. " +
        "Return ONLY the title text, no quotes or punctuation at the end.",
      messages: [
        {
          role: "user",
          content: `Prompt: ${prompt.slice(0, 500)}\n\nResult: ${result.slice(0, 500)}`,
        },
      ],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    return text || null;
  } catch (err) {
    logger.error({ err }, "[title-gen] Failed to generate title");
    return null;
  }
}

/** Tool name → category tag mapping */
const TOOL_CATEGORY_MAP: Record<string, string> = {
  // Browser tools
  mcp__chrome: "browser",
  mcp__puppeteer: "browser",
  // File tools
  Read: "files",
  Write: "files",
  Edit: "files",
  // Slack
  mcp__slack: "slack",
  // Search
  WebSearch: "search",
  WebFetch: "search",
  mcp__searchapi: "search",
  // GitHub
  mcp__github: "github",
};

function categorizeToolName(toolName: string): string | null {
  // Exact match first
  if (TOOL_CATEGORY_MAP[toolName]) return TOOL_CATEGORY_MAP[toolName];
  // Prefix match for MCP tools (e.g., mcp__chrome__navigate → browser)
  for (const [prefix, category] of Object.entries(TOOL_CATEGORY_MAP)) {
    if (toolName.startsWith(prefix)) return category;
  }
  return null;
}

/**
 * Derive tags from session metadata.
 */
export function deriveTags(opts: {
  source: "web" | "slack" | "scheduled";
  toolNames?: string[];
}): string[] {
  const tags = new Set<string>();
  tags.add(opts.source);

  if (opts.toolNames) {
    for (const name of opts.toolNames) {
      const category = categorizeToolName(name);
      if (category) tags.add(category);
    }
  }

  return [...tags];
}
