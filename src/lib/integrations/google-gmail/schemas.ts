import { z } from "zod";

// ── Shared fragments ──

export const messageId = z
  .string()
  .describe("Gmail message ID");

export const threadId = z
  .string()
  .describe("Gmail thread ID");

export const pageToken = z
  .string()
  .optional()
  .describe("Page token for pagination");

export const maxResults = z
  .number()
  .optional()
  .describe("Maximum results to return (default 10, max 500)");

export const labelIds = z
  .string()
  .optional()
  .describe("Comma-separated label IDs (e.g. \"INBOX,UNREAD\")");

export const compositionFields = {
  to: z.string().describe("Recipient email address(es), comma-separated"),
  subject: z.string().describe("Email subject line"),
  body: z.string().describe("Email body content"),
  cc: z
    .string()
    .optional()
    .describe("CC recipient(s), comma-separated"),
  bcc: z
    .string()
    .optional()
    .describe("BCC recipient(s), comma-separated"),
  contentType: z
    .enum(["text/plain", "text/html"])
    .optional()
    .describe("Body content type (default text/plain)"),
};

// ── Per-tool schemas (17) ──

// 1. List messages
export const listMessagesSchema = z.object({
  q: z
    .string()
    .optional()
    .describe("Gmail search query (e.g. \"from:alice subject:report\")"),
  labelIds,
  maxResults,
  pageToken,
  includeSpamTrash: z
    .boolean()
    .optional()
    .describe("Include messages from SPAM and TRASH"),
});

// 2. Get message
export const getMessageSchema = z.object({
  messageId,
  format: z
    .enum(["full", "metadata", "minimal", "raw"])
    .optional()
    .describe("Response format (default full)"),
  preferHtml: z
    .boolean()
    .optional()
    .describe("Prefer HTML body over plain text when available"),
});

// 3. Get attachment
export const getAttachmentSchema = z.object({
  messageId,
  attachmentId: z.string().describe("Attachment ID from message metadata"),
});

// 4. Send message
export const sendMessageSchema = z.object({
  ...compositionFields,
  replyTo: z
    .string()
    .optional()
    .describe("Reply-To email address"),
});

// 5. Reply to message
export const replyToMessageSchema = z.object({
  messageId,
  body: z.string().describe("Reply body content"),
  cc: z
    .string()
    .optional()
    .describe("CC recipient(s), comma-separated"),
  bcc: z
    .string()
    .optional()
    .describe("BCC recipient(s), comma-separated"),
  replyAll: z
    .boolean()
    .optional()
    .describe("Reply to all recipients (default false)"),
  contentType: z
    .enum(["text/plain", "text/html"])
    .optional()
    .describe("Body content type (default text/plain)"),
});

// 6. Forward message
export const forwardMessageSchema = z.object({
  messageId,
  to: z.string().describe("Forward recipient email address(es), comma-separated"),
  body: z
    .string()
    .optional()
    .describe("Optional text to prepend above forwarded content"),
  cc: z
    .string()
    .optional()
    .describe("CC recipient(s), comma-separated"),
  bcc: z
    .string()
    .optional()
    .describe("BCC recipient(s), comma-separated"),
  contentType: z
    .enum(["text/plain", "text/html"])
    .optional()
    .describe("Body content type (default text/plain)"),
});

// 7. Modify message
export const modifyMessageSchema = z.object({
  messageId,
  addLabelIds: z
    .string()
    .optional()
    .describe("Comma-separated label IDs to add"),
  removeLabelIds: z
    .string()
    .optional()
    .describe("Comma-separated label IDs to remove"),
});

// 8. Trash/untrash message
export const trashMessageSchema = z.object({
  messageId,
  action: z
    .enum(["trash", "untrash"])
    .describe("Whether to trash or untrash the message"),
});

// 9. Batch modify messages
export const batchModifyMessagesSchema = z.object({
  action: z
    .enum(["modify", "delete"])
    .describe("Batch action to perform"),
  messageIds: z
    .string()
    .describe("Comma-separated message IDs to act on"),
  addLabelIds: z
    .string()
    .optional()
    .describe("Comma-separated label IDs to add (for modify)"),
  removeLabelIds: z
    .string()
    .optional()
    .describe("Comma-separated label IDs to remove (for modify)"),
});

// 10. List threads
export const listThreadsSchema = z.object({
  q: z
    .string()
    .optional()
    .describe("Gmail search query"),
  labelIds,
  maxResults,
  pageToken,
  includeSpamTrash: z
    .boolean()
    .optional()
    .describe("Include threads from SPAM and TRASH"),
});

// 11. Get thread
export const getThreadSchema = z.object({
  threadId,
  format: z
    .enum(["full", "metadata", "minimal"])
    .optional()
    .describe("Response format for messages in the thread (default full)"),
});

// 12. Manage drafts
export const manageDraftsSchema = z.object({
  action: z
    .enum(["create", "update", "list", "get", "delete", "send"])
    .describe("Draft operation to perform"),
  draftId: z
    .string()
    .optional()
    .describe("Draft ID (for get/update/delete/send)"),
  to: z
    .string()
    .optional()
    .describe("Recipient email address(es), comma-separated"),
  subject: z
    .string()
    .optional()
    .describe("Email subject line"),
  body: z
    .string()
    .optional()
    .describe("Email body content"),
  cc: z
    .string()
    .optional()
    .describe("CC recipient(s), comma-separated"),
  bcc: z
    .string()
    .optional()
    .describe("BCC recipient(s), comma-separated"),
  contentType: z
    .enum(["text/plain", "text/html"])
    .optional()
    .describe("Body content type (default text/plain)"),
  maxResults,
  pageToken,
});

// 13. Manage labels
export const manageLabelsSchema = z.object({
  action: z
    .enum(["list", "get", "create", "update", "delete"])
    .describe("Label operation to perform"),
  labelId: z
    .string()
    .optional()
    .describe("Label ID (for get/update/delete)"),
  name: z
    .string()
    .optional()
    .describe("Label name (for create/update)"),
  visibility: z
    .enum(["labelShow", "labelShowIfUnread", "labelHide"])
    .optional()
    .describe("Label list visibility"),
  color: z
    .string()
    .optional()
    .describe("Label color as \"textColor,backgroundColor\" hex (e.g. \"#000000,#16a765\")"),
});

// 14. Manage vacation responder
export const manageVacationSchema = z.object({
  action: z
    .enum(["get", "update"])
    .describe("Vacation responder operation"),
  enableAutoReply: z
    .boolean()
    .optional()
    .describe("Enable or disable auto-reply"),
  responseSubject: z
    .string()
    .optional()
    .describe("Auto-reply subject line"),
  responseBody: z
    .string()
    .optional()
    .describe("Auto-reply body (HTML supported)"),
  startTime: z
    .string()
    .optional()
    .describe("Start time as epoch milliseconds string"),
  endTime: z
    .string()
    .optional()
    .describe("End time as epoch milliseconds string"),
  restrictToContacts: z
    .boolean()
    .optional()
    .describe("Only send to known contacts"),
  restrictToDomain: z
    .boolean()
    .optional()
    .describe("Only send to same domain"),
});

// 15. Manage filters
export const manageFiltersSchema = z.object({
  action: z
    .enum(["list", "get", "create", "delete"])
    .describe("Filter operation to perform"),
  filterId: z
    .string()
    .optional()
    .describe("Filter ID (for get/delete)"),
  criteriaFrom: z
    .string()
    .optional()
    .describe("Filter criteria: sender address"),
  criteriaTo: z
    .string()
    .optional()
    .describe("Filter criteria: recipient address"),
  criteriaSubject: z
    .string()
    .optional()
    .describe("Filter criteria: subject contains"),
  criteriaQuery: z
    .string()
    .optional()
    .describe("Filter criteria: Gmail search query"),
  criteriaHasAttachment: z
    .boolean()
    .optional()
    .describe("Filter criteria: has attachment"),
  criteriaSize: z
    .number()
    .optional()
    .describe("Filter criteria: message size in bytes"),
  criteriaSizeComparison: z
    .enum(["larger", "smaller"])
    .optional()
    .describe("Filter criteria: size comparison operator"),
  actionAddLabelIds: z
    .string()
    .optional()
    .describe("Action: comma-separated label IDs to add"),
  actionRemoveLabelIds: z
    .string()
    .optional()
    .describe("Action: comma-separated label IDs to remove"),
  actionForward: z
    .string()
    .optional()
    .describe("Action: forwarding email address"),
});

// 16. Get profile
export const getProfileSchema = z.object({});

// 17. List history
export const listHistorySchema = z.object({
  startHistoryId: z
    .string()
    .describe("History ID to start listing from (from a previous sync)"),
  labelId: z
    .string()
    .optional()
    .describe("Only return history for this label"),
  historyTypes: z
    .string()
    .optional()
    .describe("Comma-separated history types: messageAdded,messageDeleted,labelAdded,labelRemoved"),
  maxResults,
  pageToken,
});
