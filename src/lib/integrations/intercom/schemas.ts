import { z } from "zod";
import { jsonParamOptional } from "../shared/json-params";

// ── Shared fragments ──

export const contactId = z.string().describe("Intercom contact ID");
export const companyId = z.string().describe("Intercom company ID");
export const conversationId = z.string().describe("Intercom conversation ID");
export const tagId = z.string().describe("Intercom tag ID");
export const ticketId = z.string().describe("Intercom ticket ID");
export const segmentId = z.string().describe("Intercom segment ID");
export const dataAttributeId = z
  .string()
  .describe("Intercom data attribute ID");

export const paginationFields = {
  per_page: z
    .number()
    .int()
    .min(1)
    .max(150)
    .optional()
    .describe("Results per page (1-150, default 50)"),
  starting_after: z
    .string()
    .optional()
    .describe("Cursor for next page from previous response"),
};

// ── 1. Manage Contacts ──

export const manageContactsSchema = z.object({
  operation: z.enum([
    "get",
    "create",
    "update",
    "delete",
    "list",
    "archive",
    "unarchive",
  ]),
  contact_id: z.string().optional().describe("Contact ID (for get/update/delete/archive/unarchive)"),
  role: z
    .enum(["lead", "user"])
    .optional()
    .describe("Contact role (required for create)"),
  email: z.string().optional().describe("Contact email"),
  phone: z.string().optional().describe("Contact phone number"),
  name: z.string().optional().describe("Contact full name"),
  external_id: z.string().optional().describe("External ID for the contact"),
  avatar: z.string().optional().describe("URL to contact avatar image"),
  custom_attributes: jsonParamOptional("Custom attributes to set on the contact"),
  ...paginationFields,
});

// ── 2. Manage Companies ──

export const manageCompaniesSchema = z.object({
  operation: z.enum([
    "get",
    "create",
    "update",
    "list",
    "search",
    "list_contacts",
  ]),
  company_id: z
    .string()
    .optional()
    .describe("Company ID (for get/update/list_contacts)"),
  name: z.string().optional().describe("Company name"),
  company_id_str: z
    .string()
    .optional()
    .describe("Your company identifier (for create/update)"),
  plan: z.string().optional().describe("Company plan name"),
  size: z.number().optional().describe("Number of employees"),
  website: z.string().optional().describe("Company website URL"),
  industry: z.string().optional().describe("Company industry"),
  custom_attributes: jsonParamOptional("Custom attributes object"),
  query: jsonParamOptional("Search query object (for search operation)"),
  ...paginationFields,
});

// ── 3. Manage Conversations ──

export const manageConversationsSchema = z.object({
  operation: z.enum([
    "get",
    "list",
    "search",
    "create",
    "reply",
    "close",
    "open",
    "assign",
    "snooze",
    "unsnooze",
  ]),
  conversation_id: z
    .string()
    .optional()
    .describe(
      "Conversation ID (for get/reply/close/open/assign/snooze/unsnooze)"
    ),
  // create fields
  from_contact_id: z
    .string()
    .optional()
    .describe("Contact ID of the conversation initiator (for create)"),
  body: z
    .string()
    .optional()
    .describe("Message body (for create/reply)"),
  // reply fields
  message_type: z
    .enum(["comment", "note"])
    .optional()
    .describe("Reply type: comment (visible to user) or note (internal)"),
  admin_id: z
    .string()
    .optional()
    .describe("Admin ID (for reply/close/open/assign)"),
  // assign
  assignee_id: z
    .string()
    .optional()
    .describe("Admin or team ID to assign the conversation to"),
  // snooze
  snoozed_until: z
    .number()
    .optional()
    .describe("Unix timestamp to snooze until"),
  // search
  query: jsonParamOptional("Search query object (for search operation)"),
  ...paginationFields,
});

// ── 4. Manage Tags (CRUD) ──

export const manageTagsSchema = z.object({
  operation: z.enum(["list", "get", "create", "update", "delete"]),
  tag_id: z.string().optional().describe("Tag ID (for get/update/delete)"),
  name: z.string().optional().describe("Tag name (for create/update)"),
});

// ── 5. Apply Tags (attach/detach to resources) ──

export const applyTagsSchema = z.object({
  operation: z.enum([
    "tag_contact",
    "untag_contact",
    "tag_conversation",
    "untag_conversation",
    "tag_company",
    "untag_company",
  ]),
  tag_id: z.string().describe("Tag ID to apply or remove"),
  contact_id: z
    .string()
    .optional()
    .describe("Contact ID (for tag_contact/untag_contact)"),
  conversation_id: z
    .string()
    .optional()
    .describe("Conversation ID (for tag_conversation/untag_conversation)"),
  company_id: z
    .string()
    .optional()
    .describe("Company ID (for tag_company/untag_company)"),
});

// ── 6. Manage Tickets ──

export const manageTicketsSchema = z.object({
  operation: z.enum(["get", "create", "update", "search", "reply"]),
  ticket_id: z
    .string()
    .optional()
    .describe("Ticket ID (for get/update/reply)"),
  ticket_type_id: z
    .string()
    .optional()
    .describe("Ticket type ID (for create)"),
  title: z.string().optional().describe("Ticket title (for create)"),
  description: z.string().optional().describe("Ticket description"),
  contact_id: z
    .string()
    .optional()
    .describe("Contact ID associated with the ticket"),
  admin_id: z.string().optional().describe("Admin ID (for reply)"),
  body: z.string().optional().describe("Reply body (for reply)"),
  message_type: z
    .enum(["comment", "note"])
    .optional()
    .describe("Reply type (for reply)"),
  ticket_attributes: jsonParamOptional("Ticket attributes object (for create/update)"),
  query: jsonParamOptional("Search query object (for search)"),
  ...paginationFields,
});

// ── 7. Search Contacts (dedicated advanced search) ──

export const searchContactsSchema = z.object({
  // Friendly fields (auto-translated to Intercom query DSL)
  email: z.string().optional().describe("Search by exact email address"),
  email_domain: z
    .string()
    .optional()
    .describe("Search by email domain (e.g. 'example.com')"),
  name: z
    .string()
    .optional()
    .describe("Search by contact name (contains match)"),
  phone: z.string().optional().describe("Search by phone number"),
  role: z
    .enum(["user", "lead"])
    .optional()
    .describe("Filter by contact role"),
  contact_ids: z
    .string()
    .optional()
    .describe("Comma-separated list of contact IDs to look up"),
  custom_attributes: jsonParamOptional("Custom attribute filters, e.g. {\"plan\": \"pro\"}"),
  // Raw fallback for advanced queries
  query: jsonParamOptional("Raw Intercom search query (advanced). If provided, friendly fields above are ignored. Format: {\"field\":\"email\",\"operator\":\"=\",\"value\":\"x@y.com\"}"),
  ...paginationFields,
});

// ── 8. Manage Segments ──

export const manageSegmentsSchema = z.object({
  operation: z.enum(["list", "get"]),
  segment_id: z.string().optional().describe("Segment ID (for get)"),
  include_count: z
    .boolean()
    .optional()
    .describe("Include contact count in response"),
});

// ── 9. Manage Events ──

export const manageEventsSchema = z.object({
  operation: z.enum(["track", "list"]),
  // track fields
  event_name: z.string().optional().describe("Event name (for track)"),
  user_id: z
    .string()
    .optional()
    .describe("User ID or Intercom user ID (for track/list)"),
  email: z.string().optional().describe("User email (alternative to user_id for track)"),
  metadata: jsonParamOptional("Event metadata object (for track)"),
  // list fields
  intercom_user_id: z
    .string()
    .optional()
    .describe("Intercom user ID (for list)"),
  type: z
    .literal("user")
    .optional()
    .describe("Type parameter, must be 'user' (for list)"),
  ...paginationFields,
});

// ── 10. Manage Notes ──

export const manageNotesSchema = z.object({
  operation: z.enum(["list", "create"]),
  contact_id: z.string().describe("Contact ID to list/create notes for"),
  body: z.string().optional().describe("Note body in HTML (for create)"),
  admin_id: z
    .string()
    .optional()
    .describe("Admin ID who is creating the note (for create)"),
  ...paginationFields,
});

// ── 11. Manage Data Attributes ──

export const manageDataAttributesSchema = z.object({
  operation: z.enum(["list", "create", "update"]),
  data_attribute_id: z
    .string()
    .optional()
    .describe("Data attribute ID (for update)"),
  model: z
    .enum(["contact", "company", "conversation"])
    .optional()
    .describe("Model type to filter or create attribute for"),
  name: z.string().optional().describe("Attribute name (for create)"),
  label: z.string().optional().describe("Attribute label (for create/update)"),
  data_type: z
    .enum(["string", "integer", "float", "boolean", "date"])
    .optional()
    .describe("Data type for the attribute (for create)"),
  description: z
    .string()
    .optional()
    .describe("Attribute description (for create/update)"),
  options: jsonParamOptional("Array of options for list attributes (for create)"),
  archived: z
    .boolean()
    .optional()
    .describe("Whether the attribute is archived (for update)"),
});

// ── 12. Get Counts ──

export const getCountsSchema = z.object({
  type: z
    .enum(["user", "company", "conversation", "tag", "segment", "lead"])
    .optional()
    .describe("Count type to retrieve (default: all)"),
  count_type: z
    .string()
    .optional()
    .describe("Sub-count type (e.g. 'tag', 'segment' for user counts)"),
});

// ── 13. Manage Contact Companies ──

export const manageContactCompaniesSchema = z.object({
  operation: z.enum(["attach", "detach", "list"]),
  contact_id: z.string().describe("Contact ID"),
  company_id: z
    .string()
    .optional()
    .describe("Company ID (for attach/detach)"),
  ...paginationFields,
});
