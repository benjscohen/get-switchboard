import { gmail_v1 } from "googleapis";
import type { IntegrationToolDef } from "../types";
import * as s from "./schemas";

type GmailToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    gmail: gmail_v1.Gmail
  ) => Promise<unknown>;
};

// ── Helpers ──

function splitCsv(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

interface Attachment {
  filename: string;
  mimeType: string;
  base64Data: string;
}

function wrapBase64(data: string, lineLength = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < data.length; i += lineLength) {
    lines.push(data.slice(i, i + lineLength));
  }
  return lines.join("\r\n");
}

function buildMimeMessage(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  contentType?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Attachment[];
}): string {
  const ct = opts.contentType || "text/plain";
  const hasAttachments = opts.attachments && opts.attachments.length > 0;

  const headerLines: string[] = [];
  headerLines.push(`To: ${opts.to}`);
  if (opts.cc) headerLines.push(`Cc: ${opts.cc}`);
  if (opts.bcc) headerLines.push(`Bcc: ${opts.bcc}`);
  headerLines.push(`Subject: ${opts.subject}`);
  if (opts.replyTo) headerLines.push(`Reply-To: ${opts.replyTo}`);
  if (opts.inReplyTo) headerLines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headerLines.push(`References: ${opts.references}`);
  headerLines.push("MIME-Version: 1.0");

  if (!hasAttachments) {
    headerLines.push(`Content-Type: ${ct}; charset=utf-8`);
    headerLines.push("");
    headerLines.push(opts.body);
    return headerLines.join("\r\n");
  }

  // multipart/mixed with boundary
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  headerLines.push("");

  const parts: string[] = [];

  // Body part
  parts.push(`--${boundary}`);
  parts.push(`Content-Type: ${ct}; charset=utf-8`);
  parts.push("");
  parts.push(opts.body);

  // Attachment parts
  for (const att of opts.attachments!) {
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    parts.push("");
    parts.push(wrapBase64(att.base64Data));
  }

  parts.push(`--${boundary}--`);

  return headerLines.join("\r\n") + "\r\n" + parts.join("\r\n");
}

function encodeBase64Url(mime: string): string {
  return Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type GmailHeader = { name?: string | null; value?: string | null };

function extractHeaders(
  headers: GmailHeader[] | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  const wanted = ["From", "To", "Cc", "Subject", "Date", "Message-ID"];
  for (const h of headers) {
    if (h.name && wanted.includes(h.name)) {
      result[h.name] = h.value ?? "";
    }
  }
  return result;
}

function extractBody(
  payload: gmail_v1.Schema$MessagePart | undefined,
  preferHtml?: boolean
): string {
  if (!payload) return "";

  // Simple single-part message
  if (payload.body?.data && payload.mimeType) {
    if (
      payload.mimeType === "text/plain" ||
      payload.mimeType === "text/html"
    ) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }
  }

  // Multipart — walk parts
  if (payload.parts) {
    let plainText = "";
    let htmlText = "";
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        plainText = Buffer.from(part.body.data, "base64").toString("utf-8");
      } else if (part.mimeType === "text/html" && part.body?.data) {
        htmlText = Buffer.from(part.body.data, "base64").toString("utf-8");
      } else if (
        part.mimeType?.startsWith("multipart/") &&
        part.parts
      ) {
        // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
        const nested = extractBody(part, preferHtml);
        if (nested) {
          if (part.mimeType === "multipart/alternative") {
            if (preferHtml && nested.includes("<")) htmlText = nested;
            else plainText = nested;
          } else {
            plainText = plainText || nested;
          }
        }
      }
    }
    if (preferHtml && htmlText) return htmlText;
    return plainText || htmlText;
  }

  return "";
}

function extractAttachmentInfo(
  payload: gmail_v1.Schema$MessagePart | undefined
): Array<{
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}> {
  const attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }> = [];

  function walk(part: gmail_v1.Schema$MessagePart) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }

  if (payload) walk(payload);
  return attachments;
}

function formatMessage(
  msg: gmail_v1.Schema$Message,
  includeBody?: boolean
): Record<string, unknown> {
  const headers = extractHeaders(msg.payload?.headers ?? undefined);
  const result: Record<string, unknown> = {
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds,
    snippet: msg.snippet,
    ...headers,
  };
  if (includeBody) {
    result.body = extractBody(msg.payload);
    result.attachments = extractAttachmentInfo(msg.payload);
  }
  return result;
}

// ── Tools (17) ──

export const GMAIL_TOOLS: GmailToolDef[] = [
  // ── 1. List Messages ──
  {
    name: "google_gmail_list_messages",
    description:
      "Search and list Gmail messages with enriched metadata (From, To, Subject, Date, snippet). Uses Gmail search syntax.",
    schema: s.listMessagesSchema,
    execute: async (a, gmail) => {
      const res = await gmail.users.messages.list({
        userId: "me",
        q: (a.q as string) || undefined,
        labelIds: splitCsv(a.labelIds as string) || undefined,
        maxResults: (a.maxResults as number) || 10,
        pageToken: (a.pageToken as string) || undefined,
        includeSpamTrash: (a.includeSpamTrash as boolean) || undefined,
      });

      const messageIds = (res.data.messages ?? []).map((m) => m.id!);
      if (messageIds.length === 0) {
        return {
          messages: [],
          resultSizeEstimate: res.data.resultSizeEstimate,
          nextPageToken: res.data.nextPageToken,
        };
      }

      // Enrich with metadata in chunks of 10
      const enriched: Record<string, unknown>[] = [];
      for (let i = 0; i < messageIds.length; i += 10) {
        const chunk = messageIds.slice(i, i + 10);
        const results = await Promise.all(
          chunk.map((id) =>
            gmail.users.messages
              .get({ userId: "me", id, format: "METADATA" })
              .then((r) => formatMessage(r.data))
          )
        );
        enriched.push(...results);
      }

      return {
        messages: enriched,
        resultSizeEstimate: res.data.resultSizeEstimate,
        nextPageToken: res.data.nextPageToken,
      };
    },
  },

  // ── 2. Get Message ──
  {
    name: "google_gmail_get_message",
    description:
      "Get a single Gmail message with full headers, body content, and attachment metadata",
    schema: s.getMessageSchema,
    execute: async (a, gmail) => {
      const res = await gmail.users.messages.get({
        userId: "me",
        id: a.messageId as string,
        format: (a.format as string) || "full",
      });
      const msg = res.data;
      const headers = extractHeaders(msg.payload?.headers ?? undefined);
      return {
        id: msg.id,
        threadId: msg.threadId,
        labelIds: msg.labelIds,
        snippet: msg.snippet,
        internalDate: msg.internalDate,
        sizeEstimate: msg.sizeEstimate,
        ...headers,
        body: extractBody(msg.payload, a.preferHtml as boolean),
        attachments: extractAttachmentInfo(msg.payload),
      };
    },
  },

  // ── 3. Get Attachment ──
  {
    name: "google_gmail_get_attachment",
    description:
      "Download an attachment from a Gmail message. Returns base64-encoded data.",
    schema: s.getAttachmentSchema,
    execute: async (a, gmail) => {
      const res = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: a.messageId as string,
        id: a.attachmentId as string,
      });
      return { size: res.data.size, data: res.data.data };
    },
  },

  // ── 4. Send Message ──
  {
    name: "google_gmail_send_message",
    description: "Compose and send a new email message",
    schema: s.sendMessageSchema,
    execute: async (a, gmail) => {
      const mime = buildMimeMessage({
        to: a.to as string,
        subject: a.subject as string,
        body: a.body as string,
        cc: a.cc as string | undefined,
        bcc: a.bcc as string | undefined,
        replyTo: a.replyTo as string | undefined,
        contentType: a.contentType as string | undefined,
        attachments: a.attachments as Attachment[] | undefined,
      });
      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodeBase64Url(mime) },
      });
      return { id: res.data.id, threadId: res.data.threadId, labelIds: res.data.labelIds };
    },
  },

  // ── 5. Reply to Message ──
  {
    name: "google_gmail_reply_to_message",
    description:
      "Reply to an existing email message with correct threading (In-Reply-To, References, threadId)",
    schema: s.replyToMessageSchema,
    execute: async (a, gmail) => {
      // Fetch the original message to get threading headers
      const orig = await gmail.users.messages.get({
        userId: "me",
        id: a.messageId as string,
        format: "METADATA",
      });
      const headers = extractHeaders(orig.data.payload?.headers ?? undefined);
      const origMessageId = headers["Message-ID"] || "";
      const origSubject = headers["Subject"] || "";
      const origFrom = headers["From"] || "";
      const origTo = headers["To"] || "";
      const origCc = headers["Cc"] || "";

      // Determine recipients
      let to: string;
      if (a.replyAll) {
        // Reply-all: original From + original To + original Cc (minus self)
        const allRecipients = [origFrom, origTo, origCc]
          .filter(Boolean)
          .join(", ");
        to = allRecipients;
      } else {
        to = origFrom;
      }

      const subject = origSubject.startsWith("Re:")
        ? origSubject
        : `Re: ${origSubject}`;

      const mime = buildMimeMessage({
        to,
        subject,
        body: a.body as string,
        cc: a.cc as string | undefined,
        bcc: a.bcc as string | undefined,
        contentType: a.contentType as string | undefined,
        inReplyTo: origMessageId,
        references: origMessageId,
        attachments: a.attachments as Attachment[] | undefined,
      });

      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodeBase64Url(mime),
          threadId: orig.data.threadId ?? undefined,
        },
      });
      return { id: res.data.id, threadId: res.data.threadId, labelIds: res.data.labelIds };
    },
  },

  // ── 6. Forward Message ──
  {
    name: "google_gmail_forward_message",
    description:
      "Forward an existing email message to new recipients, optionally prepending your own text",
    schema: s.forwardMessageSchema,
    execute: async (a, gmail) => {
      // Fetch original message for content and headers
      const orig = await gmail.users.messages.get({
        userId: "me",
        id: a.messageId as string,
        format: "full",
      });
      const headers = extractHeaders(orig.data.payload?.headers ?? undefined);
      const origSubject = headers["Subject"] || "";
      const origFrom = headers["From"] || "";
      const origDate = headers["Date"] || "";
      const origBody = extractBody(orig.data.payload);

      const subject = origSubject.startsWith("Fwd:")
        ? origSubject
        : `Fwd: ${origSubject}`;

      const forwardHeader = [
        "---------- Forwarded message ----------",
        `From: ${origFrom}`,
        `Date: ${origDate}`,
        `Subject: ${origSubject}`,
        "",
      ].join("\r\n");

      const userText = (a.body as string) || "";
      const body = userText
        ? `${userText}\r\n\r\n${forwardHeader}\r\n${origBody}`
        : `${forwardHeader}\r\n${origBody}`;

      // Collect attachments
      const allAttachments: Attachment[] = [];

      // Include original attachments unless explicitly disabled
      if (a.includeOriginalAttachments !== false) {
        const origAttachments = extractAttachmentInfo(orig.data.payload);
        for (const att of origAttachments) {
          const attRes = await gmail.users.messages.attachments.get({
            userId: "me",
            messageId: a.messageId as string,
            id: att.attachmentId,
          });
          if (attRes.data.data) {
            allAttachments.push({
              filename: att.filename,
              mimeType: att.mimeType,
              base64Data: attRes.data.data.replace(/-/g, "+").replace(/_/g, "/"),
            });
          }
        }
      }

      // Append any new attachments
      if (a.attachments) {
        allAttachments.push(...(a.attachments as Attachment[]));
      }

      const mime = buildMimeMessage({
        to: a.to as string,
        subject,
        body,
        cc: a.cc as string | undefined,
        bcc: a.bcc as string | undefined,
        contentType: a.contentType as string | undefined,
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      });

      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodeBase64Url(mime),
          threadId: orig.data.threadId ?? undefined,
        },
      });
      return { id: res.data.id, threadId: res.data.threadId, labelIds: res.data.labelIds };
    },
  },

  // ── 7. Modify Message ──
  {
    name: "google_gmail_modify_message",
    description:
      "Add or remove labels from a message (e.g. mark as read by removing UNREAD, archive by removing INBOX)",
    schema: s.modifyMessageSchema,
    execute: async (a, gmail) => {
      const res = await gmail.users.messages.modify({
        userId: "me",
        id: a.messageId as string,
        requestBody: {
          addLabelIds: splitCsv(a.addLabelIds as string) || undefined,
          removeLabelIds: splitCsv(a.removeLabelIds as string) || undefined,
        },
      });
      return { id: res.data.id, labelIds: res.data.labelIds, threadId: res.data.threadId };
    },
  },

  // ── 8. Trash/Untrash Message ──
  {
    name: "google_gmail_trash_message",
    description: "Move a message to trash or restore it from trash",
    schema: s.trashMessageSchema,
    execute: async (a, gmail) => {
      const op = a.operation as string;
      if (op === "trash") {
        const res = await gmail.users.messages.trash({
          userId: "me",
          id: a.messageId as string,
        });
        return { id: res.data.id, labelIds: res.data.labelIds };
      }
      const res = await gmail.users.messages.untrash({
        userId: "me",
        id: a.messageId as string,
      });
      return { id: res.data.id, labelIds: res.data.labelIds };
    },
  },

  // ── 9. Batch Modify Messages ──
  {
    name: "google_gmail_batch_modify_messages",
    description:
      "Batch modify labels on multiple messages, or permanently delete multiple messages",
    schema: s.batchModifyMessagesSchema,
    execute: async (a, gmail) => {
      const op = a.operation as string;
      const ids = splitCsv(a.messageIds as string);

      if (op === "delete") {
        await gmail.users.messages.batchDelete({
          userId: "me",
          requestBody: { ids },
        });
        return { deleted: ids.length };
      }

      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: {
          ids,
          addLabelIds: splitCsv(a.addLabelIds as string) || undefined,
          removeLabelIds: splitCsv(a.removeLabelIds as string) || undefined,
        },
      });
      return { modified: ids.length };
    },
  },

  // ── 10. List Threads ──
  {
    name: "google_gmail_list_threads",
    description:
      "List email threads matching a search query, with thread IDs, snippets, and history IDs",
    schema: s.listThreadsSchema,
    execute: async (a, gmail) => {
      const res = await gmail.users.threads.list({
        userId: "me",
        q: (a.q as string) || undefined,
        labelIds: splitCsv(a.labelIds as string) || undefined,
        maxResults: (a.maxResults as number) || 10,
        pageToken: (a.pageToken as string) || undefined,
        includeSpamTrash: (a.includeSpamTrash as boolean) || undefined,
      });
      return {
        threads: res.data.threads ?? [],
        resultSizeEstimate: res.data.resultSizeEstimate,
        nextPageToken: res.data.nextPageToken,
      };
    },
  },

  // ── 11. Get Thread ──
  {
    name: "google_gmail_get_thread",
    description:
      "Get all messages in a thread with headers, bodies, and attachment metadata",
    schema: s.getThreadSchema,
    execute: async (a, gmail) => {
      const res = await gmail.users.threads.get({
        userId: "me",
        id: a.threadId as string,
        format: (a.format as string) || "full",
      });
      const thread = res.data;
      return {
        id: thread.id,
        historyId: thread.historyId,
        messages: (thread.messages ?? []).map((msg) =>
          formatMessage(msg, true)
        ),
      };
    },
  },

  // ── 12. Manage Drafts ──
  {
    name: "google_gmail_manage_drafts",
    description:
      "Create, update, list, get, delete, or send email drafts",
    schema: s.manageDraftsSchema,
    execute: async (a, gmail) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const res = await gmail.users.drafts.list({
            userId: "me",
            maxResults: (a.maxResults as number) || 10,
            pageToken: (a.pageToken as string) || undefined,
          });
          return {
            drafts: res.data.drafts ?? [],
            resultSizeEstimate: res.data.resultSizeEstimate,
            nextPageToken: res.data.nextPageToken,
          };
        }

        case "get": {
          const res = await gmail.users.drafts.get({
            userId: "me",
            id: a.draftId as string,
            format: "full",
          });
          const msg = res.data.message;
          return {
            id: res.data.id,
            message: msg ? formatMessage(msg, true) : null,
          };
        }

        case "create": {
          const mime = buildMimeMessage({
            to: (a.to as string) || "",
            subject: (a.subject as string) || "",
            body: (a.body as string) || "",
            cc: a.cc as string | undefined,
            bcc: a.bcc as string | undefined,
            contentType: a.contentType as string | undefined,
            attachments: a.attachments as Attachment[] | undefined,
          });
          const res = await gmail.users.drafts.create({
            userId: "me",
            requestBody: { message: { raw: encodeBase64Url(mime) } },
          });
          return { id: res.data.id, message: res.data.message };
        }

        case "update": {
          const mime = buildMimeMessage({
            to: (a.to as string) || "",
            subject: (a.subject as string) || "",
            body: (a.body as string) || "",
            cc: a.cc as string | undefined,
            bcc: a.bcc as string | undefined,
            contentType: a.contentType as string | undefined,
            attachments: a.attachments as Attachment[] | undefined,
          });
          const res = await gmail.users.drafts.update({
            userId: "me",
            id: a.draftId as string,
            requestBody: { message: { raw: encodeBase64Url(mime) } },
          });
          return { id: res.data.id, message: res.data.message };
        }

        case "delete": {
          await gmail.users.drafts.delete({
            userId: "me",
            id: a.draftId as string,
          });
          return { deleted: true };
        }

        case "send": {
          const res = await gmail.users.drafts.send({
            userId: "me",
            requestBody: { id: a.draftId as string },
          });
          return { id: res.data.id, threadId: res.data.threadId, labelIds: res.data.labelIds };
        }

        default:
          return { error: `Unknown draft operation: ${op}` };
      }
    },
  },

  // ── 13. Manage Labels ──
  {
    name: "google_gmail_manage_labels",
    description:
      "List, get, create, update, or delete Gmail labels",
    schema: s.manageLabelsSchema,
    execute: async (a, gmail) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const res = await gmail.users.labels.list({ userId: "me" });
          return { labels: res.data.labels ?? [] };
        }

        case "get": {
          const res = await gmail.users.labels.get({
            userId: "me",
            id: a.labelId as string,
          });
          return res.data;
        }

        case "create": {
          const body: gmail_v1.Schema$Label = {
            name: a.name as string,
            labelListVisibility: (a.visibility as string) || "labelShow",
            messageListVisibility: "show",
          };
          if (a.color) {
            const [textColor, bgColor] = (a.color as string).split(",");
            body.color = {
              textColor: textColor?.trim(),
              backgroundColor: bgColor?.trim(),
            };
          }
          const res = await gmail.users.labels.create({
            userId: "me",
            requestBody: body,
          });
          return res.data;
        }

        case "update": {
          const body: gmail_v1.Schema$Label = {};
          if (a.name) body.name = a.name as string;
          if (a.visibility) body.labelListVisibility = a.visibility as string;
          if (a.color) {
            const [textColor, bgColor] = (a.color as string).split(",");
            body.color = {
              textColor: textColor?.trim(),
              backgroundColor: bgColor?.trim(),
            };
          }
          const res = await gmail.users.labels.patch({
            userId: "me",
            id: a.labelId as string,
            requestBody: body,
          });
          return res.data;
        }

        case "delete": {
          await gmail.users.labels.delete({
            userId: "me",
            id: a.labelId as string,
          });
          return { deleted: true };
        }

        default:
          return { error: `Unknown label operation: ${op}` };
      }
    },
  },

  // ── 14. Manage Vacation Responder ──
  {
    name: "google_gmail_manage_vacation",
    description:
      "Get or update the Gmail vacation/out-of-office auto-reply settings",
    schema: s.manageVacationSchema,
    execute: async (a, gmail) => {
      const op = a.operation as string;

      if (op === "get") {
        const res = await gmail.users.settings.getVacation({
          userId: "me",
        });
        return res.data;
      }

      // update
      const res = await gmail.users.settings.updateVacation({
        userId: "me",
        requestBody: {
          enableAutoReply: a.enableAutoReply as boolean | undefined,
          responseSubject: (a.responseSubject as string) || undefined,
          responseBodyHtml: (a.responseBody as string) || undefined,
          startTime: (a.startTime as string) || undefined,
          endTime: (a.endTime as string) || undefined,
          restrictToContacts: a.restrictToContacts as boolean | undefined,
          restrictToDomain: a.restrictToDomain as boolean | undefined,
        },
      });
      return res.data;
    },
  },

  // ── 15. Manage Filters ──
  {
    name: "google_gmail_manage_filters",
    description:
      "List, get, create, or delete Gmail filters (rules that automatically process incoming mail)",
    schema: s.manageFiltersSchema,
    execute: async (a, gmail) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const res = await gmail.users.settings.filters.list({
            userId: "me",
          });
          return { filters: res.data.filter ?? [] };
        }

        case "get": {
          const res = await gmail.users.settings.filters.get({
            userId: "me",
            id: a.filterId as string,
          });
          return res.data;
        }

        case "create": {
          const criteria: gmail_v1.Schema$FilterCriteria = {};
          if (a.criteriaFrom) criteria.from = a.criteriaFrom as string;
          if (a.criteriaTo) criteria.to = a.criteriaTo as string;
          if (a.criteriaSubject) criteria.subject = a.criteriaSubject as string;
          if (a.criteriaQuery) criteria.query = a.criteriaQuery as string;
          if (a.criteriaHasAttachment !== undefined)
            criteria.hasAttachment = a.criteriaHasAttachment as boolean;
          if (a.criteriaSize !== undefined) criteria.size = a.criteriaSize as number;
          if (a.criteriaSizeComparison)
            criteria.sizeComparison = a.criteriaSizeComparison as string;

          const filterAction: gmail_v1.Schema$FilterAction = {};
          if (a.actionAddLabelIds)
            filterAction.addLabelIds = splitCsv(a.actionAddLabelIds as string);
          if (a.actionRemoveLabelIds)
            filterAction.removeLabelIds = splitCsv(
              a.actionRemoveLabelIds as string
            );
          if (a.actionForward) filterAction.forward = a.actionForward as string;

          const res = await gmail.users.settings.filters.create({
            userId: "me",
            requestBody: { criteria, action: filterAction },
          });
          return res.data;
        }

        case "delete": {
          await gmail.users.settings.filters.delete({
            userId: "me",
            id: a.filterId as string,
          });
          return { deleted: true };
        }

        default:
          return { error: `Unknown filter operation: ${op}` };
      }
    },
  },

  // ── 16. Get Profile ──
  {
    name: "google_gmail_get_profile",
    description:
      "Get the authenticated user's Gmail profile: email address, total messages, total threads, and current history ID",
    schema: s.getProfileSchema,
    execute: async (_a, gmail) => {
      const res = await gmail.users.getProfile({ userId: "me" });
      return res.data;
    },
  },

  // ── 17. List History ──
  {
    name: "google_gmail_list_history",
    description:
      "List mailbox change history since a given history ID (for incremental sync)",
    schema: s.listHistorySchema,
    execute: async (a, gmail) => {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId: a.startHistoryId as string,
        labelId: (a.labelId as string) || undefined,
        historyTypes: splitCsv(a.historyTypes as string) || undefined,
        maxResults: (a.maxResults as number) || undefined,
        pageToken: (a.pageToken as string) || undefined,
      });
      return {
        history: res.data.history ?? [],
        historyId: res.data.historyId,
        nextPageToken: res.data.nextPageToken,
      };
    },
  },
];
