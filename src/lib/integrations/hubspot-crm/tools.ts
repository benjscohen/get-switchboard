import type { IntegrationToolDef } from "../types";
import { flexParse } from "../shared/json-params";
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

/** Return a copy of obj with only defined (non-null/undefined) values */
function pickDefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
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
            properties: flexParse(a.properties) ?? {},
          };
          const associations = flexParse(a.associations);
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
              properties: flexParse(a.properties) ?? {},
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
      const filterGroups = flexParse(a.filter_groups);
      if (filterGroups) body.filterGroups = filterGroups;
      const sorts = flexParse(a.sorts);
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
      const inputs = flexParse(a.inputs);
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
          const options = flexParse(a.options);
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
          const options = flexParse(a.options);
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
          const labels = flexParse(a.labels);
          if (labels) body.labels = labels;
          const properties = flexParse(a.properties);
          if (properties) body.properties = properties;
          const requiredProperties = flexParse(a.required_properties);
          if (requiredProperties) body.requiredProperties = requiredProperties;
          if (a.primary_display_property)
            body.primaryDisplayProperty = a.primary_display_property;
          const secondaryDisplayProperties = flexParse(a.secondary_display_properties);
          if (secondaryDisplayProperties)
            body.secondaryDisplayProperties = secondaryDisplayProperties;
          return api(c, "/crm/v3/schemas", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body: Record<string, unknown> = {};
          const labels = flexParse(a.labels);
          if (labels) body.labels = labels;
          const requiredProperties = flexParse(a.required_properties);
          if (requiredProperties) body.requiredProperties = requiredProperties;
          if (a.primary_display_property)
            body.primaryDisplayProperty = a.primary_display_property;
          const secondaryDisplayProperties = flexParse(a.secondary_display_properties);
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
          const stages = flexParse(a.stages);
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
          const stages = flexParse(a.stages);
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
          const metadata = flexParse(a.metadata);
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
          const metadata = flexParse(a.metadata);
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
          const filterBranch = flexParse(a.filter_branch);
          if (filterBranch) body.filterBranch = filterBranch;
          return api(c, "/crm/v3/lists", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          // Bug 4 fix: HubSpot has separate endpoints for name vs filters
          const filterBranch = flexParse(a.filter_branch);
          const results: unknown[] = [];
          if (a.name) {
            results.push(
              await api(c, `/crm/v3/lists/${listId}/update-list-name${qs({ listName: a.name })}`, {
                method: "PUT",
              })
            );
          }
          if (filterBranch) {
            results.push(
              await api(c, `/crm/v3/lists/${listId}/update-list-filters`, {
                method: "PUT",
                body: JSON.stringify({ filterBranch }),
              })
            );
          }
          return results.length === 1 ? results[0] : { results };
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
          const recordIds = flexParse(a.record_ids);
          return api(c, `/crm/v3/lists/${listId}/memberships/add`, {
            method: "PUT",
            body: JSON.stringify(recordIds),
          });
        }
        case "remove_members": {
          const recordIds = flexParse(a.record_ids);
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
          const files = flexParse(a.files);
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
          // Bug 5 fix: correct field mapping for HubSpot export API
          const body = pickDefined({
            exportType: a.export_type,
            format: a.format ?? "CSV",
            objectType: a.object_type,
            objectProperties: flexParse(a.object_properties),
            publicCrmSearchRequest: flexParse(a.public_crm_search_request),
            listId: a.list_id,
          });
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
        // Bug 2 fix: use batch endpoints instead of non-existent per-deal REST endpoints
        case "get":
          return api(c, "/crm/v3/objects/deals/splits/batch/read", {
            method: "POST",
            body: JSON.stringify({ inputs: [{ id: dealId }] }),
          });
        case "set": {
          const splits = flexParse(a.splits);
          return api(c, "/crm/v3/objects/deals/splits/batch/upsert", {
            method: "POST",
            body: JSON.stringify({ inputs: [{ id: dealId, splits }] }),
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
        // Bug 3 fix: remove extra /events segment from list/get/update/delete
        case "list":
          return api(
            c,
            `/marketing/v3/marketing-events${qs({
              limit: a.limit,
              after: a.after,
            })}`
          );
        case "get":
          return api(c, `/marketing/v3/marketing-events/${eventId}`);
        case "create": {
          const body = pickDefined({
            externalEventId: a.external_event_id,
            externalAccountId: a.external_account_id,
            eventName: a.event_name,
            eventType: a.event_type,
            startDateTime: a.start_date_time,
            endDateTime: a.end_date_time,
            eventOrganizer: a.event_organizer,
            eventDescription: a.event_description,
            customProperties: flexParse(a.custom_properties),
          });
          return api(c, "/marketing/v3/marketing-events/events", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        case "update": {
          const body = pickDefined({
            eventName: a.event_name,
            eventType: a.event_type,
            startDateTime: a.start_date_time,
            endDateTime: a.end_date_time,
            eventOrganizer: a.event_organizer,
            eventDescription: a.event_description,
            customProperties: flexParse(a.custom_properties),
          });
          return api(c, `/marketing/v3/marketing-events/${eventId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        }
        case "delete":
          return api(c, `/marketing/v3/marketing-events/${eventId}`, {
            method: "DELETE",
          });
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

  // ── 22. Manage Campaigns ──
  {
    name: "hubspot_crm_manage_campaigns",
    description:
      "List or get marketing campaigns in HubSpot",
    schema: s.manageCampaignsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const campaignId = a.campaign_id as string | undefined;

      switch (op) {
        case "list":
          return api(
            c,
            `/marketing/v3/campaigns${qs({
              limit: a.limit,
              after: a.after,
            })}`
          );
        // Bug 6 fix: removed get_revenue (non-existent endpoint), added properties to get
        case "get":
          return api(
            c,
            `/marketing/v3/campaigns/${campaignId}${qs({ properties: a.properties })}`
          );
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },

  // ── 23. Manage Sequences ──
  {
    name: "hubspot_crm_manage_sequences",
    description:
      "List, get, or enroll contacts in automation sequences in HubSpot",
    schema: s.manageSequencesSchema,
    execute: async (a, c) => {
      const op = a.operation as string;
      const sequenceId = a.sequence_id as string | undefined;

      switch (op) {
        // Bug 1 fix: v3 -> v4, add required userId query param
        case "list":
          return api(
            c,
            `/automation/v4/sequences${qs({
              limit: a.limit,
              after: a.after,
              userId: a.user_id,
            })}`
          );
        case "get":
          return api(
            c,
            `/automation/v4/sequences/${sequenceId}${qs({ userId: a.user_id })}`
          );
        case "enroll":
          return api(c, "/automation/v4/sequences/enrollments/", {
            method: "POST",
            body: JSON.stringify(pickDefined({
              sequenceId: a.sequence_id,
              contactId: a.contact_id,
              senderEmail: a.sender_email,
            })),
          });
        default:
          throw new Error(`Unknown operation: ${op}`);
      }
    },
  },
];
