import * as slack from "./slack.js";
import * as db from "./db.js";
import { extractFileUploads, uploadExtractedFiles } from "./file-uploads.js";

// ---------------------------------------------------------------------------
// Delivery targets + result delivery
// ---------------------------------------------------------------------------

export type DeliveryTarget =
  | { type: "slack_channel"; channel_id: string; channel_name?: string }
  | { type: "slack_dm" }
  | { type: "file"; path: string };

export interface DeliveryResult {
  target: DeliveryTarget;
  success: boolean;
  error?: string;
}

export async function deliverResults(
  targets: DeliveryTarget[],
  resultText: string,
  opts: { agentKey: string; creatorUserId: string },
): Promise<DeliveryResult[]> {
  // Extract FILE_UPLOAD directives once
  const { cleanText, uploads } = extractFileUploads(resultText);

  // Format Slack text once (shared across all Slack targets)
  const slackText = slack.markdownToSlack(cleanText);
  const truncatedSlack = slackText.length > 3900 ? slackText.slice(0, 3900) + "\n...(truncated)" : slackText;

  // Deliver to all targets in parallel
  return Promise.all(targets.map(async (target): Promise<DeliveryResult> => {
    try {
      if (target.type === "slack_channel") {
        await slack.postMessage(target.channel_id, truncatedSlack);
        if (uploads.length > 0) {
          await uploadExtractedFiles(uploads, target.channel_id, undefined, "scheduled");
        }
        return { target, success: true };
      } else if (target.type === "slack_dm") {
        const dmChannelId = await db.lookupSlackDmChannel(opts.creatorUserId);
        if (!dmChannelId) {
          return { target, success: false, error: "Could not find Slack DM channel for schedule creator" };
        }
        await slack.postMessage(dmChannelId, truncatedSlack);
        if (uploads.length > 0) {
          await uploadExtractedFiles(uploads, dmChannelId, undefined, "scheduled");
        }
        return { target, success: true };
      } else if (target.type === "file") {
        await writeToSwitchboardFile(opts.agentKey, target.path, cleanText);
        return { target, success: true };
      }
      return { target, success: false, error: `Unknown delivery type: ${(target as { type: string }).type}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown delivery error";
      console.error(`[delivery] Failed to deliver to ${target.type}:`, message);
      return { target, success: false, error: message };
    }
  }));
}

// ---------------------------------------------------------------------------
// Write file to Switchboard via API
// ---------------------------------------------------------------------------

async function writeToSwitchboardFile(agentKey: string, filePath: string, content: string): Promise<void> {
  const mcpUrl = process.env.SWITCHBOARD_MCP_URL;
  if (!mcpUrl) throw new Error("SWITCHBOARD_MCP_URL not set");

  const origin = new URL(mcpUrl).origin;
  const res = await fetch(`${origin}/api/mcp/streamable-http`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${agentKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "file_write",
        arguments: { path: filePath, content },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`file_write failed: ${res.status} ${body}`);
  }
}
