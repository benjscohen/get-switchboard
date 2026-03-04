import type { ProxyIntegrationConfig } from "../types";

function ShortcutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <circle cx="9" cy="9" r="7" fill="#58B1E4" />
      <path
        d="M6.5 6.5L9 9l2.5-2.5M6.5 11.5L9 9l2.5 2.5"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const shortcutIntegration: ProxyIntegrationConfig = {
  id: "shortcut",
  name: "Shortcut",
  description:
    "Project management for software teams — stories, epics, iterations, and more",
  icon: ShortcutIcon,
  serverUrl: "https://mcp.shortcut.com/mcp",
  keyMode: "per_user",
  userKeyInstructions:
    "Enter your Shortcut API token. Generate one from Settings > API Tokens in Shortcut.",
  toolCount: 55,
  tools: [
    {
      name: "stories-search",
      description: "Find Shortcut stories.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name contains" },
          state: { type: "string", description: "Workflow state name" },
          type: { type: "string", enum: ["feature", "bug", "chore"], description: "Story type" },
          owner: { type: "string", description: "Filter by owner (use mention name or \"me\")" },
          team: { type: "string", description: "Team name or mention" },
          label: { type: "string", description: "Label name" },
          epic: { type: "number", description: "Epic ID" },
          project: { type: "number", description: "Project ID" },
          objective: { type: "number", description: "Objective ID" },
          estimate: { type: "number", description: "Point estimate" },
          priority: { type: "string", description: "Priority level" },
          severity: { type: "string", description: "Severity level" },
          description: { type: "string", description: "Description contains" },
          comment: { type: "string", description: "Comment contains" },
          id: { type: "number", description: "Story ID" },
          branch: { type: "string", description: "Branch name" },
          commit: { type: "string", description: "Commit SHA" },
          pr: { type: "number", description: "PR number" },
          requester: { type: "string", description: "Filter by requester (use mention name or \"me\")" },
          productArea: { type: "string", description: "Product area" },
          skillSet: { type: "string", description: "Skill set" },
          technicalArea: { type: "string", description: "Technical area" },
          created: { type: "string", description: "Date filter: \"YYYY-MM-DD\", \"today\", \"yesterday\", \"tomorrow\", or range \"YYYY-MM-DD..YYYY-MM-DD\" (use * for open bounds)" },
          updated: { type: "string", description: "Date filter" },
          completed: { type: "string", description: "Date filter" },
          due: { type: "string", description: "Date filter" },
          isDone: { type: "boolean", description: "Filter by completed status" },
          isStarted: { type: "boolean", description: "Filter by started status" },
          isUnstarted: { type: "boolean", description: "Filter by unstarted status" },
          isOverdue: { type: "boolean", description: "Filter by overdue status" },
          isBlocked: { type: "boolean", description: "Filter by blocked status" },
          isBlocker: { type: "boolean", description: "Filter by blocking status" },
          isUnestimated: { type: "boolean", description: "Filter by unestimated status" },
          isArchived: { type: "boolean", default: false, description: "Filter by archived status" },
          hasOwner: { type: "boolean", description: "Filter by presence of owner" },
          hasEpic: { type: "boolean", description: "Filter by presence of epic" },
          hasLabel: { type: "boolean", description: "Filter by presence of label" },
          hasComment: { type: "boolean", description: "Filter by presence of comment" },
          hasDeadline: { type: "boolean", description: "Filter by presence of deadline" },
          hasAttachment: { type: "boolean", description: "Filter by presence of attachment" },
          hasBranch: { type: "boolean", description: "Filter by presence of branch" },
          hasCommit: { type: "boolean", description: "Filter by presence of commit" },
          hasPr: { type: "boolean", description: "Filter by presence of PR" },
          hasTask: { type: "boolean", description: "Filter by presence of task" },
          nextPageToken: { type: "string", description: "Pagination token from previous search" },
        },
      },
    },
    {
      name: "stories-create",
      description: "Create a new Shortcut story. Requires name and either team or workflow.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Story name (required)", minLength: 1, maxLength: 512 },
          description: { type: "string", description: "Story description", maxLength: 10000 },
          type: { type: "string", enum: ["feature", "bug", "chore"], default: "feature", description: "Story type" },
          team: { type: "string", description: "Team ID or mention (required if no workflow)" },
          workflow: { type: "number", description: "Workflow ID (required if no team)" },
          epic: { type: "number", description: "Epic ID" },
          iteration: { type: "number", description: "Iteration ID" },
          owner: { type: "string", description: "Owner user ID" },
        },
        required: ["name"],
      },
    },
    {
      name: "stories-update",
      description: "Update a Shortcut story. Only provide fields to update.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID (required)", exclusiveMinimum: 0 },
          name: { type: "string", description: "Story name", maxLength: 512 },
          description: { type: "string", description: "Story description", maxLength: 10000 },
          type: { type: "string", enum: ["feature", "bug", "chore"], description: "Story type" },
          workflow_state_id: { type: "number", description: "Workflow state ID" },
          estimate: { type: ["number", "null"], description: "Point estimate (null to unset)" },
          deadline: { type: ["string", "null"], description: "Due date ISO 8601 (null to unset)" },
          epic: { type: ["number", "null"], description: "Epic ID (null to unset)" },
          iteration: { type: ["number", "null"], description: "Iteration ID (null to unset)" },
          project_id: { type: ["number", "null"], description: "Project ID (null to unset)" },
          team_id: { type: ["string", "null"], description: "Team UUID (null to unset)" },
          owner_ids: { type: "array", items: { type: "string" }, description: "Owner user UUIDs" },
          follower_ids: { type: "array", items: { type: "string" }, description: "Follower user UUIDs" },
          labels: { type: "array", items: { type: "object", properties: { name: { type: "string" }, color: { type: "string" }, description: { type: "string" } }, required: ["name"] }, description: "Labels to assign" },
          custom_fields: { type: "array", items: { type: "object", properties: { field_id: { type: "string" }, value_id: { type: "string" } }, required: ["field_id", "value_id"] }, description: "Custom field values" },
          requested_by_id: { type: "string", description: "Requester user UUID" },
          archived: { type: "boolean", description: "Archive the story" },
        },
        required: ["storyPublicId"],
      },
    },
    {
      name: "stories-get-by-id",
      description: "Get a Shortcut story by public ID.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "The story ID", exclusiveMinimum: 0 },
          full: { type: "boolean", default: false, description: "Return all fields (default: slim)" },
        },
        required: ["storyPublicId"],
      },
    },
    {
      name: "stories-get-history",
      description: "Get the change history for a Shortcut story.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "The story ID", exclusiveMinimum: 0 },
        },
        required: ["storyPublicId"],
      },
    },
    {
      name: "stories-get-by-external-link",
      description: "Find stories containing a specific external link.",
      inputSchema: {
        type: "object",
        properties: {
          externalLink: { type: "string", description: "URL to search for" },
        },
        required: ["externalLink"],
      },
    },
    {
      name: "stories-get-branch-name",
      description: "Get a valid git branch name for a story.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "The story ID", exclusiveMinimum: 0 },
        },
        required: ["storyPublicId"],
      },
    },
    {
      name: "stories-assign-current-user",
      description: "Assign current user as story owner.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
        },
        required: ["storyPublicId"],
      },
    },
    {
      name: "stories-unassign-current-user",
      description: "Remove current user as story owner.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
        },
        required: ["storyPublicId"],
      },
    },
    {
      name: "stories-create-comment",
      description: "Add a comment to a story.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
          text: { type: "string", description: "Comment text", minLength: 1 },
          replyToCommentId: { type: "number", description: "Comment ID to reply to", exclusiveMinimum: 0 },
        },
        required: ["storyPublicId", "text"],
      },
    },
    {
      name: "stories-add-task",
      description: "Add a task (checklist item) to a story.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
          taskDescription: { type: "string", description: "Task description", minLength: 1 },
          taskOwnerIds: { type: "array", items: { type: "string" }, description: "Owner user IDs" },
        },
        required: ["storyPublicId", "taskDescription"],
      },
    },
    {
      name: "stories-update-task",
      description: "Update a task in a story.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
          taskPublicId: { type: "number", description: "Task ID", exclusiveMinimum: 0 },
          taskDescription: { type: "string", description: "Task description" },
          isCompleted: { type: "boolean", description: "Mark as completed" },
          taskOwnerIds: { type: "array", items: { type: "string" }, description: "Owner user IDs" },
        },
        required: ["storyPublicId", "taskPublicId"],
      },
    },
    {
      name: "stories-add-relation",
      description: "Add a relationship between stories.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
          relatedStoryPublicId: { type: "number", description: "Related story ID", exclusiveMinimum: 0 },
          relationshipType: { type: "string", enum: ["relates to", "blocks", "blocked by", "duplicates", "duplicated by"], default: "relates to", description: "Relationship type" },
        },
        required: ["storyPublicId", "relatedStoryPublicId"],
      },
    },
    {
      name: "stories-add-subtask",
      description: "Add existing story as a sub-task.",
      inputSchema: {
        type: "object",
        properties: {
          parentStoryPublicId: { type: "number", description: "Parent story ID", exclusiveMinimum: 0 },
          subTaskPublicId: { type: "number", description: "Sub-task story ID", exclusiveMinimum: 0 },
        },
        required: ["parentStoryPublicId", "subTaskPublicId"],
      },
    },
    {
      name: "stories-create-subtask",
      description: "Create a new sub-task story.",
      inputSchema: {
        type: "object",
        properties: {
          parentStoryPublicId: { type: "number", description: "Parent story ID", exclusiveMinimum: 0 },
          name: { type: "string", description: "Sub-task name", minLength: 1, maxLength: 512 },
          description: { type: "string", description: "Sub-task description", maxLength: 10000 },
        },
        required: ["parentStoryPublicId", "name"],
      },
    },
    {
      name: "stories-remove-subtask",
      description: "Remove sub-task from parent (becomes regular story).",
      inputSchema: {
        type: "object",
        properties: {
          subTaskPublicId: { type: "number", description: "Sub-task story ID", exclusiveMinimum: 0 },
        },
        required: ["subTaskPublicId"],
      },
    },
    {
      name: "stories-add-external-link",
      description: "Add an external link to a story.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
          externalLink: { type: "string", description: "URL to add" },
        },
        required: ["storyPublicId", "externalLink"],
      },
    },
    {
      name: "stories-remove-external-link",
      description: "Remove an external link from a story.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
          externalLink: { type: "string", description: "URL to remove" },
        },
        required: ["storyPublicId", "externalLink"],
      },
    },
    {
      name: "stories-set-external-links",
      description: "Replace all external links on a story.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
          externalLinks: { type: "array", items: { type: "string" }, description: "URLs to set (replaces all)" },
        },
        required: ["storyPublicId", "externalLinks"],
      },
    },
    {
      name: "stories-upload-file",
      description: "Upload a file and attach it to a story.",
      inputSchema: {
        type: "object",
        properties: {
          storyPublicId: { type: "number", description: "Story ID", exclusiveMinimum: 0 },
          filePath: { type: "string", description: "File path to upload" },
        },
        required: ["storyPublicId", "filePath"],
      },
    },
    // Epics
    {
      name: "epics-search",
      description: "Find Shortcut epics.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name contains" },
          state: { type: "string", enum: ["unstarted", "started", "done"], description: "Epic state" },
          owner: { type: "string", description: "Filter by owner (use mention name or \"me\")" },
          team: { type: "string", description: "Team mention name" },
          objective: { type: "number", description: "Objective ID" },
          requester: { type: "string", description: "Filter by requester (use mention name or \"me\")" },
          description: { type: "string", description: "Description contains" },
          comment: { type: "string", description: "Comment contains" },
          id: { type: "number", description: "Epic ID" },
          created: { type: "string", description: "Date filter" },
          updated: { type: "string", description: "Date filter" },
          completed: { type: "string", description: "Date filter" },
          due: { type: "string", description: "Date filter" },
          isDone: { type: "boolean", description: "Filter by completed status" },
          isStarted: { type: "boolean", description: "Filter by started status" },
          isUnstarted: { type: "boolean", description: "Filter by unstarted status" },
          isOverdue: { type: "boolean", description: "Filter by overdue status" },
          isArchived: { type: "boolean", default: false, description: "Filter by archived status" },
          hasOwner: { type: "boolean", description: "Filter by presence of owner" },
          hasLabel: { type: "boolean", description: "Filter by presence of label" },
          hasComment: { type: "boolean", description: "Filter by presence of comment" },
          hasDeadline: { type: "boolean", description: "Filter by presence of deadline" },
          nextPageToken: { type: "string", description: "Pagination token from previous search" },
        },
      },
    },
    {
      name: "epics-create",
      description: "Create a new Shortcut epic.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Epic name" },
          description: { type: "string", description: "Epic description" },
          owner: { type: "string", description: "Owner user ID" },
          teamId: { type: "string", description: "Team ID" },
        },
        required: ["name"],
      },
    },
    {
      name: "epics-update",
      description: "Update an epic. Only provide fields to update.",
      inputSchema: {
        type: "object",
        properties: {
          epicPublicId: { type: "number", description: "Epic ID (required)", exclusiveMinimum: 0 },
          name: { type: "string", description: "Epic name", maxLength: 256 },
          description: { type: "string", description: "Epic description", maxLength: 100000 },
          state: { type: "string", enum: ["to do", "in progress", "done"], description: "State (deprecated)" },
          epic_state_id: { type: "number", description: "Epic state ID" },
          deadline: { type: ["string", "null"], description: "Due date ISO 8601 (null to unset)" },
          planned_start_date: { type: ["string", "null"], description: "Start date (null to unset)" },
          owner_ids: { type: "array", items: { type: "string" }, description: "Owner user UUIDs" },
          follower_ids: { type: "array", items: { type: "string" }, description: "Follower user UUIDs" },
          labels: { type: "array", items: { type: "object", properties: { name: { type: "string" }, color: { type: "string" } }, required: ["name"] }, description: "Labels to assign" },
          objective_ids: { type: "array", items: { type: "number" }, description: "Objective IDs" },
          team_id: { type: ["string", "null"], description: "Team UUID (null to unset)" },
          external_id: { type: "string", description: "External ID (empty to clear)" },
          archived: { type: "boolean", description: "Archive the epic" },
        },
        required: ["epicPublicId"],
      },
    },
    {
      name: "epics-get-by-id",
      description: "Get a Shortcut epic by public ID.",
      inputSchema: {
        type: "object",
        properties: {
          epicPublicId: { type: "number", description: "Epic ID", exclusiveMinimum: 0 },
          full: { type: "boolean", default: false, description: "Return all fields (default: slim)" },
        },
        required: ["epicPublicId"],
      },
    },
    {
      name: "epics-delete",
      description: "Delete an epic (cannot be undone).",
      inputSchema: {
        type: "object",
        properties: {
          epicPublicId: { type: "number", description: "Epic ID", exclusiveMinimum: 0 },
        },
        required: ["epicPublicId"],
      },
    },
    // Iterations
    {
      name: "iterations-search",
      description: "Find Shortcut iterations.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name contains" },
          state: { type: "string", enum: ["started", "unstarted", "done"], description: "Iteration state" },
          team: { type: "string", description: "Team ID or mention name" },
          description: { type: "string", description: "Description contains" },
          id: { type: "number", description: "Iteration ID" },
          created: { type: "string", description: "Date filter" },
          updated: { type: "string", description: "Date filter" },
          startDate: { type: "string", description: "Date filter" },
          endDate: { type: "string", description: "Date filter" },
          nextPageToken: { type: "string", description: "Pagination token from previous search" },
        },
      },
    },
    {
      name: "iterations-create",
      description: "Create a new Shortcut iteration.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Iteration name" },
          startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
          endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
          description: { type: "string", description: "Iteration description" },
          teamId: { type: "string", description: "Team ID" },
        },
        required: ["name", "startDate", "endDate"],
      },
    },
    {
      name: "iterations-update",
      description: "Update an iteration. Only provide fields to update.",
      inputSchema: {
        type: "object",
        properties: {
          iterationPublicId: { type: "number", description: "Iteration ID (required)", exclusiveMinimum: 0 },
          name: { type: "string", description: "Iteration name", maxLength: 256 },
          description: { type: "string", description: "Iteration description", maxLength: 100000 },
          startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
          endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
          follower_ids: { type: "array", items: { type: "string" }, description: "Follower user UUIDs" },
          labels: { type: "array", items: { type: "object", properties: { name: { type: "string" }, color: { type: "string" } }, required: ["name"] }, description: "Labels to assign" },
          team_ids: { type: "array", items: { type: "string" }, description: "Team UUIDs" },
        },
        required: ["iterationPublicId"],
      },
    },
    {
      name: "iterations-get-by-id",
      description: "Get a Shortcut iteration by public ID.",
      inputSchema: {
        type: "object",
        properties: {
          iterationPublicId: { type: "number", description: "Iteration ID", exclusiveMinimum: 0 },
          full: { type: "boolean", default: false, description: "Return all fields (default: slim)" },
        },
        required: ["iterationPublicId"],
      },
    },
    {
      name: "iterations-delete",
      description: "Delete an iteration (cannot be undone).",
      inputSchema: {
        type: "object",
        properties: {
          iterationPublicId: { type: "number", description: "Iteration ID", exclusiveMinimum: 0 },
        },
        required: ["iterationPublicId"],
      },
    },
    {
      name: "iterations-get-active",
      description: "Get active iterations for current user's teams.",
      inputSchema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "Team ID to filter by" },
        },
      },
    },
    {
      name: "iterations-get-upcoming",
      description: "Get upcoming iterations for current user's teams.",
      inputSchema: {
        type: "object",
        properties: {
          teamId: { type: "string", description: "Team ID to filter by" },
        },
      },
    },
    {
      name: "iterations-get-stories",
      description: "Get all stories in an iteration.",
      inputSchema: {
        type: "object",
        properties: {
          iterationPublicId: { type: "number", description: "Iteration ID", exclusiveMinimum: 0 },
          includeStoryDescriptions: { type: "boolean", default: false, description: "Include story descriptions (slower)" },
        },
        required: ["iterationPublicId"],
      },
    },
    // Documents
    {
      name: "documents-list",
      description: "List all documents.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "documents-search",
      description: "Search for documents.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title contains" },
          archived: { type: "boolean", description: "Filter by archived status" },
          createdByCurrentUser: { type: "boolean", description: "Created by me" },
          followedByCurrentUser: { type: "boolean", description: "Followed by me" },
          nextPageToken: { type: "string", description: "Pagination token from previous search" },
        },
        required: ["title"],
      },
    },
    {
      name: "documents-get-by-id",
      description: "Get a document by ID (returns Markdown).",
      inputSchema: {
        type: "object",
        properties: {
          docId: { type: "string", description: "Document ID" },
        },
        required: ["docId"],
      },
    },
    {
      name: "documents-create",
      description: "Create a new document (Markdown format).",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title", maxLength: 256 },
          content: { type: "string", description: "Content in Markdown" },
        },
        required: ["title", "content"],
      },
    },
    {
      name: "documents-update",
      description: "Update a document's title or content.",
      inputSchema: {
        type: "object",
        properties: {
          docId: { type: "string", description: "Document ID" },
          title: { type: "string", description: "Document title", maxLength: 256 },
          content: { type: "string", description: "Content in Markdown" },
        },
        required: ["docId"],
      },
    },
    // Labels
    {
      name: "labels-list",
      description: "List all labels in the workspace.",
      inputSchema: {
        type: "object",
        properties: {
          includeArchived: { type: "boolean", default: false, description: "Include archived labels" },
        },
      },
    },
    {
      name: "labels-create",
      description: "Create a new label.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Label name", minLength: 1, maxLength: 128 },
          color: { type: "string", description: "Hex color (#ff0000)" },
          description: { type: "string", description: "Label description", maxLength: 1024 },
        },
        required: ["name"],
      },
    },
    {
      name: "labels-get-stories",
      description: "Get all stories with a specific label.",
      inputSchema: {
        type: "object",
        properties: {
          labelPublicId: { type: "number", description: "Label ID", exclusiveMinimum: 0 },
        },
        required: ["labelPublicId"],
      },
    },
    // Projects
    {
      name: "projects-list",
      description: "List all projects in the workspace.",
      inputSchema: {
        type: "object",
        properties: {
          includeArchived: { type: "boolean", default: false, description: "Include archived projects" },
        },
      },
    },
    {
      name: "projects-get-by-id",
      description: "Get a Shortcut project by ID.",
      inputSchema: {
        type: "object",
        properties: {
          projectPublicId: { type: "number", description: "Project ID", exclusiveMinimum: 0 },
        },
        required: ["projectPublicId"],
      },
    },
    {
      name: "projects-get-stories",
      description: "Get all stories in a project.",
      inputSchema: {
        type: "object",
        properties: {
          projectPublicId: { type: "number", description: "Project ID", exclusiveMinimum: 0 },
        },
        required: ["projectPublicId"],
      },
    },
    // Objectives
    {
      name: "objectives-search",
      description: "Find Shortcut objectives.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name contains" },
          state: { type: "string", enum: ["unstarted", "started", "done"], description: "Objective state" },
          owner: { type: "string", description: "Filter by owner (use mention name or \"me\")" },
          team: { type: "string", description: "Team mention name" },
          requester: { type: "string", description: "Filter by requester (use mention name or \"me\")" },
          description: { type: "string", description: "Description contains" },
          id: { type: "number", description: "Objective ID" },
          created: { type: "string", description: "Date filter" },
          updated: { type: "string", description: "Date filter" },
          completed: { type: "string", description: "Date filter" },
          isDone: { type: "boolean", description: "Filter by completed status" },
          isStarted: { type: "boolean", description: "Filter by started status" },
          isUnstarted: { type: "boolean", description: "Filter by unstarted status" },
          isArchived: { type: "boolean", description: "Filter by archived status" },
          hasOwner: { type: "boolean", description: "Filter by presence of owner" },
          nextPageToken: { type: "string", description: "Pagination token from previous search" },
        },
      },
    },
    {
      name: "objectives-get-by-id",
      description: "Get a Shortcut objective by public ID.",
      inputSchema: {
        type: "object",
        properties: {
          objectivePublicId: { type: "number", description: "Objective ID", exclusiveMinimum: 0 },
          full: { type: "boolean", default: false, description: "Return all fields (default: slim)" },
        },
        required: ["objectivePublicId"],
      },
    },
    // Workflows
    {
      name: "workflows-list",
      description: "List all Shortcut workflows.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "workflows-get-by-id",
      description: "Get a Shortcut workflow by ID.",
      inputSchema: {
        type: "object",
        properties: {
          workflowPublicId: { type: "number", description: "Workflow ID", exclusiveMinimum: 0 },
          full: { type: "boolean", default: false, description: "Return all fields (default: slim)" },
        },
        required: ["workflowPublicId"],
      },
    },
    {
      name: "workflows-get-default",
      description: "Get the default workflow for a team or workspace.",
      inputSchema: {
        type: "object",
        properties: {
          teamPublicId: { type: "string", description: "Team ID (omit for workspace default)" },
        },
      },
    },
    // Teams
    {
      name: "teams-list",
      description: "List all Shortcut teams.",
      inputSchema: {
        type: "object",
        properties: {
          includeArchived: { type: "boolean", default: false, description: "Include archived teams" },
        },
      },
    },
    {
      name: "teams-get-by-id",
      description: "Get a Shortcut team by ID.",
      inputSchema: {
        type: "object",
        properties: {
          teamPublicId: { type: "string", description: "Team ID" },
          full: { type: "boolean", default: false, description: "Return all fields (default: slim)" },
        },
        required: ["teamPublicId"],
      },
    },
    // Users
    {
      name: "users-list",
      description: "Get all users.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "users-get-current",
      description: "Get the current user.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "users-get-current-teams",
      description: "Get a list of teams where the current user is a member.",
      inputSchema: { type: "object", properties: {} },
    },
    // Custom Fields
    {
      name: "custom-fields-list",
      description: "List custom fields and their values (for setting on stories).",
      inputSchema: {
        type: "object",
        properties: {
          includeDisabled: { type: "boolean", default: false, description: "Include disabled fields" },
        },
      },
    },
  ],
};
