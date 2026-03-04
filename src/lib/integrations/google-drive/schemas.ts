import { z } from "zod";

// ── Shared fragments ──

export const fileId = z
  .string()
  .describe("The Google Drive file or folder ID");

export const pageToken = z
  .string()
  .optional()
  .describe("Token for fetching the next page of results");

export const pageSize = z
  .number()
  .int()
  .optional()
  .describe("Maximum number of results to return (default varies by endpoint)");

export const includeSharedDrives = z
  .boolean()
  .optional()
  .describe(
    "Include items from shared drives (sets supportsAllDrives and includeItemsFromAllDrives)"
  );

// ── Per-tool schemas (14) ──

// 1. Search files
export const searchSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Drive search query (e.g. \"name contains 'report'\" or \"mimeType='application/pdf'\" or \"'folderId' in parents\"). See https://developers.google.com/drive/api/guides/search-files"
    ),
  pageSize: pageSize.describe(
    "Max results per page (default 100, max 1000)"
  ),
  pageToken,
  orderBy: z
    .string()
    .optional()
    .describe(
      "Sort order (e.g. \"modifiedTime desc\", \"name\", \"createdTime desc\")"
    ),
  fields: z
    .string()
    .optional()
    .describe(
      "Comma-separated fields to include (e.g. \"files(id,name,mimeType,modifiedTime,size,parents)\")"
    ),
  spaces: z
    .enum(["drive", "appDataFolder"])
    .optional()
    .describe("Spaces to search (default: drive)"),
  includeSharedDrives,
  driveId: z
    .string()
    .optional()
    .describe("ID of a shared drive to restrict search to"),
});

// 2. Get file
export const getFileSchema = z.object({
  fileId,
  fields: z
    .string()
    .optional()
    .describe(
      "Comma-separated fields (e.g. \"id,name,mimeType,size,modifiedTime,parents,webViewLink,permissions\")"
    ),
  includeContentPreview: z
    .boolean()
    .optional()
    .describe(
      "For Google Workspace files, export as plain text and include a content preview (first 10KB)"
    ),
  includeSharedDrives,
});

// 3. Create file
export const createFileSchema = z.object({
  name: z.string().describe("File or folder name"),
  mimeType: z
    .string()
    .optional()
    .describe(
      "MIME type. Use 'application/vnd.google-apps.folder' for folders, 'application/vnd.google-apps.document' for Docs, 'application/vnd.google-apps.spreadsheet' for Sheets, etc."
    ),
  parents: z
    .array(z.string())
    .optional()
    .describe("Parent folder ID(s). Omit to create in My Drive root."),
  content: z
    .string()
    .optional()
    .describe("Text content to upload (for text-based files)"),
  description: z.string().optional().describe("File description"),
  starred: z.boolean().optional().describe("Star the file"),
  includeSharedDrives,
});

// 4. Update file
export const updateFileSchema = z.object({
  fileId,
  name: z.string().optional().describe("New file name"),
  mimeType: z.string().optional().describe("New MIME type (for conversion)"),
  content: z
    .string()
    .optional()
    .describe("New text content to replace file content with"),
  description: z.string().optional().describe("New file description"),
  starred: z.boolean().optional().describe("Star or unstar the file"),
  addParents: z
    .array(z.string())
    .optional()
    .describe("Folder IDs to add as parents (use with removeParents to move)"),
  removeParents: z
    .array(z.string())
    .optional()
    .describe("Folder IDs to remove as parents"),
  includeSharedDrives,
});

// 5. Copy file
export const copyFileSchema = z.object({
  fileId,
  name: z.string().optional().describe("Name for the copy"),
  parents: z
    .array(z.string())
    .optional()
    .describe("Destination folder ID(s)"),
  includeSharedDrives,
});

// 6. Trash operations
export const trashSchema = z.object({
  operation: z
    .enum(["trash", "untrash", "delete", "empty_trash"])
    .describe(
      "Operation: trash (soft delete), untrash (restore), delete (permanent), empty_trash (empty entire trash)"
    ),
  fileId: fileId
    .optional()
    .describe("File ID (required for trash, untrash, delete)"),
  includeSharedDrives,
});

// 7. Export file
export const exportSchema = z.object({
  fileId,
  mimeType: z
    .string()
    .describe(
      "Export MIME type (e.g. 'application/pdf', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')"
    ),
  returnBase64: z
    .boolean()
    .optional()
    .describe(
      "Return binary content as base64 string (default true for non-text types)"
    ),
});

// 8. Download file
export const downloadSchema = z.object({
  fileId,
  maxBytes: z
    .number()
    .int()
    .optional()
    .describe("Maximum bytes to read (default 50000, max 500000)"),
});

// 9. Manage permissions
export const managePermissionsSchema = z.object({
  operation: z
    .enum(["list", "create", "update", "delete"])
    .describe("Permission operation"),
  fileId,
  permissionId: z
    .string()
    .optional()
    .describe("Permission ID (for update/delete)"),
  role: z
    .enum(["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"])
    .optional()
    .describe("Permission role (for create/update)"),
  type: z
    .enum(["user", "group", "domain", "anyone"])
    .optional()
    .describe("Permission type (for create)"),
  emailAddress: z
    .string()
    .optional()
    .describe("Email address (for user/group type)"),
  domain: z
    .string()
    .optional()
    .describe("Domain (for domain type)"),
  sendNotificationEmail: z
    .boolean()
    .optional()
    .describe("Send notification email when sharing (default true)"),
  emailMessage: z
    .string()
    .optional()
    .describe("Custom message for the notification email"),
  transferOwnership: z
    .boolean()
    .optional()
    .describe("Transfer ownership (required when role is 'owner')"),
  moveToNewOwnersRoot: z
    .boolean()
    .optional()
    .describe("Move file to new owner's root when transferring ownership"),
  includeSharedDrives,
});

// 10. Manage comments
export const manageCommentsSchema = z.object({
  operation: z
    .enum(["list", "get", "create", "update", "delete"])
    .describe("Comment operation"),
  fileId,
  commentId: z
    .string()
    .optional()
    .describe("Comment ID (for get/update/delete)"),
  content: z
    .string()
    .optional()
    .describe("Comment text content (for create/update)"),
  anchor: z
    .string()
    .optional()
    .describe(
      "Region of the document to anchor the comment to (JSON string, for create)"
    ),
  resolved: z
    .boolean()
    .optional()
    .describe("Set to true to resolve a comment, false to reopen (for update)"),
  pageSize,
  pageToken,
  includeDeleted: z
    .boolean()
    .optional()
    .describe("Include deleted comments in list"),
});

// 11. Manage replies
export const manageRepliesSchema = z.object({
  operation: z
    .enum(["list", "get", "create", "update", "delete"])
    .describe("Reply operation"),
  fileId,
  commentId: z.string().describe("Parent comment ID"),
  replyId: z
    .string()
    .optional()
    .describe("Reply ID (for get/update/delete)"),
  content: z
    .string()
    .optional()
    .describe("Reply text content (for create/update)"),
  action: z
    .enum(["resolve", "reopen"])
    .optional()
    .describe("Action to take with this reply (for create)"),
  pageSize,
  pageToken,
  includeDeleted: z
    .boolean()
    .optional()
    .describe("Include deleted replies in list"),
});

// 12. List revisions
export const listRevisionsSchema = z.object({
  operation: z
    .enum(["list", "get"])
    .describe("Revision operation"),
  fileId,
  revisionId: z
    .string()
    .optional()
    .describe("Revision ID (for get)"),
  pageSize,
  pageToken,
  fields: z
    .string()
    .optional()
    .describe(
      "Comma-separated fields (e.g. \"revisions(id,modifiedTime,lastModifyingUser)\")"
    ),
});

// 13. Manage shared drives
export const manageSharedDrivesSchema = z.object({
  operation: z
    .enum(["list", "get", "create", "update", "delete"])
    .describe("Shared drive operation"),
  driveId: z
    .string()
    .optional()
    .describe("Shared drive ID (for get/update/delete)"),
  name: z
    .string()
    .optional()
    .describe("Shared drive name (for create/update)"),
  pageSize,
  pageToken,
});

// 14. About
export const aboutSchema = z.object({
  fields: z
    .string()
    .optional()
    .describe(
      "Comma-separated fields (default: \"user,storageQuota,exportFormats,importFormats\")"
    ),
});
