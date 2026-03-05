import { drive_v3 } from "@googleapis/drive";
import type { IntegrationToolDef } from "../types";
import * as s from "./schemas";
import { Readable } from "stream";

type DriveToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    drive: drive_v3.Drive
  ) => Promise<unknown>;
};

// ── Helpers ──

function fid(a: Record<string, unknown>): string {
  return a.fileId as string;
}

function sharedDriveParams(a: Record<string, unknown>) {
  if (a.includeSharedDrives) {
    return { supportsAllDrives: true, includeItemsFromAllDrives: true };
  }
  return {};
}

const WORKSPACE_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.drawing": "application/pdf",
};

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ── Tools ──

export const DRIVE_TOOLS: DriveToolDef[] = [
  // 1. Search
  {
    name: "google_drive_search",
    description:
      "Search for files and folders in Google Drive using query syntax. Supports filtering by name, type, parent folder, modification time, and more.",
    schema: s.searchSchema,
    async execute(a, drive) {
      const params: drive_v3.Params$Resource$Files$List = {
        q: a.query as string | undefined,
        pageSize: (a.pageSize as number) ?? 100,
        pageToken: a.pageToken as string | undefined,
        orderBy: a.orderBy as string | undefined,
        fields:
          (a.fields as string) ??
          "nextPageToken,files(id,name,mimeType,modifiedTime,size,parents,webViewLink)",
        spaces: (a.spaces as string) ?? "drive",
        ...sharedDriveParams(a),
      };
      if (a.driveId) {
        params.driveId = a.driveId as string;
        params.corpora = "drive";
      }
      const res = await drive.files.list(params);
      return res.data;
    },
  },

  // 2. Get file
  {
    name: "google_drive_get_file",
    description:
      "Get file metadata and optionally a plain-text content preview for Google Workspace files (Docs, Sheets, Slides).",
    schema: s.getFileSchema,
    async execute(a, drive) {
      const fields =
        (a.fields as string) ??
        "id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink,description,starred,trashed,shared,owners,lastModifyingUser";
      const res = await drive.files.get({
        fileId: fid(a),
        fields,
        ...sharedDriveParams(a),
      });

      const result: Record<string, unknown> = { ...res.data };

      if (a.includeContentPreview && res.data.mimeType) {
        const exportMime = WORKSPACE_MIME_TYPES[res.data.mimeType];
        if (exportMime) {
          const exp = await drive.files.export(
            { fileId: fid(a), mimeType: exportMime },
            { responseType: "text" }
          );
          const text = String(exp.data);
          result.contentPreview =
            text.length > 10240 ? text.slice(0, 10240) + "\n…[truncated]" : text;
        }
      }

      return result;
    },
  },

  // 3. Create file
  {
    name: "google_drive_create_file",
    description:
      "Create a file, folder, or Google Workspace document in Drive. Supports text content upload.",
    schema: s.createFileSchema,
    async execute(a, drive) {
      const requestBody: drive_v3.Schema$File = {
        name: a.name as string,
        mimeType: a.mimeType as string | undefined,
        parents: a.parents as string[] | undefined,
        description: a.description as string | undefined,
        starred: a.starred as boolean | undefined,
      };

      const params: drive_v3.Params$Resource$Files$Create = {
        requestBody,
        fields: "id,name,mimeType,webViewLink,parents",
        ...sharedDriveParams(a),
      };

      if (a.content) {
        params.media = {
          mimeType: (a.mimeType as string) || "text/plain",
          body: a.content as string,
        };
      }

      const res = await drive.files.create(params);
      return res.data;
    },
  },

  // 4. Update file
  {
    name: "google_drive_update_file",
    description:
      "Update file metadata, replace content, or move a file between folders (use addParents + removeParents to move).",
    schema: s.updateFileSchema,
    async execute(a, drive) {
      const requestBody: drive_v3.Schema$File = {};
      if (a.name !== undefined) requestBody.name = a.name as string;
      if (a.mimeType !== undefined) requestBody.mimeType = a.mimeType as string;
      if (a.description !== undefined)
        requestBody.description = a.description as string;
      if (a.starred !== undefined) requestBody.starred = a.starred as boolean;

      const params: drive_v3.Params$Resource$Files$Update = {
        fileId: fid(a),
        requestBody,
        fields: "id,name,mimeType,modifiedTime,parents,webViewLink",
        ...sharedDriveParams(a),
      };

      if (a.addParents)
        params.addParents = (a.addParents as string[]).join(",");
      if (a.removeParents)
        params.removeParents = (a.removeParents as string[]).join(",");

      if (a.content) {
        params.media = {
          mimeType: (a.mimeType as string) || "text/plain",
          body: a.content as string,
        };
      }

      const res = await drive.files.update(params);
      return res.data;
    },
  },

  // 5. Copy file
  {
    name: "google_drive_copy_file",
    description: "Create a copy of a file, optionally with a new name and destination folder.",
    schema: s.copyFileSchema,
    async execute(a, drive) {
      const res = await drive.files.copy({
        fileId: fid(a),
        requestBody: {
          name: a.name as string | undefined,
          parents: a.parents as string[] | undefined,
        },
        fields: "id,name,mimeType,webViewLink,parents",
        ...sharedDriveParams(a),
      });
      return res.data;
    },
  },

  // 6. Trash / delete
  {
    name: "google_drive_trash",
    description:
      "Trash, untrash, permanently delete a file, or empty the entire trash.",
    schema: s.trashSchema,
    async execute(a, drive) {
      const op = a.operation as string;

      if (op === "empty_trash") {
        await drive.files.emptyTrash();
        return { success: true, message: "Trash emptied" };
      }

      const id = fid(a);
      const sdp = sharedDriveParams(a);

      if (op === "trash") {
        const res = await drive.files.update({
          fileId: id,
          requestBody: { trashed: true },
          fields: "id,name,trashed",
          ...sdp,
        });
        return res.data;
      }

      if (op === "untrash") {
        const res = await drive.files.update({
          fileId: id,
          requestBody: { trashed: false },
          fields: "id,name,trashed",
          ...sdp,
        });
        return res.data;
      }

      // delete
      await drive.files.delete({ fileId: id, ...sdp });
      return { success: true, message: `File ${id} permanently deleted` };
    },
  },

  // 7. Export
  {
    name: "google_drive_export",
    description:
      "Export a Google Workspace file (Docs, Sheets, Slides, Drawings) to a specified format like PDF, DOCX, CSV, etc.",
    schema: s.exportSchema,
    async execute(a, drive) {
      const mimeType = a.mimeType as string;
      const isText =
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType.includes("xml") ||
        mimeType.includes("csv");
      const returnBase64 = a.returnBase64 !== undefined ? a.returnBase64 : !isText;

      if (isText && !returnBase64) {
        const res = await drive.files.export(
          { fileId: fid(a), mimeType },
          { responseType: "text" }
        );
        return { mimeType, content: String(res.data) };
      }

      const res = await drive.files.export(
        { fileId: fid(a), mimeType },
        { responseType: "stream" }
      );
      const buf = await streamToBuffer(res.data as unknown as Readable);
      return {
        mimeType,
        base64: buf.toString("base64"),
        sizeBytes: buf.length,
      };
    },
  },

  // 8. Download
  {
    name: "google_drive_download",
    description:
      "Download the content of a non-Workspace file as text. For binary files, use export instead. Enforces a byte limit.",
    schema: s.downloadSchema,
    async execute(a, drive) {
      const maxBytes = Math.min(
        (a.maxBytes as number) ?? 50000,
        500000
      );

      const res = await drive.files.get(
        { fileId: fid(a), alt: "media" },
        { responseType: "stream" }
      );

      const chunks: Buffer[] = [];
      let total = 0;
      let truncated = false;

      for await (const chunk of res.data as unknown as Readable) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (total + buf.length > maxBytes) {
          chunks.push(buf.subarray(0, maxBytes - total));
          truncated = true;
          break;
        }
        chunks.push(buf);
        total += buf.length;
      }

      const content = Buffer.concat(chunks).toString("utf-8");
      return { content, truncated, bytesRead: content.length };
    },
  },

  // 9. Manage permissions
  {
    name: "google_drive_manage_permissions",
    description:
      "List, create, update, or delete sharing permissions on a file or folder. Supports users, groups, domains, and public access.",
    schema: s.managePermissionsSchema,
    async execute(a, drive) {
      const op = a.operation as string;
      const sdp = sharedDriveParams(a);

      if (op === "list") {
        const res = await drive.permissions.list({
          fileId: fid(a),
          fields:
            "permissions(id,type,role,emailAddress,domain,displayName,expirationTime)",
          ...sdp,
        });
        return res.data;
      }

      if (op === "create") {
        const params: drive_v3.Params$Resource$Permissions$Create = {
          fileId: fid(a),
          requestBody: {
            role: a.role as string,
            type: a.type as string,
            emailAddress: a.emailAddress as string | undefined,
            domain: a.domain as string | undefined,
          },
          fields: "id,type,role,emailAddress,domain,displayName",
          sendNotificationEmail: a.sendNotificationEmail as boolean | undefined,
          emailMessage: a.emailMessage as string | undefined,
          transferOwnership: a.transferOwnership as boolean | undefined,
          moveToNewOwnersRoot: a.moveToNewOwnersRoot as boolean | undefined,
          ...sdp,
        };
        const res = await drive.permissions.create(params);
        return res.data;
      }

      if (op === "update") {
        const res = await drive.permissions.update({
          fileId: fid(a),
          permissionId: a.permissionId as string,
          requestBody: { role: a.role as string },
          fields: "id,type,role,emailAddress,domain,displayName",
          ...sdp,
        });
        return res.data;
      }

      // delete
      await drive.permissions.delete({
        fileId: fid(a),
        permissionId: a.permissionId as string,
        ...sdp,
      });
      return { success: true, message: "Permission deleted" };
    },
  },

  // 10. Manage comments
  {
    name: "google_drive_manage_comments",
    description:
      "List, get, create, update, or delete comments on any Drive file. Comments are a Drive-level feature — this is the only way to manage comments on Docs, Sheets, and Slides.",
    schema: s.manageCommentsSchema,
    async execute(a, drive) {
      const op = a.operation as string;

      if (op === "list") {
        const res = await drive.comments.list({
          fileId: fid(a),
          pageSize: (a.pageSize as number) ?? 20,
          pageToken: a.pageToken as string | undefined,
          includeDeleted: a.includeDeleted as boolean | undefined,
          fields:
            "nextPageToken,comments(id,content,author,createdTime,modifiedTime,resolved,anchor,replies(id,content,author,createdTime))",
        });
        return res.data;
      }

      if (op === "get") {
        const res = await drive.comments.get({
          fileId: fid(a),
          commentId: a.commentId as string,
          fields:
            "id,content,author,createdTime,modifiedTime,resolved,anchor,replies(id,content,author,createdTime)",
          includeDeleted: a.includeDeleted as boolean | undefined,
        });
        return res.data;
      }

      if (op === "create") {
        const requestBody: drive_v3.Schema$Comment = {
          content: a.content as string,
        };
        if (a.anchor) requestBody.anchor = a.anchor as string;

        const res = await drive.comments.create({
          fileId: fid(a),
          requestBody,
          fields: "id,content,author,createdTime,anchor",
        });
        return res.data;
      }

      if (op === "update") {
        const requestBody: drive_v3.Schema$Comment = {
          content: a.content as string,
        };
        // Use resolved field to resolve/reopen via content update
        const res = await drive.comments.update({
          fileId: fid(a),
          commentId: a.commentId as string,
          requestBody,
          fields: "id,content,author,modifiedTime,resolved",
        });
        return res.data;
      }

      // delete
      await drive.comments.delete({
        fileId: fid(a),
        commentId: a.commentId as string,
      });
      return { success: true, message: "Comment deleted" };
    },
  },

  // 11. Manage replies
  {
    name: "google_drive_manage_replies",
    description:
      "List, get, create, update, or delete replies to comments on Drive files. Can resolve or reopen comment threads via the action field.",
    schema: s.manageRepliesSchema,
    async execute(a, drive) {
      const op = a.operation as string;

      if (op === "list") {
        const res = await drive.replies.list({
          fileId: fid(a),
          commentId: a.commentId as string,
          pageSize: (a.pageSize as number) ?? 20,
          pageToken: a.pageToken as string | undefined,
          includeDeleted: a.includeDeleted as boolean | undefined,
          fields:
            "nextPageToken,replies(id,content,author,createdTime,modifiedTime,action)",
        });
        return res.data;
      }

      if (op === "get") {
        const res = await drive.replies.get({
          fileId: fid(a),
          commentId: a.commentId as string,
          replyId: a.replyId as string,
          fields: "id,content,author,createdTime,modifiedTime,action",
          includeDeleted: a.includeDeleted as boolean | undefined,
        });
        return res.data;
      }

      if (op === "create") {
        const requestBody: drive_v3.Schema$Reply = {
          content: a.content as string,
        };
        if (a.action) requestBody.action = a.action as string;

        const res = await drive.replies.create({
          fileId: fid(a),
          commentId: a.commentId as string,
          requestBody,
          fields: "id,content,author,createdTime,action",
        });
        return res.data;
      }

      if (op === "update") {
        const res = await drive.replies.update({
          fileId: fid(a),
          commentId: a.commentId as string,
          replyId: a.replyId as string,
          requestBody: { content: a.content as string },
          fields: "id,content,author,modifiedTime",
        });
        return res.data;
      }

      // delete
      await drive.replies.delete({
        fileId: fid(a),
        commentId: a.commentId as string,
        replyId: a.replyId as string,
      });
      return { success: true, message: "Reply deleted" };
    },
  },

  // 12. List/get revisions
  {
    name: "google_drive_list_revisions",
    description:
      "List or get revisions (version history) of a file. Shows who modified the file and when.",
    schema: s.listRevisionsSchema,
    async execute(a, drive) {
      const op = a.operation as string;

      if (op === "get") {
        const res = await drive.revisions.get({
          fileId: fid(a),
          revisionId: a.revisionId as string,
          fields:
            (a.fields as string) ??
            "id,modifiedTime,lastModifyingUser,size,mimeType,exportLinks",
        });
        return res.data;
      }

      // list
      const res = await drive.revisions.list({
        fileId: fid(a),
        pageSize: (a.pageSize as number) ?? 100,
        pageToken: a.pageToken as string | undefined,
        fields:
          (a.fields as string) ??
          "nextPageToken,revisions(id,modifiedTime,lastModifyingUser,size)",
      });
      return res.data;
    },
  },

  // 13. Manage shared drives
  {
    name: "google_drive_manage_shared_drives",
    description:
      "List, get, create, update, or delete shared drives (formerly Team Drives).",
    schema: s.manageSharedDrivesSchema,
    async execute(a, drive) {
      const op = a.operation as string;

      if (op === "list") {
        const res = await drive.drives.list({
          pageSize: (a.pageSize as number) ?? 100,
          pageToken: a.pageToken as string | undefined,
          fields: "nextPageToken,drives(id,name,createdTime,capabilities)",
        });
        return res.data;
      }

      if (op === "get") {
        const res = await drive.drives.get({
          driveId: a.driveId as string,
          fields: "id,name,createdTime,capabilities,restrictions",
        });
        return res.data;
      }

      if (op === "create") {
        const res = await drive.drives.create({
          requestId: crypto.randomUUID(),
          requestBody: { name: a.name as string },
          fields: "id,name,createdTime",
        });
        return res.data;
      }

      if (op === "update") {
        const res = await drive.drives.update({
          driveId: a.driveId as string,
          requestBody: { name: a.name as string },
          fields: "id,name",
        });
        return res.data;
      }

      // delete
      await drive.drives.delete({ driveId: a.driveId as string });
      return {
        success: true,
        message: `Shared drive ${a.driveId} deleted`,
      };
    },
  },

  // 14. About
  {
    name: "google_drive_about",
    description:
      "Get information about the user's Drive: storage quota, user info, supported export/import formats.",
    schema: s.aboutSchema,
    async execute(a, drive) {
      const res = await drive.about.get({
        fields:
          (a.fields as string) ??
          "user,storageQuota,exportFormats,importFormats",
      });
      return res.data;
    },
  },
];
