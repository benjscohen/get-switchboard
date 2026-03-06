import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  writeFile,
  deleteFile,
  searchFiles,
  readFile,
} from "@/lib/files/service";
import type { ToolMeta } from "@/lib/mcp/tool-filtering";
import { withToolLogging } from "@/lib/mcp/tool-logging";
import { getMcpAuth, ok, err, unauthorized } from "@/lib/mcp/types";

const MEMORIES_DIR = "/memories";

function memoryPath(key: string): string {
  // Allow sub-paths like "project-acme/architecture"
  const cleaned = key.replace(/\.md$/, "");
  return `${MEMORIES_DIR}/${cleaned}.md`;
}

export function registerMemoryTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>,
) {
  // save_memory
  server.tool(
    "save_memory",
    "Save a memory that persists across conversations. Use this when you learn something important about the user, their preferences, project patterns, decisions, or context. Memories are versioned — saving to the same key updates it.",
    {
      key: z.string().describe("Memory key, e.g. 'coding-preferences' or 'project-acme/architecture'. Lowercase with hyphens."),
      content: z.string().describe("Memory content (markdown)"),
      tags: z.array(z.string()).optional().describe("Optional tags for categorization, e.g. ['preference', 'workflow']"),
    },
    withToolLogging("save_memory", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const path = memoryPath(args.key);
      const metadata: Record<string, unknown> = { type: "memory" };
      if (args.tags?.length) metadata.tags = args.tags;

      const result = await writeFile(auth, path, args.content, { metadata });
      if (!result.ok) return err(result.error);
      return ok(`Memory "${args.key}" saved.`);
    }),
  );
  toolMeta.set("save_memory", { integrationId: "platform", orgId: null });

  // recall_memories
  server.tool(
    "recall_memories",
    "Search and retrieve saved memories. Without a query, loads session context: MEMORY.md (core memory) + today's and yesterday's daily logs. With a query, searches across all memory files.",
    {
      query: z.string().optional().describe("Search term to find specific memories. Omit to load session context (MEMORY.md + recent daily logs)."),
    },
    withToolLogging("recall_memories", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      if (args.query) {
        // Search within /memories/
        const searchResult = await searchFiles(auth, { query: args.query, path: MEMORIES_DIR });
        if (!searchResult.ok) return err(searchResult.error);

        const files = searchResult.data.slice(0, 5);
        if (files.length === 0) return ok("No memories found.");

        // Fetch content for each match
        const memories = await Promise.all(
          files.map(async (f: { path: string }) => {
            const read = await readFile(auth, f.path);
            return {
              key: f.path.replace(`${MEMORIES_DIR}/`, "").replace(/\.md$/, ""),
              ...(read.ok ? { content: read.data.content, metadata: read.data.metadata } : { error: read.error }),
            };
          }),
        );
        return ok(memories);
      }

      // No query — load session context (MEMORY.md + today/yesterday daily logs)
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const fmt = (d: Date) => d.toISOString().split("T")[0]; // YYYY-MM-DD

      const filesToLoad = [
        { label: "MEMORY.md (core memory)", path: `${MEMORIES_DIR}/MEMORY.md` },
        { label: `Daily log: ${fmt(today)}`, path: `${MEMORIES_DIR}/daily/${fmt(today)}.md` },
        { label: `Daily log: ${fmt(yesterday)}`, path: `${MEMORIES_DIR}/daily/${fmt(yesterday)}.md` },
      ];

      const sections: string[] = [];
      for (const { label, path } of filesToLoad) {
        const read = await readFile(auth, path);
        if (read.ok) {
          sections.push(`## ${label}\n\n${read.data.content}`);
        } else {
          sections.push(`## ${label}\n\n(not created yet)`);
        }
      }

      return ok(sections.join("\n\n---\n\n"));
    }),
  );
  toolMeta.set("recall_memories", { integrationId: "platform", orgId: null });

  // forget_memory
  server.tool(
    "forget_memory",
    "Delete a memory permanently. Use when information is outdated or the user asks you to forget something.",
    {
      key: z.string().describe("Memory key to delete, e.g. 'coding-preferences'"),
    },
    withToolLogging("forget_memory", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const path = memoryPath(args.key);
      const result = await deleteFile(auth, path);
      if (!result.ok) return err(result.error);
      return ok(`Memory "${args.key}" forgotten.`);
    }),
  );
  toolMeta.set("forget_memory", { integrationId: "platform", orgId: null });
}
