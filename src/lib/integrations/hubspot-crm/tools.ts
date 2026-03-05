import type { IntegrationToolDef } from "../types";
import * as s from "./schemas";

// ── Client type ──

export type HubSpotCrmClient = {
  accessToken: string;
  baseUrl: string; // "https://api.hubapi.com"
};

// ── Helpers ──

async function api(
  client: HubSpotCrmClient,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const res = await fetch(`${client.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API ${res.status}: ${text}`);
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

type HubSpotCrmToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    client: HubSpotCrmClient
  ) => Promise<unknown>;
};

// ── Tool implementations ──

export const HUBSPOT_CRM_TOOLS: HubSpotCrmToolDef[] = [
  // ── 1. Manage Objects ──
  {
    name: "hubspot_crm_manage_objects",
    description:
      "Get, create, update, archive, or list CRM objects (contacts, companies, deals, tickets, etc.) in HubSpot",
    schema: s.manageObjectsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const objectType = a.object_type as string;
      const id = a.object_id as string | undefined;

      switch (op) {
        case "get":
          return api(
            c,
            `/crm/v3/objects/${objectType}/${id}${qs({ properties: a.properties })}`
          );
        case "create": {
          const body: Record<string, unknown> = {
            properties: parseJson(a.properties as string | undefined) ?? {},
          };
          const associations = parseJson(
            a.associations as string | undefined
          );
          if (associations) body.associations = associations;
          return api(c, `/crm/v3/objects/${objectType}`, {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update":
          return api(c, `/crm/v3/objects/${objectType}/${id}`, {
            method: "PATCH",
            body: JSON.stringify({
              properties: parseJson(a.properties as string | undefined) ?? {},
            }),
          });
        case "archive":
          return api(c, `/crm/v3/objects/${objectType}/${id}`, {
            method: "DELETE",
          });
        case "list":
          return api(
            c,
            `/crm/v3/objects/${objectType}${qs({
              limit: a.limit,
              after: a.after,
              properties: a.properties,
            })}`
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 2. Search Objects ──
  {
    name: "hubspot_crm_search_objects",
    description:
      "Search CRM objects using filters, sorts, and full-text query in HubSpot",
    schema: s.searchObjectsSchema,
    execute: async (a, c) => {
      const objectType = a.object_type as string;
      const body: Record<string, unknown> = {};
      const filterGroups = parseJson(a.filter_groups as string | undefined);
      if (filterGroups) body.filterGroups = filterGroups;
      const sorts = parseJson(a.sorts as string | undefined);
      if (sorts) body.sorts = sorts;
      if (a.query) body.query = a.query;
      if (a.properties) body.properties = (a.properties as string).split(",").map((p) => p.trim());
      if (a.limit) body.limit = a.limit;
      if (a.after) body.after = a.after;
      return api(c, `/crm/v3/objects/${objectType}/search`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  },

  // ── 3. Batch Objects ──
  {
    name: "hubspot_crm_batch_objects",
    description:
      "Batch create, update, read, or archive CRM objects in HubSpot",
    schema: s.batchObjectsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const objectType = a.object_type as string;
      const inputs = parseJson(a.inputs as string);
      return api(c, `/crm/v3/objects/${objectType}/batch/${op}`, {
        method: "POST",
        body: JSON.stringify({ inputs }),
      });
    },
  },

  // ── 4. Manage Associations ──
  {
    name: "hubspot_crm_manage_associations",
    description:
      "List, create, or delete associations between CRM objects in HubSpot (v4 API)",
    schema: s.manageAssociationsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const fromType = a.from_object_type as string;
      const fromId = a.from_object_id as string;
      const toType = a.to_object_type as string;
      const toId = a.to_object_id as string | undefined;

      switch (op) {
        case "list":
          return api(
            c,
            `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}${qs({
              limit: a.limit,
              after: a.after,
            })}`
          );
        case "create":
          return api(
            c,
            `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`,
            {
              method: "PUT",
              body: JSON.stringify([
                { associationCategory: "HUBSPOT_DEFINED", associationTypeId: a.association_type_id },
              ]),
            }
          );
        case "delete":
          return api(
            c,
            `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`,
            { method: "DELETE" }
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 5. Merge Objects ──
  {
    name: "hubspot_crm_merge_objects",
    description: "Merge two CRM objects of the same type in HubSpot",
    schema: s.mergeObjectsSchema,
    execute: async (a, c) => {
      const objectType = a.object_type as string;
      return api(c, `/crm/v3/objects/${objectType}/merge`, {
        method: "POST",
        body: JSON.stringify({
          primaryObjectId: a.primary_object_id,
          objectIdToMerge: a.object_id_to_merge,
        }),
      });
    },
  },

  // ── 6. Manage Properties ──
  {
    name: "hubspot_crm_manage_properties",
    description:
      "List, get, create, update, or archive CRM object properties in HubSpot",
    schema: s.managePropertiesSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const objectType = a.object_type as string;
      const propName = a.property_name as string | undefined;

      switch (op) {
        case "list":
          return api(c, `/crm/v3/properties/${objectType}`);
        case "get":
          return api(c, `/crm/v3/properties/${objectType}/${propName}`);
        case "create": {
          const body: Record<string, unknown> = {
            name: a.name,
            label: a.label,
            type: a.type,
            fieldType: a.field_type,
          };
          if (a.group_name) body.groupName = a.group_name;
          if (a.description) body.description = a.description;
          const options = parseJson(a.options as string | undefined);
          if (options) body.options = options;
          return api(c, `/crm/v3/properties/${objectType}`, {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          if (a.label !== undefined) body.label = a.label;
          if (a.type !== undefined) body.type = a.type;
          if (a.field_type !== undefined) body.fieldType = a.field_type;
          if (a.group_name !== undefined) body.groupName = a.group_name;
          if (a.description !== undefined) body.description = a.description;
          const options = parseJson(a.options as string | undefined);
          if (options) body.options = options;
          return api(c, `/crm/v3/properties/${objectType}/${propName}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        }
        case "archive":
          return api(c, `/crm/v3/properties/${objectType}/${propName}`, {
            method: "DELETE",
          });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 7. Manage Property Groups ──
  {
    name: "hubspot_crm_manage_property_groups",
    description:
      "List, get, create, update, or archive property groups in HubSpot",
    schema: s.managePropertyGroupsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const objectType = a.object_type as string;
      const groupName = a.group_name as string | undefined;

      switch (op) {
        case "list":
          return api(c, `/crm/v3/properties/${objectType}/groups`);
        case "get":
          return api(
            c,
            `/crm/v3/properties/${objectType}/groups/${groupName}`
          );
        case "create": {
          const body: Record<string, unknown> = {
            name: a.name,
            label: a.label,
          };
          if (a.display_order !== undefined) body.displayOrder = a.display_order;
          return api(c, `/crm/v3/properties/${objectType}/groups`, {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          if (a.label !== undefined) body.label = a.label;
          if (a.display_order !== undefined) body.displayOrder = a.display_order;
          return api(
            c,
            `/crm/v3/properties/${objectType}/groups/${groupName}`,
            {
              method: "PATCH",
              body: JSON.stringify(body),
            }
          );
        }
        case "archive":
          return api(
            c,
            `/crm/v3/properties/${objectType}/groups/${groupName}`,
            { method: "DELETE" }
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 8. Manage Schemas ──
  {
    name: "hubspot_crm_manage_schemas",
    description:
      "List, get, create, update, or archive custom object schemas in HubSpot",
    schema: s.manageSchemasSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const objectType = a.object_type as string | undefined;

      switch (op) {
        case "list":
          return api(c, "/crm/v3/schemas");
        case "get":
          return api(c, `/crm/v3/schemas/${objectType}`);
        case "create": {
          const body: Record<string, unknown> = { name: a.name };
          const labels = parseJson(a.labels as string | undefined);
          if (labels) body.labels = labels;
          const properties = parseJson(a.properties as string | undefined);
          if (properties) body.properties = properties;
          const requiredProperties = parseJson(
            a.required_properties as string | undefined
          );
          if (requiredProperties) body.requiredProperties = requiredProperties;
          if (a.primary_display_property)
            body.primaryDisplayProperty = a.primary_display_property;
          const secondaryDisplayProperties = parseJson(
            a.secondary_display_properties as string | undefined
          );
          if (secondaryDisplayProperties)
            body.secondaryDisplayProperties = secondaryDisplayProperties;
          return api(c, "/crm/v3/schemas", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          const labels = parseJson(a.labels as string | undefined);
          if (labels) body.labels = labels;
          const requiredProperties = parseJson(
            a.required_properties as string | undefined
          );
          if (requiredProperties) body.requiredProperties = requiredProperties;
          if (a.primary_display_property)
            body.primaryDisplayProperty = a.primary_display_property;
          const secondaryDisplayProperties = parseJson(
            a.secondary_display_properties as string | undefined
          );
          if (secondaryDisplayProperties)
            body.secondaryDisplayProperties = secondaryDisplayProperties;
          return api(c, `/crm/v3/schemas/${objectType}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        }
        case "archive":
          return api(c, `/crm/v3/schemas/${objectType}`, {
            method: "DELETE",
          });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 9. Get Object Schema ──
  {
    name: "hubspot_crm_get_object_schema",
    description:
      "Get the full schema definition for a specific CRM object type in HubSpot",
    schema: s.getObjectSchemaSchema,
    execute: async (a, c) => {
      const objectType = a.object_type as string;
      return api(c, `/crm/v3/schemas/${objectType}`);
    },
  },

  // ── 10. Manage Pipelines ──
  {
    name: "hubspot_crm_manage_pipelines",
    description:
      "List, get, create, update, or archive pipelines for deals or tickets in HubSpot",
    schema: s.managePipelinesSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const objectType = a.object_type as string;
      const pipelineId = a.pipeline_id as string | undefined;

      switch (op) {
        case "list":
          return api(c, `/crm/v3/pipelines/${objectType}`);
        case "get":
          return api(c, `/crm/v3/pipelines/${objectType}/${pipelineId}`);
        case "create": {
          const body: Record<string, unknown> = { label: a.label };
          if (a.display_order !== undefined) body.displayOrder = a.display_order;
          const stages = parseJson(a.stages as string | undefined);
          if (stages) body.stages = stages;
          return api(c, `/crm/v3/pipelines/${objectType}`, {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          if (a.label !== undefined) body.label = a.label;
          if (a.display_order !== undefined) body.displayOrder = a.display_order;
          const stages = parseJson(a.stages as string | undefined);
          if (stages) body.stages = stages;
          return api(c, `/crm/v3/pipelines/${objectType}/${pipelineId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        }
        case "archive":
          return api(c, `/crm/v3/pipelines/${objectType}/${pipelineId}`, {
            method: "DELETE",
          });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 11. Manage Pipeline Stages ──
  {
    name: "hubspot_crm_manage_pipeline_stages",
    description:
      "List, get, create, update, or archive pipeline stages in HubSpot",
    schema: s.managePipelineStagesSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const objectType = a.object_type as string;
      const pipelineId = a.pipeline_id as string;
      const stageId = a.stage_id as string | undefined;

      switch (op) {
        case "list":
          return api(
            c,
            `/crm/v3/pipelines/${objectType}/${pipelineId}/stages`
          );
        case "get":
          return api(
            c,
            `/crm/v3/pipelines/${objectType}/${pipelineId}/stages/${stageId}`
          );
        case "create": {
          const body: Record<string, unknown> = { label: a.label };
          if (a.display_order !== undefined) body.displayOrder = a.display_order;
          const metadata = parseJson(a.metadata as string | undefined);
          if (metadata) body.metadata = metadata;
          return api(
            c,
            `/crm/v3/pipelines/${objectType}/${pipelineId}/stages`,
            {
              method: "POST",
              body: JSON.stringify(body),
            }
          );
        }
        case "update": {
          const body: Record<string, unknown> = {};
          if (a.label !== undefined) body.label = a.label;
          if (a.display_order !== undefined) body.displayOrder = a.display_order;
          const metadata = parseJson(a.metadata as string | undefined);
          if (metadata) body.metadata = metadata;
          return api(
            c,
            `/crm/v3/pipelines/${objectType}/${pipelineId}/stages/${stageId}`,
            {
              method: "PATCH",
              body: JSON.stringify(body),
            }
          );
        }
        case "archive":
          return api(
            c,
            `/crm/v3/pipelines/${objectType}/${pipelineId}/stages/${stageId}`,
            { method: "DELETE" }
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 12. Manage Owners ──
  {
    name: "hubspot_crm_manage_owners",
    description: "List all owners or get a specific owner in HubSpot",
    schema: s.manageOwnersSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      switch (op) {
        case "list":
          return api(
            c,
            `/crm/v3/owners${qs({
              limit: a.limit,
              after: a.after,
              email: a.email,
            })}`
          );
        case "get":
          return api(c, `/crm/v3/owners/${a.owner_id}`);
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 13. Manage Users ──
  {
    name: "hubspot_crm_manage_users",
    description: "List all users or get a specific user in HubSpot",
    schema: s.manageUsersSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      switch (op) {
        case "list":
          return api(
            c,
            `/settings/v3/users${qs({ limit: a.limit, after: a.after })}`
          );
        case "get":
          return api(c, `/settings/v3/users/${a.user_id}`);
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 14. Manage Lists ──
  {
    name: "hubspot_crm_manage_lists",
    description:
      "Get, create, update, delete, search lists, or add/remove list members in HubSpot",
    schema: s.manageListsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const listId = a.list_id as string | undefined;

      switch (op) {
        case "get":
          return api(c, `/crm/v3/lists/${listId}`);
        case "create": {
          const body: Record<string, unknown> = {
            name: a.name,
            objectTypeId: a.object_type_id,
            processingType: a.processing_type,
          };
          const filterBranch = parseJson(
            a.filter_branch as string | undefined
          );
          if (filterBranch) body.filterBranch = filterBranch;
          return api(c, "/crm/v3/lists", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          if (a.name) body.name = a.name;
          const filterBranch = parseJson(
            a.filter_branch as string | undefined
          );
          if (filterBranch) body.filterBranch = filterBranch;
          return api(c, `/crm/v3/lists/${listId}`, {
            method: "PUT",
            body: JSON.stringify(body),
          });
        }
        case "delete":
          return api(c, `/crm/v3/lists/${listId}`, { method: "DELETE" });
        case "search":
          return api(c, "/crm/v3/lists/search", {
            method: "POST",
            body: JSON.stringify({
              query: a.query,
              limit: a.limit,
              after: a.after,
            }),
          });
        case "add_members": {
          const recordIds = parseJson(a.record_ids as string);
          return api(c, `/crm/v3/lists/${listId}/memberships/add`, {
            method: "PUT",
            body: JSON.stringify(recordIds),
          });
        }
        case "remove_members": {
          const recordIds = parseJson(a.record_ids as string);
          return api(c, `/crm/v3/lists/${listId}/memberships/remove`, {
            method: "PUT",
            body: JSON.stringify(recordIds),
          });
        }
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 15. Manage Imports ──
  {
    name: "hubspot_crm_manage_imports",
    description:
      "Start, get status, or cancel CRM data imports in HubSpot",
    schema: s.manageImportsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const importId = a.import_id as string | undefined;

      switch (op) {
        case "start": {
          const files = parseJson(a.files as string | undefined);
          return api(c, "/crm/v3/imports", {
            method: "POST",
            body: JSON.stringify({
              name: a.import_name,
              files,
            }),
          });
        }
        case "get":
          return api(c, `/crm/v3/imports/${importId}`);
        case "cancel":
          return api(c, `/crm/v3/imports/${importId}/cancel`, {
            method: "POST",
          });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 16. Manage Exports ──
  {
    name: "hubspot_crm_manage_exports",
    description: "Start or get status of CRM data exports in HubSpot",
    schema: s.manageExportsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "start": {
          const properties = parseJson(a.properties as string | undefined);
          const filter = parseJson(a.filter as string | undefined);
          const body: Record<string, unknown> = {
            exportType: a.object_type,
          };
          if (properties) body.properties = properties;
          if (filter) body.filter = filter;
          return api(c, "/crm/v3/exports/export/async", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "get":
          return api(
            c,
            `/crm/v3/exports/export/async/tasks/${a.export_id}/status`
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 17. Manage Deal Splits ──
  {
    name: "hubspot_crm_manage_deal_splits",
    description: "Get or set deal splits for a deal in HubSpot",
    schema: s.manageDealSplitsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const dealId = a.deal_id as string;

      switch (op) {
        case "get":
          return api(c, `/crm/v3/objects/deals/${dealId}/splits`);
        case "set": {
          const splits = parseJson(a.splits as string);
          return api(c, `/crm/v3/objects/deals/${dealId}/splits`, {
            method: "PUT",
            body: JSON.stringify(splits),
          });
        }
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 18. Manage Calling Transcripts ──
  {
    name: "hubspot_crm_manage_calling_transcripts",
    description:
      "List calls or get a specific call with transcript in HubSpot",
    schema: s.manageCallingTranscriptsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list":
          return api(
            c,
            `/crm/v3/objects/calls${qs({
              limit: a.limit,
              after: a.after,
              properties: "hs_transcript",
            })}`
          );
        case "get":
          return api(
            c,
            `/crm/v3/objects/calls/${a.transcript_id}${qs({
              properties: "hs_transcript",
            })}`
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 19. Manage Marketing Events ──
  {
    name: "hubspot_crm_manage_marketing_events",
    description:
      "Get, create, update, delete, or list marketing events in HubSpot",
    schema: s.manageMarketingEventsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const eventId = a.event_id as string | undefined;

      switch (op) {
        case "list":
          return api(
            c,
            `/marketing/v3/marketing-events/events${qs({
              limit: a.limit,
              after: a.after,
            })}`
          );
        case "get":
          return api(
            c,
            `/marketing/v3/marketing-events/events/${eventId}`
          );
        case "create": {
          const body: Record<string, unknown> = {};
          if (a.event_name) body.eventName = a.event_name;
          if (a.event_type) body.eventType = a.event_type;
          if (a.start_date_time) body.startDateTime = a.start_date_time;
          if (a.end_date_time) body.endDateTime = a.end_date_time;
          if (a.event_organizer) body.eventOrganizer = a.event_organizer;
          if (a.event_description) body.eventDescription = a.event_description;
          const customProperties = parseJson(
            a.custom_properties as string | undefined
          );
          if (customProperties) body.customProperties = customProperties;
          return api(c, "/marketing/v3/marketing-events/events", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          if (a.event_name) body.eventName = a.event_name;
          if (a.event_type) body.eventType = a.event_type;
          if (a.start_date_time) body.startDateTime = a.start_date_time;
          if (a.end_date_time) body.endDateTime = a.end_date_time;
          if (a.event_organizer) body.eventOrganizer = a.event_organizer;
          if (a.event_description) body.eventDescription = a.event_description;
          const customProperties = parseJson(
            a.custom_properties as string | undefined
          );
          if (customProperties) body.customProperties = customProperties;
          return api(
            c,
            `/marketing/v3/marketing-events/events/${eventId}`,
            {
              method: "PATCH",
              body: JSON.stringify(body),
            }
          );
        }
        case "delete":
          return api(
            c,
            `/marketing/v3/marketing-events/events/${eventId}`,
            { method: "DELETE" }
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 20. Manage Feedback Submissions ──
  {
    name: "hubspot_crm_manage_feedback_submissions",
    description:
      "List or get feedback submissions in HubSpot",
    schema: s.manageFeedbackSubmissionsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list":
          return api(
            c,
            `/crm/v3/objects/feedback_submissions${qs({
              limit: a.limit,
              after: a.after,
            })}`
          );
        case "get":
          return api(
            c,
            `/crm/v3/objects/feedback_submissions/${a.submission_id}`
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 21. Manage Forecasts ──
  {
    name: "hubspot_crm_manage_forecasts",
    description: "Get forecast data for deals or revenue in HubSpot",
    schema: s.manageForecastsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "get":
          return api(
            c,
            `/crm/v3/forecasts${qs({
              forecastType: a.forecast_type,
              periodYear: a.period_year,
              periodMonth: a.period_month,
              pipelineId: a.pipeline_id,
              userId: a.user_id,
            })}`
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },
];
