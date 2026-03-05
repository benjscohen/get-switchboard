import { z } from "zod";
import { jsonParamOptional } from "../shared/json-params";

// ── Shared fragments ──

export const taskGid = z.string().describe("Task GID");
export const projectGid = z.string().describe("Project GID");
export const workspaceGid = z.string().describe("Workspace GID");
export const sectionGid = z.string().describe("Section GID");
export const goalGid = z.string().describe("Goal GID");
export const tagGid = z.string().describe("Tag GID");
export const customFieldGid = z.string().describe("Custom field GID");
export const portfolioGid = z.string().describe("Portfolio GID");
export const templateGid = z.string().describe("Project template GID");

export const customFieldType = z.enum([
  "text",
  "number",
  "enum",
  "multi_enum",
  "date",
  "people",
]);

export const optFields = z
  .string()
  .optional()
  .describe(
    "Comma-separated fields to include (e.g. 'name,assignee.name,due_on,completed')"
  );

export const paginationFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max results per page (1-100, default 20)"),
  offset: z
    .string()
    .optional()
    .describe("Pagination offset token from a previous response"),
};

export const asanaColor = z
  .enum([
    "dark-pink",
    "dark-green",
    "dark-blue",
    "dark-red",
    "dark-teal",
    "dark-brown",
    "dark-orange",
    "dark-purple",
    "dark-warm-gray",
    "light-pink",
    "light-green",
    "light-blue",
    "light-red",
    "light-teal",
    "light-brown",
    "light-orange",
    "light-purple",
    "light-warm-gray",
    "none",
  ])
  .optional()
  .describe("Asana color name for projects and tags");

// ── Task schemas (7) ──

export const searchTasksSchema = z.object({
  workspace: workspaceGid.describe("Workspace GID to search in"),
  text: z.string().optional().describe("Full-text search query"),
  assignee: z
    .string()
    .optional()
    .describe("User GID, 'me', or email to filter by assignee"),
  project: z.string().optional().describe("Project GID to filter by"),
  section: z.string().optional().describe("Section GID to filter by"),
  completed: z
    .boolean()
    .optional()
    .describe("Filter by completion status (true/false)"),
  modified_since: z
    .string()
    .optional()
    .describe("ISO 8601 datetime — only tasks modified after this time"),
  due_on: z.string().optional().describe("Due date (YYYY-MM-DD) exact match"),
  "due_on.before": z
    .string()
    .optional()
    .describe("Due date before this date (YYYY-MM-DD)"),
  "due_on.after": z
    .string()
    .optional()
    .describe("Due date after this date (YYYY-MM-DD)"),
  sort_by: z
    .enum(["due_date", "created_at", "completed_at", "likes", "modified_at"])
    .optional()
    .describe("Sort results by this field"),
  sort_ascending: z
    .boolean()
    .optional()
    .describe("Sort ascending (default false)"),
  opt_fields: optFields,
  ...paginationFields,
});

export const getTaskSchema = z.object({
  task_gid: taskGid,
  opt_fields: optFields,
});

export const createTaskSchema = z.object({
  workspace: workspaceGid.describe("Workspace GID for the new task"),
  name: z.string().describe("Task name"),
  notes: z.string().optional().describe("Task description (plain text)"),
  html_notes: z
    .string()
    .optional()
    .describe("Task description (rich text HTML)"),
  assignee: z
    .string()
    .optional()
    .describe("User GID or 'me' to assign the task"),
  due_on: z.string().optional().describe("Due date (YYYY-MM-DD)"),
  due_at: z
    .string()
    .optional()
    .describe("Due datetime (ISO 8601, for timed tasks)"),
  start_on: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  start_at: z.string().optional().describe("Start datetime (ISO 8601)"),
  projects: z
    .string()
    .optional()
    .describe("Comma-separated project GIDs to add the task to"),
  tags: z
    .string()
    .optional()
    .describe("Comma-separated tag GIDs to apply"),
  parent: z.string().optional().describe("Parent task GID (makes this a subtask)"),
  followers: z
    .string()
    .optional()
    .describe("Comma-separated user GIDs to add as followers"),
  custom_fields: jsonParamOptional("Object mapping custom field GID to value"),
});

export const updateTaskSchema = z.object({
  task_gid: taskGid,
  name: z.string().optional().describe("New task name"),
  notes: z.string().optional().describe("New description (plain text)"),
  html_notes: z.string().optional().describe("New description (rich text HTML)"),
  assignee: z
    .string()
    .optional()
    .describe("User GID, 'me', or 'null' to unassign"),
  due_on: z.string().optional().describe("New due date (YYYY-MM-DD)"),
  due_at: z.string().optional().describe("New due datetime (ISO 8601)"),
  start_on: z.string().optional().describe("New start date (YYYY-MM-DD)"),
  start_at: z.string().optional().describe("New start datetime (ISO 8601)"),
  completed: z.boolean().optional().describe("Mark task complete or incomplete"),
  custom_fields: jsonParamOptional("Object mapping custom field GID to value"),
});

export const manageTaskRelationsSchema = z.object({
  task_gid: taskGid,
  operation: z
    .enum([
      "add_project",
      "remove_project",
      "set_section",
      "add_tag",
      "remove_tag",
      "set_parent",
      "add_followers",
    ])
    .describe("Relation operation to perform"),
  project_gid: z
    .string()
    .optional()
    .describe("Project GID (for add_project, remove_project)"),
  section_gid: z
    .string()
    .optional()
    .describe("Section GID (for set_section — also requires project_gid)"),
  tag_gid: z.string().optional().describe("Tag GID (for add_tag, remove_tag)"),
  parent_gid: z
    .string()
    .optional()
    .describe("Parent task GID or 'null' to unparent (for set_parent)"),
  followers: z
    .string()
    .optional()
    .describe("Comma-separated user GIDs (for add_followers)"),
});

export const manageTaskDependenciesSchema = z.object({
  task_gid: taskGid,
  operation: z
    .enum([
      "add_dependencies",
      "remove_dependencies",
      "add_dependents",
      "remove_dependents",
    ])
    .describe("Dependency operation to perform"),
  targets: z
    .string()
    .describe("Comma-separated GIDs of tasks to add/remove as dependencies or dependents"),
});

export const manageSubtasksSchema = z.object({
  task_gid: taskGid.describe("Parent task GID"),
  operation: z.enum(["list", "create", "reorder"]).describe("Subtask operation"),
  name: z.string().optional().describe("Subtask name (for create)"),
  notes: z.string().optional().describe("Subtask description (for create)"),
  assignee: z
    .string()
    .optional()
    .describe("User GID or 'me' (for create)"),
  due_on: z.string().optional().describe("Due date YYYY-MM-DD (for create)"),
  subtask_gid: z
    .string()
    .optional()
    .describe("Subtask GID to reorder (for reorder)"),
  insert_before: z
    .string()
    .optional()
    .describe("GID of subtask to insert before (for reorder)"),
  insert_after: z
    .string()
    .optional()
    .describe("GID of subtask to insert after (for reorder)"),
  opt_fields: optFields,
  ...paginationFields,
});

// ── Organization schemas (4) ──

export const manageProjectsSchema = z.object({
  operation: z
    .enum(["list", "get", "create", "update", "delete", "task_counts"])
    .describe("Project operation to perform"),
  workspace: z
    .string()
    .optional()
    .describe("Workspace GID (required for list, create)"),
  team: z
    .string()
    .optional()
    .describe("Team GID (required for create in organization workspaces)"),
  project_gid: z
    .string()
    .optional()
    .describe("Project GID (for get, update, delete, task_counts)"),
  name: z.string().optional().describe("Project name (for create, update)"),
  notes: z.string().optional().describe("Project description (for create, update)"),
  color: asanaColor,
  layout: z
    .enum(["list", "board", "timeline", "calendar"])
    .optional()
    .describe("Project layout (for create)"),
  due_on: z.string().optional().describe("Project due date YYYY-MM-DD"),
  start_on: z.string().optional().describe("Project start date YYYY-MM-DD"),
  archived: z.boolean().optional().describe("Archive/unarchive project (for update)"),
  public: z.boolean().optional().describe("Whether the project is public"),
  opt_fields: optFields,
  ...paginationFields,
});

export const manageSectionsSchema = z.object({
  project_gid: projectGid.describe("Project GID (required for list, create)"),
  operation: z
    .enum(["list", "create", "update", "delete", "reorder"])
    .describe("Section operation to perform"),
  section_gid: z
    .string()
    .optional()
    .describe("Section GID (for update, delete, reorder)"),
  name: z.string().optional().describe("Section name (for create, update)"),
  before_section: z
    .string()
    .optional()
    .describe("Section GID to insert before (for reorder)"),
  after_section: z
    .string()
    .optional()
    .describe("Section GID to insert after (for reorder)"),
  opt_fields: optFields,
  ...paginationFields,
});

export const manageStoriesSchema = z.object({
  task_gid: taskGid.describe("Task GID to manage comments on"),
  operation: z
    .enum(["list", "create", "update", "delete"])
    .describe("Story/comment operation to perform"),
  story_gid: z
    .string()
    .optional()
    .describe("Story GID (for update, delete)"),
  text: z
    .string()
    .optional()
    .describe("Comment text (for create, update)"),
  opt_fields: optFields,
  ...paginationFields,
});

export const manageGoalsSchema = z.object({
  operation: z
    .enum(["list", "get", "create", "update", "update_metric"])
    .describe("Goal operation to perform"),
  workspace: z
    .string()
    .optional()
    .describe("Workspace GID (required for list, create)"),
  goal_gid: z
    .string()
    .optional()
    .describe("Goal GID (for get, update, update_metric)"),
  team: z.string().optional().describe("Team GID to filter goals"),
  time_period: z
    .string()
    .optional()
    .describe("Time period GID to filter goals"),
  name: z.string().optional().describe("Goal name (for create, update)"),
  notes: z.string().optional().describe("Goal description"),
  due_on: z.string().optional().describe("Goal due date YYYY-MM-DD"),
  start_on: z.string().optional().describe("Goal start date YYYY-MM-DD"),
  status: z
    .enum([
      "green",
      "yellow",
      "red",
      "blue",
      "achieved",
      "partial",
      "missed",
      "dropped",
    ])
    .optional()
    .describe("Goal status color (for update)"),
  current_number_value: z
    .number()
    .optional()
    .describe("Current metric value (for update_metric)"),
  target_number_value: z
    .number()
    .optional()
    .describe("Target metric value (for update_metric)"),
  opt_fields: optFields,
  ...paginationFields,
});

// ── Utility schemas (2) ──

export const manageTagsSchema = z.object({
  operation: z
    .enum(["list", "get", "create", "update"])
    .describe("Tag operation to perform"),
  workspace: z
    .string()
    .optional()
    .describe("Workspace GID (required for list, create)"),
  tag_gid: z
    .string()
    .optional()
    .describe("Tag GID (for get, update)"),
  name: z.string().optional().describe("Tag name (for create, update)"),
  color: asanaColor,
  opt_fields: optFields,
  ...paginationFields,
});

export const getContextSchema = z.object({
  operation: z
    .enum([
      "list_workspaces",
      "list_teams",
      "list_users",
      "get_user",
      "list_projects",
    ])
    .describe("Context lookup operation"),
  workspace: z
    .string()
    .optional()
    .describe("Workspace GID (for list_teams, list_users, list_projects)"),
  team_gid: z
    .string()
    .optional()
    .describe("Team GID — narrows list_users to a specific team"),
  user_gid: z
    .string()
    .optional()
    .describe("User GID or 'me' (for get_user)"),
  opt_fields: optFields,
  ...paginationFields,
});

// ── v2 schemas (4) ──

export const manageCustomFieldsSchema = z.object({
  operation: z
    .enum(["list", "get", "create", "update", "delete", "create_enum_option"])
    .describe("Custom field operation to perform"),
  workspace: z
    .string()
    .optional()
    .describe("Workspace GID (required for list, create)"),
  custom_field_gid: customFieldGid
    .optional()
    .describe(
      "Custom field GID (for get, update, delete, create_enum_option)"
    ),
  name: z.string().optional().describe("Custom field name (for create, update)"),
  description: z
    .string()
    .optional()
    .describe("Custom field description (for create, update)"),
  resource_subtype: customFieldType
    .optional()
    .describe("Custom field type (required for create)"),
  enum_option_name: z
    .string()
    .optional()
    .describe("Enum option name (for create_enum_option)"),
  enum_option_color: asanaColor.describe(
    "Enum option color (for create_enum_option)"
  ),
  insert_before: z
    .string()
    .optional()
    .describe("Enum option GID to insert before (for create_enum_option)"),
  insert_after: z
    .string()
    .optional()
    .describe("Enum option GID to insert after (for create_enum_option)"),
  opt_fields: optFields,
  ...paginationFields,
});

export const managePortfoliosSchema = z.object({
  operation: z
    .enum([
      "list",
      "get",
      "create",
      "update",
      "delete",
      "list_items",
      "add_item",
      "remove_item",
    ])
    .describe("Portfolio operation to perform"),
  workspace: z
    .string()
    .optional()
    .describe("Workspace GID (required for list, create)"),
  portfolio_gid: portfolioGid
    .optional()
    .describe(
      "Portfolio GID (for get, update, delete, list_items, add_item, remove_item)"
    ),
  name: z.string().optional().describe("Portfolio name (for create, update)"),
  color: asanaColor,
  public: z.boolean().optional().describe("Whether the portfolio is public"),
  owner: z
    .string()
    .optional()
    .describe("Owner user GID or 'me' (for list filter)"),
  item_gid: z
    .string()
    .optional()
    .describe("Project or portfolio GID to add/remove (for add_item, remove_item)"),
  opt_fields: optFields,
  ...paginationFields,
});

export const manageAttachmentsSchema = z.object({
  operation: z
    .enum(["list", "get", "create_url", "delete"])
    .describe("Attachment operation to perform"),
  task_gid: taskGid
    .optional()
    .describe("Task GID (required for list, create_url)"),
  attachment_gid: z
    .string()
    .optional()
    .describe("Attachment GID (for get, delete)"),
  url: z
    .string()
    .optional()
    .describe("URL of the external attachment (for create_url)"),
  name: z.string().optional().describe("Attachment display name (for create_url)"),
  opt_fields: optFields,
  ...paginationFields,
});

export const manageTemplatesSchema = z.object({
  operation: z
    .enum(["list", "get", "instantiate"])
    .describe("Project template operation to perform"),
  workspace: z
    .string()
    .optional()
    .describe("Workspace GID (required for list)"),
  team: z.string().optional().describe("Team GID (for instantiate)"),
  template_gid: templateGid
    .optional()
    .describe("Project template GID (for get, instantiate)"),
  name: z
    .string()
    .optional()
    .describe("New project name (required for instantiate)"),
  public: z
    .boolean()
    .optional()
    .describe("Whether the instantiated project is public"),
  opt_fields: optFields,
  ...paginationFields,
});
