import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  readFile,
  writeFile,
  deleteFile,
  moveFile,
  listDirectory,
  searchFiles,
  searchFilesWithEmbeddings,
  createFolder,
  deleteFolder,
  resolveFileId,
  listVersions,
  getVersion,
  rollbackFile,
} from "@/lib/files/service";
import type { ToolMeta } from "@/lib/mcp/tool-filtering";
import { withToolLogging } from "@/lib/mcp/tool-logging";
import { getMcpAuth, ok, err, unauthorized } from "@/lib/mcp/types";

export function registerFileTools(
  server: McpServer,
  toolMeta: Map<string, ToolMeta>,
) {
  // file_read
  server.tool(
    "file_read",
    "Read a file's content, metadata, and version info",
    {
      path: z.string().describe("File path, e.g. '/soul.md' or '/projects/acme/notes.md'"),
    },
    withToolLogging("file_read", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const result = await readFile(auth, args.path);
      if (!result.ok) return err(result.error);
      return ok(result.data);
    }),
  );
  toolMeta.set("file_read", { integrationId: "platform", orgId: null });

  // file_write
  server.tool(
    "file_write",
    "Create or update a file. Parent folders are created automatically.",
    {
      path: z.string().describe("File path, e.g. '/soul.md' or '/projects/acme/notes.md'"),
      content: z.string().describe("File content"),
      metadata: z.record(z.string(), z.unknown()).optional().describe("Optional metadata"),
    },
    withToolLogging("file_write", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const result = await writeFile(auth, args.path, args.content, { metadata: args.metadata });
      if (!result.ok) return err(result.error);
      return ok(`File "${args.path}" saved.\n\n${JSON.stringify(result.data, null, 2)}`);
    }),
  );
  toolMeta.set("file_write", { integrationId: "platform", orgId: null });

  // file_delete
  server.tool(
    "file_delete",
    "Delete a file. Cannot be undone.",
    {
      path: z.string().describe("File path to delete"),
    },
    withToolLogging("file_delete", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const result = await deleteFile(auth, args.path);
      if (!result.ok) return err(result.error);
      return ok(`File "${args.path}" deleted.`);
    }),
  );
  toolMeta.set("file_delete", { integrationId: "platform", orgId: null });

  // file_move
  server.tool(
    "file_move",
    "Move or rename a file or folder",
    {
      from: z.string().describe("Current path"),
      to: z.string().describe("New path"),
    },
    withToolLogging("file_move", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const result = await moveFile(auth, args.from, args.to);
      if (!result.ok) return err(result.error);
      return ok(`Moved "${args.from}" to "${args.to}".\n\n${JSON.stringify(result.data, null, 2)}`);
    }),
  );
  toolMeta.set("file_move", { integrationId: "platform", orgId: null });

  // file_list
  server.tool(
    "file_list",
    "List files and folders at a path. Defaults to root.",
    {
      path: z.string().optional().describe("Directory path to list. Defaults to '/'"),
      recursive: z.boolean().optional().describe("List all descendants recursively"),
    },
    withToolLogging("file_list", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const result = await listDirectory(auth, args.path ?? "/", { recursive: args.recursive });
      if (!result.ok) return err(result.error);
      return ok(result.data);
    }),
  );
  toolMeta.set("file_list", { integrationId: "platform", orgId: null });

  // file_search
  server.tool(
    "file_search",
    "Search files by name or content",
    {
      query: z.string().describe("Search term"),
      path: z.string().optional().describe("Limit search to this directory"),
    },
    withToolLogging("file_search", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const result = await searchFilesWithEmbeddings(auth, { query: args.query, path: args.path });
      if (!result.ok) return err(result.error);
      return ok(result.data);
    }),
  );
  toolMeta.set("file_search", { integrationId: "platform", orgId: null });

  // folder_create
  server.tool(
    "folder_create",
    "Create a folder and any missing parents",
    {
      path: z.string().describe("Folder path to create"),
    },
    withToolLogging("folder_create", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const result = await createFolder(auth, args.path);
      if (!result.ok) return err(result.error);
      return ok(`Folder "${args.path}" created.\n\n${JSON.stringify(result.data, null, 2)}`);
    }),
  );
  toolMeta.set("folder_create", { integrationId: "platform", orgId: null });

  // folder_delete
  server.tool(
    "folder_delete",
    "Delete a folder. Fails if non-empty unless recursive is true.",
    {
      path: z.string().describe("Folder path to delete"),
      recursive: z.boolean().optional().describe("Delete folder and all contents"),
    },
    withToolLogging("folder_delete", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const result = await deleteFolder(auth, args.path, { recursive: args.recursive });
      if (!result.ok) return err(result.error);
      return ok(`Folder "${args.path}" deleted.`);
    }),
  );
  toolMeta.set("folder_delete", { integrationId: "platform", orgId: null });

  // file_history
  server.tool(
    "file_history",
    "List all versions of a file with audit trail",
    {
      path: z.string().describe("File path to get history for"),
    },
    withToolLogging("file_history", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const resolved = await resolveFileId(auth, args.path);
      if (!resolved.ok) return err(resolved.error);

      const result = await listVersions(auth, resolved.data.id);
      if (!result.ok) return err(result.error);
      return ok(result.data);
    }),
  );
  toolMeta.set("file_history", { integrationId: "platform", orgId: null });

  // file_version_read
  server.tool(
    "file_version_read",
    "Read the content of a specific file version. Use file_history to list available versions first.",
    {
      path: z.string().describe("File path"),
      version: z.number().describe("Version number to read"),
    },
    withToolLogging("file_version_read", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const resolved = await resolveFileId(auth, args.path);
      if (!resolved.ok) return err(resolved.error);

      const result = await getVersion(auth, resolved.data.id, args.version);
      if (!result.ok) return err(result.error);
      return ok(result.data);
    }),
  );
  toolMeta.set("file_version_read", { integrationId: "platform", orgId: null });

  // file_rollback
  server.tool(
    "file_rollback",
    "Restore a file to a previous version. Use file_history first to find the version number.",
    {
      path: z.string().describe("File path to roll back"),
      version: z.number().describe("Target version number to restore"),
    },
    withToolLogging("file_rollback", "platform", async (args, extra) => {
      const auth = getMcpAuth(extra);
      if (!auth) return unauthorized();

      const resolved = await resolveFileId(auth, args.path);
      if (!resolved.ok) return err(resolved.error);

      const result = await rollbackFile(auth, resolved.data.id, args.version);
      if (!result.ok) return err(result.error);
      return ok(`File "${args.path}" rolled back to version ${args.version}.\n\n${JSON.stringify(result.data, null, 2)}`);
    }),
  );
  toolMeta.set("file_rollback", { integrationId: "platform", orgId: null });
}
