import type { IntegrationToolDef } from "../types";
import * as s from "./schemas";

// ── Client type ──

export type AsanaClient = {
  accessToken: string;
  baseUrl: string;
};

// ── Helpers ──

async function api(
  client: AsanaClient,
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
    throw new Error(`Asana API ${res.status}: ${text}`);
  }
  // 204 No Content (for DELETEs)
  if (res.status === 204) return { success: true };
  return res.json();
}

/** Extract .data from an Asana response */
function unwrap(body: unknown): unknown {
  if (body && typeof body === "object" && "data" in body) {
    return (body as Record<string, unknown>).data;
  }
  return body;
}

/** Extract .data + pagination from list responses */
function paginated(body: unknown): unknown {
  const raw = body as Record<string, unknown>;
  const nextPage = raw?.next_page as
    | { offset: string }
    | null
    | undefined;
  return {
    items: raw?.data ?? [],
    next_offset: nextPage?.offset ?? null,
  };
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

/** Split comma-separated GIDs into an array */
function splitGids(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse optional JSON custom_fields string into an object */
function parseCustomFields(
  raw: string | undefined
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("custom_fields must be a valid JSON object string");
  }
}

// ── Typed tool def ──

type AsanaToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    client: AsanaClient
  ) => Promise<unknown>;
};

// ── Tool implementations ──

export const ASANA_TOOLS: AsanaToolDef[] = [
  // ── Task tools (7) ──
  {
    name: "asana_search_tasks",
    description:
      "Search tasks in a workspace with filters for assignee, project, dates, completion status, and text",
    schema: s.searchTasksSchema,
    execute: async (a, c) => {
      const workspace = a.workspace as string;
      const params: Record<string, unknown> = {
        text: a.text,
        "assignee.any": a.assignee,
        "projects.any": a.project,
        "sections.any": a.section,
        completed: a.completed,
        modified_since: a.modified_since,
        "due_on": a.due_on,
        "due_on.before": a["due_on.before"],
        "due_on.after": a["due_on.after"],
        sort_by: a.sort_by,
        sort_ascending: a.sort_ascending,
        opt_fields: a.opt_fields ?? "name,assignee.name,due_on,completed,projects.name",
        limit: a.limit,
        offset: a.offset,
      };
      return paginated(await api(c, `/workspaces/${workspace}/tasks/search${qs(params)}`));
    },
  },
  {
    name: "asana_get_task",
    description:
      "Get full task details including description, assignee, dates, projects, tags, custom fields, and subtask count",
    schema: s.getTaskSchema,
    execute: async (a, c) => {
      const gid = a.task_gid as string;
      const fields =
        (a.opt_fields as string) ??
        "name,notes,assignee.name,due_on,due_at,start_on,start_at,completed,completed_at,projects.name,tags.name,custom_fields,num_subtasks,parent.name,followers.name,permalink_url,created_at,modified_at";
      return unwrap(await api(c, `/tasks/${gid}${qs({ opt_fields: fields })}`));
    },
  },
  {
    name: "asana_create_task",
    description:
      "Create a new task with name, description, assignee, dates, project, tags, parent, and custom fields",
    schema: s.createTaskSchema,
    execute: async (a, c) => {
      const data: Record<string, unknown> = {
        workspace: a.workspace as string,
        name: a.name as string,
        notes: a.notes,
        html_notes: a.html_notes,
        assignee: a.assignee,
        due_on: a.due_on,
        due_at: a.due_at,
        start_on: a.start_on,
        start_at: a.start_at,
        parent: a.parent,
      };
      if (a.projects) data.projects = splitGids(a.projects as string);
      if (a.tags) data.tags = splitGids(a.tags as string);
      if (a.followers) data.followers = splitGids(a.followers as string);
      const cf = parseCustomFields(a.custom_fields as string | undefined);
      if (cf) data.custom_fields = cf;
      return unwrap(
        await api(c, "/tasks", {
          method: "POST",
          body: JSON.stringify({ data }),
        })
      );
    },
  },
  {
    name: "asana_update_task",
    description:
      "Update a task's name, description, assignee, dates, completion status, or custom fields",
    schema: s.updateTaskSchema,
    execute: async (a, c) => {
      const gid = a.task_gid as string;
      const data: Record<string, unknown> = {};
      for (const key of [
        "name",
        "notes",
        "html_notes",
        "assignee",
        "due_on",
        "due_at",
        "start_on",
        "start_at",
        "completed",
      ] as const) {
        if (a[key] !== undefined) {
          data[key] = a[key] === "null" ? null : a[key];
        }
      }
      const cf = parseCustomFields(a.custom_fields as string | undefined);
      if (cf) data.custom_fields = cf;
      return unwrap(
        await api(c, `/tasks/${gid}`, {
          method: "PUT",
          body: JSON.stringify({ data }),
        })
      );
    },
  },
  {
    name: "asana_manage_task_relations",
    description:
      "Manage task relationships: add/remove from projects, set section, add/remove tags, set parent, add followers",
    schema: s.manageTaskRelationsSchema,
    execute: async (a, c) => {
      const gid = a.task_gid as string;
      const op = a.operation as string;

      switch (op) {
        case "add_project":
          return unwrap(
            await api(c, `/tasks/${gid}/addProject`, {
              method: "POST",
              body: JSON.stringify({
                data: {
                  project: a.project_gid as string,
                  section: a.section_gid,
                },
              }),
            })
          );
        case "remove_project":
          return unwrap(
            await api(c, `/tasks/${gid}/removeProject`, {
              method: "POST",
              body: JSON.stringify({
                data: { project: a.project_gid as string },
              }),
            })
          );
        case "set_section": {
          const section = a.section_gid as string;
          return unwrap(
            await api(c, `/sections/${section}/addTask`, {
              method: "POST",
              body: JSON.stringify({ data: { task: gid } }),
            })
          );
        }
        case "add_tag":
          return unwrap(
            await api(c, `/tasks/${gid}/addTag`, {
              method: "POST",
              body: JSON.stringify({
                data: { tag: a.tag_gid as string },
              }),
            })
          );
        case "remove_tag":
          return unwrap(
            await api(c, `/tasks/${gid}/removeTag`, {
              method: "POST",
              body: JSON.stringify({
                data: { tag: a.tag_gid as string },
              }),
            })
          );
        case "set_parent":
          return unwrap(
            await api(c, `/tasks/${gid}/setParent`, {
              method: "POST",
              body: JSON.stringify({
                data: {
                  parent: a.parent_gid === "null" ? null : a.parent_gid,
                },
              }),
            })
          );
        case "add_followers":
          return unwrap(
            await api(c, `/tasks/${gid}/addFollowers`, {
              method: "POST",
              body: JSON.stringify({
                data: {
                  followers: splitGids(a.followers as string),
                },
              }),
            })
          );
        default:
          return { error: `Unknown task relation operation: ${op}` };
      }
    },
  },
  {
    name: "asana_manage_task_dependencies",
    description:
      "Manage task dependencies and dependents: add or remove blocking/blocked-by relationships",
    schema: s.manageTaskDependenciesSchema,
    execute: async (a, c) => {
      const gid = a.task_gid as string;
      const op = a.operation as string;
      const targets = splitGids(a.targets as string);

      const endpointMap: Record<string, { path: string; field: string }> = {
        add_dependencies: {
          path: `/tasks/${gid}/addDependencies`,
          field: "dependencies",
        },
        remove_dependencies: {
          path: `/tasks/${gid}/removeDependencies`,
          field: "dependencies",
        },
        add_dependents: {
          path: `/tasks/${gid}/addDependents`,
          field: "dependents",
        },
        remove_dependents: {
          path: `/tasks/${gid}/removeDependents`,
          field: "dependents",
        },
      };

      const endpoint = endpointMap[op];
      if (!endpoint) return { error: `Unknown dependency operation: ${op}` };

      return unwrap(
        await api(c, endpoint.path, {
          method: "POST",
          body: JSON.stringify({
            data: { [endpoint.field]: targets },
          }),
        })
      );
    },
  },
  {
    name: "asana_manage_subtasks",
    description:
      "List, create, or reorder subtasks for a parent task",
    schema: s.manageSubtasksSchema,
    execute: async (a, c) => {
      const gid = a.task_gid as string;
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const params: Record<string, unknown> = {
            opt_fields:
              (a.opt_fields as string) ?? "name,assignee.name,due_on,completed",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(await api(c, `/tasks/${gid}/subtasks${qs(params)}`));
        }
        case "create": {
          const data: Record<string, unknown> = {
            name: a.name as string,
            notes: a.notes,
            assignee: a.assignee,
            due_on: a.due_on,
          };
          return unwrap(
            await api(c, `/tasks/${gid}/subtasks`, {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "reorder": {
          const subtaskGid = a.subtask_gid as string;
          const data: Record<string, unknown> = {};
          if (a.insert_before) data.insert_before = a.insert_before;
          if (a.insert_after) data.insert_after = a.insert_after;
          return unwrap(
            await api(c, `/tasks/${subtaskGid}/setParent`, {
              method: "POST",
              body: JSON.stringify({
                data: { parent: gid, ...data },
              }),
            })
          );
        }
        default:
          return { error: `Unknown subtask operation: ${op}` };
      }
    },
  },

  // ── Organization tools (4) ──
  {
    name: "asana_manage_projects",
    description:
      "List, get, create, update, delete, or get task counts for projects",
    schema: s.manageProjectsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const params: Record<string, unknown> = {
            workspace: a.workspace as string,
            opt_fields:
              (a.opt_fields as string) ??
              "name,color,archived,due_on,current_status_update.title",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(await api(c, `/projects${qs(params)}`));
        }
        case "get": {
          const gid = a.project_gid as string;
          const fields =
            (a.opt_fields as string) ??
            "name,notes,color,archived,due_on,start_on,owner.name,team.name,members.name,permalink_url,created_at,modified_at";
          return unwrap(
            await api(c, `/projects/${gid}${qs({ opt_fields: fields })}`)
          );
        }
        case "create": {
          const data: Record<string, unknown> = {
            workspace: a.workspace as string,
            name: a.name as string,
            notes: a.notes,
            color: a.color,
            default_view: a.layout,
            due_on: a.due_on,
            start_on: a.start_on,
            team: a.team,
            public: a.public,
          };
          return unwrap(
            await api(c, "/projects", {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "update": {
          const gid = a.project_gid as string;
          const data: Record<string, unknown> = {};
          for (const key of [
            "name",
            "notes",
            "color",
            "due_on",
            "start_on",
            "archived",
            "public",
          ] as const) {
            if (a[key] !== undefined) data[key] = a[key];
          }
          return unwrap(
            await api(c, `/projects/${gid}`, {
              method: "PUT",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "delete": {
          const gid = a.project_gid as string;
          return api(c, `/projects/${gid}`, { method: "DELETE" });
        }
        case "task_counts": {
          const gid = a.project_gid as string;
          return unwrap(await api(c, `/projects/${gid}/task_counts`));
        }
        default:
          return { error: `Unknown project operation: ${op}` };
      }
    },
  },
  {
    name: "asana_manage_sections",
    description:
      "List, create, update, delete, or reorder sections in a project",
    schema: s.manageSectionsSchema,
    execute: async (a, c) => {
      const projGid = a.project_gid as string;
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const params: Record<string, unknown> = {
            opt_fields: (a.opt_fields as string) ?? "name,created_at",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(
            await api(c, `/projects/${projGid}/sections${qs(params)}`)
          );
        }
        case "create":
          return unwrap(
            await api(c, `/projects/${projGid}/sections`, {
              method: "POST",
              body: JSON.stringify({
                data: { name: a.name as string },
              }),
            })
          );
        case "update": {
          const secGid = a.section_gid as string;
          return unwrap(
            await api(c, `/sections/${secGid}`, {
              method: "PUT",
              body: JSON.stringify({
                data: { name: a.name as string },
              }),
            })
          );
        }
        case "delete": {
          const secGid = a.section_gid as string;
          return api(c, `/sections/${secGid}`, { method: "DELETE" });
        }
        case "reorder": {
          const secGid = a.section_gid as string;
          const data: Record<string, unknown> = {};
          if (a.before_section) data.before_section = a.before_section;
          if (a.after_section) data.after_section = a.after_section;
          return unwrap(
            await api(c, `/projects/${projGid}/sections/insert`, {
              method: "POST",
              body: JSON.stringify({
                data: { section: secGid, ...data },
              }),
            })
          );
        }
        default:
          return { error: `Unknown section operation: ${op}` };
      }
    },
  },
  {
    name: "asana_manage_stories",
    description:
      "List, create, update, or delete comments (stories) on a task",
    schema: s.manageStoriesSchema,
    execute: async (a, c) => {
      const taskGid = a.task_gid as string;
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const params: Record<string, unknown> = {
            opt_fields:
              (a.opt_fields as string) ??
              "text,created_by.name,created_at,type",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(
            await api(c, `/tasks/${taskGid}/stories${qs(params)}`)
          );
        }
        case "create":
          return unwrap(
            await api(c, `/tasks/${taskGid}/stories`, {
              method: "POST",
              body: JSON.stringify({
                data: { text: a.text as string },
              }),
            })
          );
        case "update": {
          const storyGid = a.story_gid as string;
          return unwrap(
            await api(c, `/stories/${storyGid}`, {
              method: "PUT",
              body: JSON.stringify({
                data: { text: a.text as string },
              }),
            })
          );
        }
        case "delete": {
          const storyGid = a.story_gid as string;
          return api(c, `/stories/${storyGid}`, { method: "DELETE" });
        }
        default:
          return { error: `Unknown story operation: ${op}` };
      }
    },
  },
  {
    name: "asana_manage_goals",
    description:
      "List, get, create, update, or update metric for goals",
    schema: s.manageGoalsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const params: Record<string, unknown> = {
            workspace: a.workspace as string,
            team: a.team,
            time_period: a.time_period,
            opt_fields:
              (a.opt_fields as string) ??
              "name,owner.name,due_on,status,current_status_update.title",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(await api(c, `/goals${qs(params)}`));
        }
        case "get": {
          const gid = a.goal_gid as string;
          const fields =
            (a.opt_fields as string) ??
            "name,notes,owner.name,due_on,start_on,status,metric,team.name,workspace.name,followers.name";
          return unwrap(
            await api(c, `/goals/${gid}${qs({ opt_fields: fields })}`)
          );
        }
        case "create": {
          const data: Record<string, unknown> = {
            workspace: a.workspace as string,
            name: a.name as string,
            notes: a.notes,
            due_on: a.due_on,
            start_on: a.start_on,
            team: a.team,
            time_period: a.time_period,
          };
          return unwrap(
            await api(c, "/goals", {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "update": {
          const gid = a.goal_gid as string;
          const data: Record<string, unknown> = {};
          for (const key of [
            "name",
            "notes",
            "due_on",
            "start_on",
            "status",
          ] as const) {
            if (a[key] !== undefined) data[key] = a[key];
          }
          return unwrap(
            await api(c, `/goals/${gid}`, {
              method: "PUT",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "update_metric": {
          const gid = a.goal_gid as string;
          const data: Record<string, unknown> = {};
          if (a.current_number_value !== undefined)
            data.current_number_value = a.current_number_value;
          if (a.target_number_value !== undefined)
            data.target_number_value = a.target_number_value;
          return unwrap(
            await api(c, `/goals/${gid}/setMetricCurrentValue`, {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        default:
          return { error: `Unknown goal operation: ${op}` };
      }
    },
  },

  // ── Utility tools (2) ──
  {
    name: "asana_manage_tags",
    description:
      "List, get, create, or update tags in a workspace",
    schema: s.manageTagsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const params: Record<string, unknown> = {
            workspace: a.workspace as string,
            opt_fields: (a.opt_fields as string) ?? "name,color",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(await api(c, `/tags${qs(params)}`));
        }
        case "get": {
          const gid = a.tag_gid as string;
          const fields =
            (a.opt_fields as string) ?? "name,color,notes,permalink_url";
          return unwrap(await api(c, `/tags/${gid}${qs({ opt_fields: fields })}`));
        }
        case "create": {
          const data: Record<string, unknown> = {
            workspace: a.workspace as string,
            name: a.name as string,
            color: a.color,
          };
          return unwrap(
            await api(c, "/tags", {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "update": {
          const gid = a.tag_gid as string;
          const data: Record<string, unknown> = {};
          if (a.name !== undefined) data.name = a.name;
          if (a.color !== undefined) data.color = a.color;
          return unwrap(
            await api(c, `/tags/${gid}`, {
              method: "PUT",
              body: JSON.stringify({ data }),
            })
          );
        }
        default:
          return { error: `Unknown tag operation: ${op}` };
      }
    },
  },
  {
    name: "asana_get_context",
    description:
      "Discover workspaces, teams, users, and projects — useful for finding GIDs needed by other tools",
    schema: s.getContextSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list_workspaces": {
          const params: Record<string, unknown> = {
            opt_fields: (a.opt_fields as string) ?? "name,is_organization",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(await api(c, `/workspaces${qs(params)}`));
        }
        case "list_teams": {
          const workspace = a.workspace as string;
          const params: Record<string, unknown> = {
            opt_fields: (a.opt_fields as string) ?? "name",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(
            await api(c, `/organizations/${workspace}/teams${qs(params)}`)
          );
        }
        case "list_users": {
          const workspace = a.workspace as string;
          const params: Record<string, unknown> = {
            workspace,
            opt_fields: (a.opt_fields as string) ?? "name,email",
            limit: a.limit,
            offset: a.offset,
          };
          if (a.team_gid) {
            return paginated(
              await api(
                c,
                `/teams/${a.team_gid as string}/users${qs({ opt_fields: params.opt_fields, limit: params.limit, offset: params.offset })}`
              )
            );
          }
          return paginated(await api(c, `/users${qs(params)}`));
        }
        case "get_user": {
          const userGid = (a.user_gid as string) ?? "me";
          const fields =
            (a.opt_fields as string) ??
            "name,email,workspaces.name,photo.image_60x60";
          return unwrap(
            await api(c, `/users/${userGid}${qs({ opt_fields: fields })}`)
          );
        }
        case "list_projects": {
          const params: Record<string, unknown> = {
            workspace: a.workspace as string,
            opt_fields:
              (a.opt_fields as string) ?? "name,color,archived",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(await api(c, `/projects${qs(params)}`));
        }
        default:
          return { error: `Unknown context operation: ${op}` };
      }
    },
  },

  // ── v2 tools (4) ──
  {
    name: "asana_manage_custom_fields",
    description:
      "List, get, create, update, delete custom field definitions, or add enum options to an enum custom field",
    schema: s.manageCustomFieldsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const workspace = a.workspace as string;
          const params: Record<string, unknown> = {
            opt_fields:
              (a.opt_fields as string) ??
              "name,resource_subtype,type,enum_options.name",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(
            await api(c, `/workspaces/${workspace}/custom_fields${qs(params)}`)
          );
        }
        case "get": {
          const gid = a.custom_field_gid as string;
          const fields =
            (a.opt_fields as string) ??
            "name,description,resource_subtype,type,enum_options.name,enum_options.color,precision,is_global_to_workspace";
          return unwrap(
            await api(c, `/custom_fields/${gid}${qs({ opt_fields: fields })}`)
          );
        }
        case "create": {
          const data: Record<string, unknown> = {
            workspace: a.workspace as string,
            name: a.name as string,
            resource_subtype: a.resource_subtype as string,
            description: a.description,
          };
          return unwrap(
            await api(c, `/workspaces/${a.workspace as string}/custom_fields`, {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "update": {
          const gid = a.custom_field_gid as string;
          const data: Record<string, unknown> = {};
          if (a.name !== undefined) data.name = a.name;
          if (a.description !== undefined) data.description = a.description;
          return unwrap(
            await api(c, `/custom_fields/${gid}`, {
              method: "PUT",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "delete": {
          const gid = a.custom_field_gid as string;
          return api(c, `/custom_fields/${gid}`, { method: "DELETE" });
        }
        case "create_enum_option": {
          const gid = a.custom_field_gid as string;
          const data: Record<string, unknown> = {
            name: a.enum_option_name as string,
          };
          if (a.enum_option_color) data.color = a.enum_option_color;
          if (a.insert_before) data.insert_before = a.insert_before;
          if (a.insert_after) data.insert_after = a.insert_after;
          return unwrap(
            await api(c, `/custom_fields/${gid}/enum_options`, {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        default:
          return { error: `Unknown custom field operation: ${op}` };
      }
    },
  },
  {
    name: "asana_manage_portfolios",
    description:
      "List, get, create, update, delete portfolios, or manage portfolio items (add/remove projects)",
    schema: s.managePortfoliosSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const params: Record<string, unknown> = {
            workspace: a.workspace as string,
            owner: (a.owner as string) ?? "me",
            opt_fields:
              (a.opt_fields as string) ?? "name,color,owner.name",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(await api(c, `/portfolios${qs(params)}`));
        }
        case "get": {
          const gid = a.portfolio_gid as string;
          const fields =
            (a.opt_fields as string) ??
            "name,color,owner.name,members.name,due_on,start_on,permalink_url,created_at";
          return unwrap(
            await api(c, `/portfolios/${gid}${qs({ opt_fields: fields })}`)
          );
        }
        case "create": {
          const data: Record<string, unknown> = {
            workspace: a.workspace as string,
            name: a.name as string,
            color: a.color,
            public: a.public,
          };
          return unwrap(
            await api(c, "/portfolios", {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "update": {
          const gid = a.portfolio_gid as string;
          const data: Record<string, unknown> = {};
          for (const key of ["name", "color", "public"] as const) {
            if (a[key] !== undefined) data[key] = a[key];
          }
          return unwrap(
            await api(c, `/portfolios/${gid}`, {
              method: "PUT",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "delete": {
          const gid = a.portfolio_gid as string;
          return api(c, `/portfolios/${gid}`, { method: "DELETE" });
        }
        case "list_items": {
          const gid = a.portfolio_gid as string;
          const params: Record<string, unknown> = {
            opt_fields:
              (a.opt_fields as string) ?? "name,resource_type,color",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(
            await api(c, `/portfolios/${gid}/items${qs(params)}`)
          );
        }
        case "add_item": {
          const gid = a.portfolio_gid as string;
          return unwrap(
            await api(c, `/portfolios/${gid}/addItem`, {
              method: "POST",
              body: JSON.stringify({
                data: { item: a.item_gid as string },
              }),
            })
          );
        }
        case "remove_item": {
          const gid = a.portfolio_gid as string;
          return unwrap(
            await api(c, `/portfolios/${gid}/removeItem`, {
              method: "POST",
              body: JSON.stringify({
                data: { item: a.item_gid as string },
              }),
            })
          );
        }
        default:
          return { error: `Unknown portfolio operation: ${op}` };
      }
    },
  },
  {
    name: "asana_manage_attachments",
    description:
      "List task attachments, get attachment details (including download URL), create URL-based attachments, or delete attachments",
    schema: s.manageAttachmentsSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const taskGid = a.task_gid as string;
          const params: Record<string, unknown> = {
            opt_fields:
              (a.opt_fields as string) ?? "name,resource_type,created_at",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(
            await api(c, `/tasks/${taskGid}/attachments${qs(params)}`)
          );
        }
        case "get": {
          const gid = a.attachment_gid as string;
          const fields =
            (a.opt_fields as string) ??
            "name,download_url,host,view_url,resource_type,created_at,parent.name";
          return unwrap(
            await api(c, `/attachments/${gid}${qs({ opt_fields: fields })}`)
          );
        }
        case "create_url": {
          const taskGid = a.task_gid as string;
          const data: Record<string, unknown> = {
            resource_type: "task",
            resource_gid: taskGid,
            url: a.url as string,
            name: a.name as string,
          };
          return unwrap(
            await api(c, "/attachments", {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        case "delete": {
          const gid = a.attachment_gid as string;
          return api(c, `/attachments/${gid}`, { method: "DELETE" });
        }
        default:
          return { error: `Unknown attachment operation: ${op}` };
      }
    },
  },
  {
    name: "asana_manage_templates",
    description:
      "List project templates in a workspace, get template details, or instantiate a template into a new project",
    schema: s.manageTemplatesSchema,
    execute: async (a, c) => {
      const op = a.operation as string;

      switch (op) {
        case "list": {
          const params: Record<string, unknown> = {
            workspace: a.workspace as string,
            opt_fields: (a.opt_fields as string) ?? "name,description",
            limit: a.limit,
            offset: a.offset,
          };
          return paginated(
            await api(c, `/project_templates${qs(params)}`)
          );
        }
        case "get": {
          const gid = a.template_gid as string;
          const fields =
            (a.opt_fields as string) ??
            "name,description,owner.name,team.name,requested_dates,requested_roles";
          return unwrap(
            await api(
              c,
              `/project_templates/${gid}${qs({ opt_fields: fields })}`
            )
          );
        }
        case "instantiate": {
          const gid = a.template_gid as string;
          const data: Record<string, unknown> = {
            name: a.name as string,
          };
          if (a.public !== undefined) data.public = a.public;
          if (a.team) data.team = a.team;
          return unwrap(
            await api(c, `/project_templates/${gid}/instantiateProject`, {
              method: "POST",
              body: JSON.stringify({ data }),
            })
          );
        }
        default:
          return { error: `Unknown template operation: ${op}` };
      }
    },
  },
];
