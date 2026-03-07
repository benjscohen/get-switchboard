import { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Post a message to a Slack channel or thread. Returns the message timestamp.
 * Optionally include Block Kit blocks for rich formatting.
 */
export async function postMessage(
  channel: string,
  text: string,
  threadTs?: string,
  blocks?: KnownBlock[],
): Promise<string> {
  const result = await client.chat.postMessage({
    channel,
    text,
    ...(blocks && { blocks }),
    thread_ts: threadTs,
    unfurl_links: false,
    unfurl_media: false,
  });
  return result.ts as string;
}

/**
 * Update an existing Slack message. Optionally include Block Kit blocks.
 */
export async function updateMessage(
  channel: string,
  ts: string,
  text: string,
  blocks?: KnownBlock[],
): Promise<void> {
  await client.chat.update({
    channel,
    ts,
    text,
    ...(blocks && { blocks }),
  });
}

/**
 * Add a reaction emoji to a message.
 */
export async function addReaction(
  channel: string,
  ts: string,
  emoji: string,
): Promise<void> {
  try {
    await client.reactions.add({
      channel,
      timestamp: ts,
      name: emoji,
    });
  } catch (err: unknown) {
    const error = err as { data?: { error?: string } };
    if (error.data?.error !== "already_reacted") {
      throw err;
    }
  }
}

/**
 * Remove a reaction emoji from a message.
 */
export async function removeReaction(
  channel: string,
  ts: string,
  emoji: string,
): Promise<void> {
  try {
    await client.reactions.remove({
      channel,
      timestamp: ts,
      name: emoji,
    });
  } catch (err: unknown) {
    const error = err as { data?: { error?: string } };
    if (error.data?.error !== "no_reaction") {
      throw err;
    }
  }
}

export interface ThreadMessage {
  role: "user" | "assistant";
  text: string;
  ts: string;
}

/**
 * Fetch the full thread history for context when a user replies in a thread.
 * Returns messages in chronological order, excluding the current message.
 */
export async function fetchThreadHistory(
  channel: string,
  threadTs: string,
  excludeTs: string,
): Promise<ThreadMessage[]> {
  const result = await client.conversations.replies({
    channel,
    ts: threadTs,
    limit: 100,
  });

  const messages: ThreadMessage[] = [];
  for (const msg of result.messages ?? []) {
    if (!msg.ts || msg.ts === excludeTs) continue;
    // Bot messages are "assistant", user messages are "user"
    const role = msg.bot_id ? "assistant" : "user";
    const text = msg.text || "";
    if (text) {
      messages.push({ role, text, ts: msg.ts });
    }
  }
  return messages;
}

/**
 * Shared authenticated fetch for Slack file downloads.
 */
async function authenticatedFetch(urlPrivate: string): Promise<Response> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not set");
  }

  const response = await fetch(urlPrivate, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  return response;
}

function parseFilename(response: Response): string {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";\n]+)"?/);
  return match?.[1] || "unknown";
}

/**
 * Download a file from Slack as text content.
 * Returns text content for text files, "[Binary file]" for others.
 */
export async function downloadFile(
  urlPrivate: string,
): Promise<{ content: string; filename: string; mimeType: string }> {
  const response = await authenticatedFetch(urlPrivate);
  const contentType = response.headers.get("content-type") || "";
  const filename = parseFilename(response);

  const isText =
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    contentType.includes("javascript") ||
    contentType.includes("typescript") ||
    contentType.includes("yaml") ||
    contentType.includes("csv") ||
    contentType.includes("svg");

  if (isText) {
    const text = await response.text();
    return { content: text, filename, mimeType: contentType };
  }

  return { content: "[Binary file]", filename, mimeType: contentType };
}

/**
 * Download a file from Slack as a Buffer (for binary files: images, PDFs, etc.).
 */
export async function downloadFileAsBuffer(
  urlPrivate: string,
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const response = await authenticatedFetch(urlPrivate);
  const contentType = response.headers.get("content-type") || "";
  const filename = parseFilename(response);
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), filename, mimeType: contentType };
}

/**
 * Upload a file to a Slack channel/thread.
 * Requires `files:write` bot token scope.
 */
export async function uploadFile(opts: {
  channelId: string;
  threadTs?: string;
  filename: string;
  content: string | Buffer;
  title?: string;
  initialComment?: string;
}): Promise<void> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const args: any = {
    channel_id: opts.channelId,
    filename: opts.filename,
    ...(opts.title && { title: opts.title }),
    ...(opts.initialComment && { initial_comment: opts.initialComment }),
  };
  if (opts.threadTs) args.thread_ts = opts.threadTs;
  if (typeof opts.content === "string") {
    args.content = opts.content;
  } else {
    args.file = opts.content;
  }
  await client.filesUploadV2(args);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Convert standard Markdown to Slack mrkdwn.
 * Claude sometimes produces Markdown despite prompt instructions — this catches it.
 */
export function markdownToSlack(text: string): string {
  if (!text) return text;

  return text
    // Code blocks: remove language specifier (```js → ```)
    .replace(/```[a-zA-Z]*\n/g, "```\n")
    // Headers: # Heading → *Heading*
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    // Images: ![alt](url) → <url|alt>  (must come before links)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "<$2|$1>")
    // Links: [text](url) → <url|text>
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
    // Bold: **text** or __text__ → *text*
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    // Strikethrough: ~~text~~ → ~text~
    .replace(/~~(.+?)~~/g, "~$1~")
    // Unwrap bold from bare URLs — *https://...* breaks Slack links
    .replace(/\*(https?:\/\/[^\s*]+)\*/g, "$1");
}
