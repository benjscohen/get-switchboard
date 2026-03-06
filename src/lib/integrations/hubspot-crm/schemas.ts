import { z } from "zod";
import { jsonParam, jsonParamOptional } from "../shared/json-params";

// ── Shared fragments ──

export const objectType = z
  .string()
  .describe(
    "CRM object type (e.g. contacts, companies, deals, tickets, leads, or custom object name)"
  );
export const objectId = z.string().describe("HubSpot object ID");
export const paginationFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page (1-100, default 10)"),
  after: z
    .string()
    .optional()
    .describe("Cursor for next page from previous response"),
};
export const propertiesField = z
  .string()
  .optional()
  .describe("Comma-separated property names to include in the response");

// ── CRM Objects (5) ──

export const manageObjectsSchema = z.object({
  operation: z.enum(["get", "create", "update", "archive", "list"]),
  object_type: objectType,
  object_id: z
    .string()
    .optional()
    .describe("Object ID (for get/update/archive)"),
  properties: jsonParamOptional("Properties object for create/update, or comma-separated property names for get/list"),
  associations: jsonParamOptional("Associations array for create"),
  ...paginationFields,
});

export const searchObjectsSchema = z.object({
  object_type: objectType,
  filter_groups: jsonParamOptional("HubSpot filter groups array"),
  sorts: jsonParamOptional("Sorts array"),
  query: z
    .string()
    .optional()
    .describe("Full-text search query string"),
  properties: propertiesField,
  ...paginationFields,
});

export const batchObjectsSchema = z.object({
  operation: z.enum(["create", "update", "read", "archive"]),
  object_type: objectType,
  inputs: jsonParam("Array of input objects for the batch operation"),
});

export const manageAssociationsSchema = z.object({
  operation: z.enum(["list", "create", "delete"]),
  from_object_type: z
    .string()
    .describe("Source object type (e.g. contacts, deals)"),
  from_object_id: z.string().describe("Source object ID"),
  to_object_type: z
    .string()
    .describe("Target object type (e.g. companies, deals)"),
  to_object_id: z
    .string()
    .optional()
    .describe("Target object ID (for create/delete)"),
  association_type_id: z
    .number()
    .optional()
    .describe("Association type ID (for create)"),
  ...paginationFields,
});

export const mergeObjectsSchema = z.object({
  object_type: objectType,
  primary_object_id: z
    .string()
    .describe("ID of the primary object that will remain after merge"),
  object_id_to_merge: z
    .string()
    .describe("ID of the object to merge into the primary object"),
});

// ── Schema & Properties (4) ──

export const managePropertiesSchema = z.object({
  operation: z.enum(["list", "get", "create", "update", "archive"]),
  object_type: objectType,
  property_name: z
    .string()
    .optional()
    .describe("Property name (for get/update/archive)"),
  name: z.string().optional().describe("Internal property name (for create)"),
  label: z
    .string()
    .optional()
    .describe("Display label (for create/update)"),
  type: z
    .enum(["string", "number", "date", "datetime", "enumeration", "bool"])
    .optional()
    .describe("Property data type (for create)"),
  field_type: z
    .string()
    .optional()
    .describe("Field type for the property (e.g. text, textarea, select)"),
  group_name: z
    .string()
    .optional()
    .describe("Property group name (for create/update)"),
  description: z
    .string()
    .optional()
    .describe("Property description (for create/update)"),
  options: jsonParamOptional("Array of options for enumeration type (for create/update)"),
});

export const managePropertyGroupsSchema = z.object({
  operation: z.enum(["list", "get", "create", "update", "archive"]),
  object_type: objectType,
  group_name: z
    .string()
    .optional()
    .describe("Property group name (for get/update/archive)"),
  name: z
    .string()
    .optional()
    .describe("Internal group name (for create)"),
  label: z
    .string()
    .optional()
    .describe("Display label (for create/update)"),
  display_order: z
    .number()
    .optional()
    .describe("Display order for the group"),
});

export const manageSchemasSchema = z.object({
  operation: z.enum(["list", "get", "create", "update", "archive"]),
  object_type: z
    .string()
    .optional()
    .describe("Custom object type (for get/update/archive)"),
  name: z
    .string()
    .optional()
    .describe("Internal schema name (for create)"),
  labels: jsonParamOptional('Labels object, e.g. {"singular":"Car","plural":"Cars"} (for create/update)'),
  properties: jsonParamOptional("Array of property definitions (for create)"),
  required_properties: jsonParamOptional("Array of required property names (for create/update)"),
  primary_display_property: z
    .string()
    .optional()
    .describe("Primary display property name (for create/update)"),
  secondary_display_properties: jsonParamOptional("Array of secondary display property names (for create/update)"),
});

export const getObjectSchemaSchema = z.object({
  object_type: objectType,
});

// ── Pipelines (2) ──

export const managePipelinesSchema = z.object({
  operation: z.enum(["list", "get", "create", "update", "archive"]),
  object_type: z
    .string()
    .describe("Object type for pipelines (deals or tickets)"),
  pipeline_id: z
    .string()
    .optional()
    .describe("Pipeline ID (for get/update/archive)"),
  label: z
    .string()
    .optional()
    .describe("Pipeline label (for create/update)"),
  display_order: z
    .number()
    .optional()
    .describe("Display order for the pipeline"),
  stages: jsonParamOptional("Array of stage definitions (for create/update)"),
});

export const managePipelineStagesSchema = z.object({
  operation: z.enum(["list", "get", "create", "update", "archive"]),
  object_type: z
    .string()
    .describe("Object type for pipelines (deals or tickets)"),
  pipeline_id: z.string().describe("Pipeline ID"),
  stage_id: z
    .string()
    .optional()
    .describe("Stage ID (for get/update/archive)"),
  label: z
    .string()
    .optional()
    .describe("Stage label (for create/update)"),
  display_order: z
    .number()
    .optional()
    .describe("Display order for the stage"),
  metadata: jsonParamOptional("Stage metadata object (for create/update)"),
});

// ── Owners & Users (2) ──

export const manageOwnersSchema = z.object({
  operation: z.enum(["list", "get"]),
  owner_id: z.string().optional().describe("Owner ID (for get)"),
  email: z
    .string()
    .optional()
    .describe("Filter owners by email address (for list)"),
  ...paginationFields,
});

export const manageUsersSchema = z.object({
  operation: z.enum(["list", "get"]),
  user_id: z.string().optional().describe("User ID (for get)"),
  ...paginationFields,
});

// ── Lists (1) ──

export const manageListsSchema = z.object({
  operation: z.enum([
    "get",
    "create",
    "update",
    "delete",
    "search",
    "add_members",
    "remove_members",
  ]),
  list_id: z
    .string()
    .optional()
    .describe("List ID (for get/update/delete/add_members/remove_members)"),
  name: z
    .string()
    .optional()
    .describe("List name (for create/update)"),
  object_type_id: z
    .string()
    .optional()
    .describe('Object type ID for the list, e.g. "0-1" for contacts (for create)'),
  processing_type: z
    .enum(["MANUAL", "DYNAMIC"])
    .optional()
    .describe("List processing type (for create)"),
  filter_branch: jsonParamOptional("Filter branch definition (for DYNAMIC lists)"),
  record_ids: jsonParamOptional("Array of record IDs (for add_members/remove_members)"),
  query: z
    .string()
    .optional()
    .describe("Search query string (for search)"),
  ...paginationFields,
});

// ── Import/Export (2) ──

export const manageImportsSchema = z.object({
  operation: z.enum(["start", "get", "cancel"]),
  import_id: z
    .string()
    .optional()
    .describe("Import ID (for get/cancel)"),
  files: jsonParamOptional("Array of import file configurations (for start)"),
  import_name: z
    .string()
    .optional()
    .describe("Name for the import (for start)"),
});

export const manageExportsSchema = z.object({
  operation: z.enum(["start", "get"]),
  export_id: z
    .string()
    .optional()
    .describe("Export ID (for get)"),
  export_type: z
    .enum(["VIEW", "LIST"])
    .optional()
    .describe("Export type (for start)"),
  format: z
    .enum(["CSV", "XLSX", "XLS"])
    .optional()
    .describe("File format (for start, default CSV)"),
  object_type: z
    .string()
    .optional()
    .describe("CRM object type to export (for start)"),
  object_properties: jsonParamOptional("Array of property names to export (for start)"),
  public_crm_search_request: jsonParamOptional("Search filter object (for VIEW exports)"),
  list_id: z
    .string()
    .optional()
    .describe("List ID (for LIST exports)"),
});

// ── Specialized (5) ──

export const manageDealSplitsSchema = z.object({
  operation: z.enum(["get", "set"]),
  deal_id: z.string().describe("Deal ID"),
  splits: jsonParamOptional("Array of split definitions (for set)"),
});

export const manageCallingTranscriptsSchema = z.object({
  operation: z.enum(["list", "get"]),
  transcript_id: z
    .string()
    .optional()
    .describe("Call/transcript ID (for get)"),
  ...paginationFields,
});

export const manageMarketingEventsSchema = z.object({
  operation: z.enum(["get", "create", "update", "delete", "list"]),
  event_id: z
    .string()
    .optional()
    .describe("Marketing event ID (for get/update/delete)"),
  external_event_id: z
    .string()
    .optional()
    .describe("External event ID (REQUIRED for create)"),
  external_account_id: z
    .string()
    .optional()
    .describe("External account ID (REQUIRED for create)"),
  event_name: z
    .string()
    .optional()
    .describe("Event name (for create/update)"),
  event_type: z
    .string()
    .optional()
    .describe("Event type (for create/update)"),
  start_date_time: z
    .string()
    .optional()
    .describe("Event start date-time in ISO 8601 format (for create/update)"),
  end_date_time: z
    .string()
    .optional()
    .describe("Event end date-time in ISO 8601 format (for create/update)"),
  event_organizer: z
    .string()
    .optional()
    .describe("Event organizer name (for create/update)"),
  event_description: z
    .string()
    .optional()
    .describe("Event description (for create/update)"),
  custom_properties: jsonParamOptional("Custom properties object (for create/update)"),
  ...paginationFields,
});

export const manageFeedbackSubmissionsSchema = z.object({
  operation: z.enum(["list", "get"]),
  submission_id: z
    .string()
    .optional()
    .describe("Feedback submission ID (for get)"),
  ...paginationFields,
});

export const manageForecastsSchema = z.object({
  operation: z.enum(["get"]),
  forecast_type: z
    .enum(["DEAL", "REVENUE"])
    .describe("Forecast type"),
  period_year: z.number().describe("Forecast period year"),
  period_month: z.number().describe("Forecast period month (1-12)"),
  pipeline_id: z.string().describe("Pipeline ID for the forecast"),
  user_id: z
    .string()
    .optional()
    .describe("User ID to filter forecast by"),
});

// ── Marketing & Automation (2) ──

export const manageCampaignsSchema = z.object({
  operation: z.enum(["list", "get"]),
  campaign_id: z
    .string()
    .optional()
    .describe("Campaign ID (for get)"),
  properties: propertiesField,
  ...paginationFields,
});

export const manageSequencesSchema = z.object({
  operation: z.enum(["list", "get", "enroll"]),
  sequence_id: z
    .string()
    .optional()
    .describe("Sequence ID (for get/enroll)"),
  contact_id: z
    .string()
    .optional()
    .describe("Contact ID to enroll in the sequence (for enroll)"),
  sender_email: z
    .string()
    .optional()
    .describe("Sender email address (REQUIRED for enroll)"),
  user_id: z
    .string()
    .optional()
    .describe("HubSpot user ID (REQUIRED for list/get)"),
  ...paginationFields,
});
