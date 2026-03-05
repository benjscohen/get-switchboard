import type { IntegrationToolDef } from "../types";
import * as s from "./schemas";

// ── Client type ──

export type IntercomClient = {
  accessToken: string;
  baseUrl: string;
};

// ── Helpers ──

async function api(
  client: IntercomClient,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const res = await fetch(`${client.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Intercom-Version": "2.14",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Intercom API ${res.status}: ${text}`);
  }
  if (res.status === 204) return { success: true };
  return res.json();
}

/** Build query string from an object, skipping undefined/null values */
function qs(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Parse a JSON string field or return undefined */
function parseJson(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON string");
  }
}

// ── Typed tool def ──

type IntercomToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    client: IntercomClient
  ) => Promise<unknown>;
};

// ── Tool implementations ──

export const INTERCOM_TOOLS: IntercomToolDef[] = [
  // ── 1. Manage Contacts ──
  {
    name: "intercom_manage_contacts",
    description:
      "Get, create, update, delete, list, archive, or unarchive contacts in Intercom",
    schema: s.manageContactsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const id = a.contact_id as string | undefined;
      const customAttrs = parseJson(a.custom_attributes as string | undefined);

      switch (op) {
        case "get":
          return api(c, `/contacts/${id}`);
        case "create": {
          const body: Record<string, unknown> = { role: a.role };
          if (a.email) body.email = a.email;
          if (a.phone) body.phone = a.phone;
          if (a.name) body.name = a.name;
          if (a.external_id) body.external_id = a.external_id;
          if (a.avatar) body.avatar = a.avatar;
          if (customAttrs) body.custom_attributes = customAttrs;
          return api(c, "/contacts", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          for (const key of ["email", "phone", "name", "external_id", "avatar", "role"] as const) {
            if (a[key] !== undefined) body[key] = a[key];
          }
          if (customAttrs) body.custom_attributes = customAttrs;
          return api(c, `/contacts/${id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
        }
        case "delete":
          return api(c, `/contacts/${id}`, { method: "DELETE" });
        case "list":
          return api(c, `/contacts${qs({ per_page: a.per_page, starting_after: a.starting_after })}`);
        case "archive":
          return api(c, `/contacts/${id}/archive`, { method: "POST" });
        case "unarchive":
          return api(c, `/contacts/${id}/unarchive`, { method: "POST" });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 2. Manage Companies ──
  {
    name: "intercom_manage_companies",
    description:
      "Get, create, update, list, search companies or list a company's contacts in Intercom",
    schema: s.manageCompaniesSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const id = a.company_id as string | undefined;
      const customAttrs = parseJson(a.custom_attributes as string | undefined);

      switch (op) {
        case "get":
          return api(c, `/companies/${id}`);
        case "create":
        case "update": {
          const body: Record<string, unknown> = {};
          for (const key of ["name", "plan", "size", "website", "industry"] as const) {
            if (a[key] !== undefined) body[key] = a[key];
          }
          if (a.company_id_str) body.company_id = a.company_id_str;
          if (customAttrs) body.custom_attributes = customAttrs;
          if (op === "update" && id) {
            return api(c, `/companies/${id}`, {
              method: "PUT",
              body: JSON.stringify(body),
            });
          }
          return api(c, "/companies", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "list":
          return api(c, `/companies${qs({ per_page: a.per_page, starting_after: a.starting_after })}`);
        case "search": {
          const query = parseJson(a.query as string | undefined);
          return api(c, "/companies/search", {
            method: "POST",
            body: JSON.stringify({ query, pagination: { per_page: a.per_page, starting_after: a.starting_after } }),
          });
        }
        case "list_contacts":
          return api(c, `/companies/${id}/contacts${qs({ per_page: a.per_page, starting_after: a.starting_after })}`);
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 3. Manage Conversations ──
  {
    name: "intercom_manage_conversations",
    description:
      "Get, list, search, create, reply to, close, open, assign, snooze, or unsnooze conversations in Intercom",
    schema: s.manageConversationsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const id = a.conversation_id as string | undefined;

      switch (op) {
        case "get":
          return api(c, `/conversations/${id}`);
        case "list":
          return api(c, `/conversations${qs({ per_page: a.per_page, starting_after: a.starting_after })}`);
        case "search": {
          const query = parseJson(a.query as string | undefined);
          return api(c, "/conversations/search", {
            method: "POST",
            body: JSON.stringify({ query, pagination: { per_page: a.per_page, starting_after: a.starting_after } }),
          });
        }
        case "create":
          return api(c, "/conversations", {
            method: "POST",
            body: JSON.stringify({
              from: { type: "contact", id: a.from_contact_id },
              body: a.body,
            }),
          });
        case "reply":
          return api(c, `/conversations/${id}/reply`, {
            method: "POST",
            body: JSON.stringify({
              message_type: a.message_type ?? "comment",
              type: "admin",
              admin_id: a.admin_id,
              body: a.body,
            }),
          });
        case "close":
          return api(c, `/conversations/${id}/parts`, {
            method: "POST",
            body: JSON.stringify({
              message_type: "close",
              type: "admin",
              admin_id: a.admin_id,
              body: a.body,
            }),
          });
        case "open":
          return api(c, `/conversations/${id}/parts`, {
            method: "POST",
            body: JSON.stringify({
              message_type: "open",
              admin_id: a.admin_id,
            }),
          });
        case "assign":
          return api(c, `/conversations/${id}/parts`, {
            method: "POST",
            body: JSON.stringify({
              message_type: "assignment",
              type: "admin",
              admin_id: a.admin_id,
              assignee_id: a.assignee_id,
              body: a.body,
            }),
          });
        case "snooze":
          return api(c, `/conversations/${id}/parts`, {
            method: "POST",
            body: JSON.stringify({
              message_type: "snoozed",
              admin_id: a.admin_id,
              snoozed_until: a.snoozed_until,
            }),
          });
        case "unsnooze":
          return api(c, `/conversations/${id}/parts`, {
            method: "POST",
            body: JSON.stringify({
              message_type: "open",
              admin_id: a.admin_id,
            }),
          });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 4. Manage Tags (CRUD) ──
  {
    name: "intercom_manage_tags",
    description: "List, get, create, update, or delete tags in Intercom",
    schema: s.manageTagsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const id = a.tag_id as string | undefined;

      switch (op) {
        case "list":
          return api(c, "/tags");
        case "get":
          return api(c, `/tags/${id}`);
        case "create":
          return api(c, "/tags", {
            method: "POST",
            body: JSON.stringify({ name: a.name }),
          });
        case "update":
          return api(c, `/tags/${id}`, {
            method: "PUT",
            body: JSON.stringify({ name: a.name }),
          });
        case "delete":
          return api(c, `/tags/${id}`, { method: "DELETE" });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 5. Apply Tags ──
  {
    name: "intercom_apply_tags",
    description:
      "Tag or untag contacts, conversations, or companies in Intercom",
    schema: s.applyTagsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const tagId = a.tag_id as string;

      switch (op) {
        case "tag_contact":
          return api(c, `/contacts/${a.contact_id}/tags`, {
            method: "POST",
            body: JSON.stringify({ id: tagId }),
          });
        case "untag_contact":
          return api(c, `/contacts/${a.contact_id}/tags/${tagId}`, {
            method: "DELETE",
          });
        case "tag_conversation":
          return api(c, `/conversations/${a.conversation_id}/tags`, {
            method: "POST",
            body: JSON.stringify({ id: tagId }),
          });
        case "untag_conversation":
          return api(c, `/conversations/${a.conversation_id}/tags/${tagId}`, {
            method: "DELETE",
          });
        case "tag_company":
          return api(c, `/companies/${a.company_id}/tags`, {
            method: "POST",
            body: JSON.stringify({ id: tagId }),
          });
        case "untag_company":
          return api(c, `/companies/${a.company_id}/tags/${tagId}`, {
            method: "DELETE",
          });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 6. Manage Tickets ──
  {
    name: "intercom_manage_tickets",
    description:
      "Get, create, update, search, or reply to tickets in Intercom",
    schema: s.manageTicketsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const id = a.ticket_id as string | undefined;
      const ticketAttrs = parseJson(a.ticket_attributes as string | undefined);

      switch (op) {
        case "get":
          return api(c, `/tickets/${id}`);
        case "create": {
          const body: Record<string, unknown> = {
            ticket_type_id: a.ticket_type_id,
          };
          if (a.title) body.title = a.title;
          if (a.description) body.description = a.description;
          if (a.contact_id)
            body.contacts = [{ id: a.contact_id }];
          if (ticketAttrs) body.ticket_attributes = ticketAttrs;
          return api(c, "/tickets", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          if (a.title) body.title = a.title;
          if (a.description) body.description = a.description;
          if (ticketAttrs) body.ticket_attributes = ticketAttrs;
          return api(c, `/tickets/${id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
        }
        case "search": {
          const query = parseJson(a.query as string | undefined);
          return api(c, "/tickets/search", {
            method: "POST",
            body: JSON.stringify({ query, pagination: { per_page: a.per_page, starting_after: a.starting_after } }),
          });
        }
        case "reply":
          return api(c, `/tickets/${id}/reply`, {
            method: "POST",
            body: JSON.stringify({
              message_type: a.message_type ?? "comment",
              type: "admin",
              admin_id: a.admin_id,
              body: a.body,
            }),
          });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 7. Search Contacts (advanced) ──
  {
    name: "intercom_search_contacts",
    description:
      "Advanced contact search using Intercom's query DSL with field/operator/value filters",
    schema: s.searchContactsSchema,
    execute: async (a, c) => {
      const query = parseJson(a.query as string);
      return api(c, "/contacts/search", {
        method: "POST",
        body: JSON.stringify({ query, pagination: { per_page: a.per_page, starting_after: a.starting_after } }),
      });
    },
  },

  // ── 8. Manage Segments ──
  {
    name: "intercom_manage_segments",
    description: "List all segments or get a specific segment in Intercom",
    schema: s.manageSegmentsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      switch (op) {
        case "list":
          return api(c, `/segments${qs({ include_count: a.include_count })}`);
        case "get":
          return api(c, `/segments/${a.segment_id}`);
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 9. Manage Events ──
  {
    name: "intercom_manage_events",
    description:
      "Track events for users or list events for a specific user in Intercom",
    schema: s.manageEventsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      switch (op) {
        case "track": {
          const body: Record<string, unknown> = {
            event_name: a.event_name,
            created_at: Math.floor(Date.now() / 1000),
          };
          if (a.user_id) body.user_id = a.user_id;
          if (a.email) body.email = a.email;
          const metadata = parseJson(a.metadata as string | undefined);
          if (metadata) body.metadata = metadata;
          return api(c, "/events", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "list":
          return api(
            c,
            `/events${qs({
              type: "user",
              user_id: a.user_id,
              intercom_user_id: a.intercom_user_id,
              per_page: a.per_page,
            })}`
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 10. Manage Notes ──
  {
    name: "intercom_manage_notes",
    description:
      "List or create notes on a contact in Intercom",
    schema: s.manageNotesSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const contactId = a.contact_id as string;
      switch (op) {
        case "list":
          return api(c, `/contacts/${contactId}/notes${qs({ per_page: a.per_page, starting_after: a.starting_after })}`);
        case "create":
          return api(c, `/contacts/${contactId}/notes`, {
            method: "POST",
            body: JSON.stringify({
              body: a.body,
              admin_id: a.admin_id,
            }),
          });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 11. Manage Data Attributes ──
  {
    name: "intercom_manage_data_attributes",
    description:
      "List, create, or update custom data attributes in Intercom",
    schema: s.manageDataAttributesSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      switch (op) {
        case "list":
          return api(c, `/data_attributes${qs({ model: a.model })}`);
        case "create": {
          const body: Record<string, unknown> = {
            name: a.name,
            model: a.model,
            data_type: a.data_type,
          };
          if (a.label) body.label = a.label;
          if (a.description) body.description = a.description;
          const options = parseJson(a.options as string | undefined);
          if (options) body.options = options;
          return api(c, "/data_attributes", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          if (a.label !== undefined) body.label = a.label;
          if (a.description !== undefined) body.description = a.description;
          if (a.archived !== undefined) body.archived = a.archived;
          const options = parseJson(a.options as string | undefined);
          if (options) body.options = options;
          return api(c, `/data_attributes/${a.data_attribute_id}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
        }
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 12. Get Counts ──
  {
    name: "intercom_get_counts",
    description:
      "Get aggregate counts for users, companies, conversations, tags, segments, or leads in Intercom",
    schema: s.getCountsSchema,
    execute: async (a, c) => {
      return api(c, `/counts${qs({ type: a.type, count: a.count_type })}`);
    },
  },

  // ── 13. Manage Contact Companies ──
  {
    name: "intercom_manage_contact_companies",
    description:
      "Attach, detach, or list company associations for a contact in Intercom",
    schema: s.manageContactCompaniesSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const contactId = a.contact_id as string;
      switch (op) {
        case "attach":
          return api(c, `/contacts/${contactId}/companies`, {
            method: "POST",
            body: JSON.stringify({ id: a.company_id }),
          });
        case "detach":
          return api(c, `/contacts/${contactId}/companies/${a.company_id}`, {
            method: "DELETE",
          });
        case "list":
          return api(c, `/contacts/${contactId}/companies${qs({ per_page: a.per_page, starting_after: a.starting_after })}`);
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },
];
