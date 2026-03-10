import OpenAI from "openai";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenAIMcpServerConfig {
  type: "http";
  url: string;
  headers: Record<string, string>;
}

type McpServerEntry = OpenAIMcpServerConfig | { type: "stdio"; command: string; args: string[] };

/** Accepts either plain strings or Claude SDK SDKUserMessage objects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PromptMessage = string | { message?: { role?: string; content?: any } };

export interface OpenAIAgentOptions {
  model: string;
  prompt: string | AsyncIterable<PromptMessage>;
  systemPrompt: string;
  cwd?: string;
  mcpServers: Record<string, McpServerEntry>;
  abortController: AbortController;
  maxTurns?: number;
  reasoningEffort?: "low" | "medium" | "high";
}

/** Extract text from either a plain string or an SDK message object. */
function extractText(msg: PromptMessage): string {
  if (typeof msg === "string") return msg;
  const content = msg.message?.content;
  if (typeof content === "string") return content;
  // ContentBlockParam[] — extract text blocks
  if (Array.isArray(content)) {
    return content
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("");
  }
  return "";
}

export interface OpenAIAgentResult {
  text: string;
  turns: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  sessionId: string | null;
  status: "completed" | "failed" | "timeout";
  error?: string;
}

// Message types compatible with the Claude SDK message stream
export type OpenAIMessage =
  | { type: "system"; session_id: string }
  | { type: "assistant"; message: { content: Array<{ type: string; text?: string }> } }
  | {
      type: "result";
      subtype: "success" | "error";
      result?: string;
      num_turns: number;
      total_cost_usd: number;
      usage: { input_tokens: number; output_tokens: number };
      error?: string;
    };

// ---------------------------------------------------------------------------
// Pricing — codex-mini-latest
// ---------------------------------------------------------------------------

const INPUT_TOKEN_COST = 1.5 / 1_000_000;
const OUTPUT_TOKEN_COST = 6.0 / 1_000_000;

const DEFAULT_MAX_TURNS = 200; // generous — OpenAI handles tool loops internally

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cost(inp: number, out: number): number {
  return inp * INPUT_TOKEN_COST + out * OUTPUT_TOKEN_COST;
}

/**
 * Convert our MCP server map to OpenAI's `tools` format.
 * Only HTTP servers are supported; stdio servers are skipped with a warning.
 */
function mcpTools(
  servers: Record<string, McpServerEntry>,
): OpenAI.Responses.Tool[] {
  const tools: OpenAI.Responses.Tool[] = [];
  for (const [label, cfg] of Object.entries(servers)) {
    if (cfg.type === "http") {
      tools.push({
        type: "mcp",
        server_label: label,
        server_url: cfg.url,
        headers: cfg.headers,
      });
    } else {
      logger.warn({ label }, "Skipping stdio MCP server — OpenAI only supports HTTP");
    }
  }
  return tools;
}

/** Extract the final text from a Responses API output array. */
function extractOutputText(output: OpenAI.Responses.ResponseOutputItem[]): string {
  const parts: string[] = [];
  for (const item of output) {
    if (item.type === "message") {
      for (const block of item.content) {
        if (block.type === "output_text") {
          parts.push(block.text);
        }
      }
    }
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Headless (single-prompt, no streaming)
// ---------------------------------------------------------------------------

export async function runOpenAIAgentHeadless(
  opts: OpenAIAgentOptions,
): Promise<OpenAIAgentResult> {
  const {
    model,
    prompt,
    systemPrompt,
    mcpServers,
    abortController,
    reasoningEffort = "medium",
  } = opts;

  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const promptText =
      typeof prompt === "string"
        ? prompt
        : await (async () => {
            const chunks: string[] = [];
            for await (const m of prompt) chunks.push(extractText(m));
            return chunks.join("\n\n");
          })();

    const tools = mcpTools(mcpServers);

    const response = await client().responses.create(
      {
        model,
        instructions: systemPrompt,
        input: promptText,
        ...(tools.length > 0 ? { tools } : {}),
        reasoning: { effort: reasoningEffort },
      },
      { signal: abortController.signal },
    );

    inputTokens = response.usage?.input_tokens ?? 0;
    outputTokens = response.usage?.output_tokens ?? 0;

    const text = extractOutputText(response.output) || response.output_text || "";

    return {
      text: text || "(No response generated)",
      turns: 1,
      cost: cost(inputTokens, outputTokens),
      inputTokens,
      outputTokens,
      sessionId: response.id,
      status: "completed",
    };
  } catch (err) {
    if (abortController.signal.aborted) {
      return {
        text: "",
        turns: 0,
        cost: cost(inputTokens, outputTokens),
        inputTokens,
        outputTokens,
        sessionId: null,
        status: "timeout",
        error: "Execution timed out",
      };
    }
    logger.error({ err }, "[openai-agent] headless error");
    return {
      text: "",
      turns: 0,
      cost: cost(inputTokens, outputTokens),
      inputTokens,
      outputTokens,
      sessionId: null,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Interactive (multi-turn, yields Claude-compatible messages)
// ---------------------------------------------------------------------------

export function runOpenAIAgent(opts: OpenAIAgentOptions): {
  messages: AsyncIterable<OpenAIMessage>;
} {
  const iter = async function* (): AsyncGenerator<OpenAIMessage> {
    const {
      model,
      prompt,
      systemPrompt,
      mcpServers,
      abortController,
      maxTurns = DEFAULT_MAX_TURNS,
      reasoningEffort = "medium",
    } = opts;

    let totalIn = 0;
    let totalOut = 0;
    let turns = 0;
    let previousResponseId: string | null = null;
    let sessionId: string | null = null;

    const tools = mcpTools(mcpServers);

    const makeResult = (
      subtype: "success" | "error",
      extra: { result?: string; error?: string } = {},
    ): OpenAIMessage => ({
      type: "result",
      subtype,
      ...extra,
      num_turns: turns,
      total_cost_usd: cost(totalIn, totalOut),
      usage: { input_tokens: totalIn, output_tokens: totalOut },
    });

    try {
      const messages: Iterable<PromptMessage> | AsyncIterable<PromptMessage> =
        typeof prompt === "string" ? [prompt] : prompt;

      for await (const userMessage of messages) {
        turns++;
        if (turns > maxTurns) {
          yield makeResult("error", { error: `Max turns (${maxTurns}) exceeded` });
          return;
        }

        try {
          const response: OpenAI.Responses.Response = await client().responses.create(
            {
              model,
              instructions: systemPrompt,
              input: [{ role: "user" as const, content: extractText(userMessage) }],
              ...(tools.length > 0 ? { tools } : {}),
              reasoning: { effort: reasoningEffort },
              ...(previousResponseId
                ? { previous_response_id: previousResponseId }
                : {}),
            },
            { signal: abortController.signal },
          );

          if (!sessionId) {
            sessionId = response.id ?? null;
            yield { type: "system", session_id: sessionId };
          }
          previousResponseId = response.id;

          totalIn += response.usage?.input_tokens ?? 0;
          totalOut += response.usage?.output_tokens ?? 0;

          // Yield assistant message
          const text = extractOutputText(response.output) || response.output_text || "";
          if (text) {
            yield {
              type: "assistant",
              message: { content: [{ type: "text", text }] },
            };
          }

          // For single-turn (string prompt), emit result and return
          if (typeof prompt === "string") {
            yield makeResult("success", {
              result: text || "(No response generated)",
            });
            return;
          }
        } catch (err) {
          if (abortController.signal.aborted) {
            yield makeResult("error", { error: "Request timed out" });
            return;
          }
          logger.error({ err }, "[openai-agent] interactive turn error");
          yield makeResult("error", {
            error: err instanceof Error ? err.message : "Unknown error",
          });
          return;
        }
      }

      // Stream exhausted — conversation ended normally
      yield makeResult("success", { result: "Conversation completed" });
    } catch (err) {
      logger.error({ err }, "[openai-agent] fatal error");
      yield makeResult("error", {
        error: err instanceof Error ? err.message : "Fatal error",
      });
    }
  };

  return { messages: iter() };
}
