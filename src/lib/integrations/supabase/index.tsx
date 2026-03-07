import type { ProxyIntegrationConfig } from "../types";

function SupabaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path
        d="M10.2 16.5c-.4.5-1.2.1-1.2-.5V10h6.3c.7 0 1.1.8.7 1.4L10.2 16.5z"
        fill="#3ECF8E"
      />
      <path
        d="M7.8 1.5c.4-.5 1.2-.1 1.2.5V8H2.7c-.7 0-1.1-.8-.7-1.4L7.8 1.5z"
        fill="#3ECF8E"
        opacity=".6"
      />
    </svg>
  );
}

export const supabaseIntegration: ProxyIntegrationConfig = {
  id: "supabase",
  name: "Supabase",
  description:
    "Database management, migrations, edge functions, branching, and project management for Supabase",
  icon: SupabaseIcon,
  serverUrl: "https://mcp.supabase.com/mcp",
  keyMode: "per_user",
  userKeyInstructions: (
    <>
      Enter your Supabase Personal Access Token (starts with <code>sbp_</code>).{" "}
      <a
        href="https://supabase.com/dashboard/account/tokens"
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-brand hover:text-brand/80"
      >
        Generate one here
      </a>
      .
    </>
  ),
  fallbackTools: [
    // Projects & Orgs
    {
      name: "list_projects",
      description: "List all Supabase projects accessible to the user.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_organizations",
      description: "List all Supabase organizations the user belongs to.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_project_url",
      description: "Get the API URL for a Supabase project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "get_publishable_keys",
      description: "Get the publishable (anon) API key for a Supabase project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
        },
        required: ["project_id"],
      },
    },
    // Tables & SQL
    {
      name: "list_tables",
      description: "List all tables in a Supabase project database.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "list_extensions",
      description: "List all PostgreSQL extensions in a Supabase project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "execute_sql",
      description: "Execute a SQL query against a Supabase project database.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
          query: { type: "string", description: "The SQL query to execute" },
        },
        required: ["project_id", "query"],
      },
    },
    // Migrations
    {
      name: "list_migrations",
      description: "List all migrations for a Supabase project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "apply_migration",
      description: "Apply a SQL migration to a Supabase project database.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
          name: { type: "string", description: "Migration name" },
          query: { type: "string", description: "The SQL migration to apply" },
        },
        required: ["project_id", "name", "query"],
      },
    },
    // Logs & Advisors
    {
      name: "get_logs",
      description: "Get logs for a Supabase project service.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
          service: {
            type: "string",
            description: "The service to get logs for (e.g. api, postgres, auth, storage, edge-functions)",
          },
        },
        required: ["project_id", "service"],
      },
    },
    {
      name: "get_advisors",
      description: "Get performance and security advisors for a Supabase project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
        },
        required: ["project_id"],
      },
    },
    // Types
    {
      name: "generate_typescript_types",
      description: "Generate TypeScript types from a Supabase project database schema.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
        },
        required: ["project_id"],
      },
    },
    // Edge Functions
    {
      name: "list_edge_functions",
      description: "List all edge functions in a Supabase project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "get_edge_function",
      description: "Get details of a specific edge function.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
          function_slug: { type: "string", description: "The edge function slug" },
        },
        required: ["project_id", "function_slug"],
      },
    },
    {
      name: "deploy_edge_function",
      description: "Deploy an edge function to a Supabase project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
          function_slug: { type: "string", description: "The edge function slug" },
          entrypoint_path: { type: "string", description: "Path to the entrypoint file" },
          import_map_path: { type: "string", description: "Path to the import map file" },
        },
        required: ["project_id", "function_slug", "entrypoint_path"],
      },
    },
    // Branching
    {
      name: "create_branch",
      description: "Create a database branch for a Supabase project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
          name: { type: "string", description: "Branch name" },
          region: { type: "string", description: "Region for the branch" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "list_branches",
      description: "List all database branches for a Supabase project.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "The Supabase project ID" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "delete_branch",
      description: "Delete a database branch.",
      inputSchema: {
        type: "object",
        properties: {
          branch_id: { type: "string", description: "The branch ID to delete" },
        },
        required: ["branch_id"],
      },
    },
    {
      name: "merge_branch",
      description: "Merge a database branch into the parent project.",
      inputSchema: {
        type: "object",
        properties: {
          branch_id: { type: "string", description: "The branch ID to merge" },
        },
        required: ["branch_id"],
      },
    },
    {
      name: "reset_branch",
      description: "Reset a database branch to match the parent project.",
      inputSchema: {
        type: "object",
        properties: {
          branch_id: { type: "string", description: "The branch ID to reset" },
        },
        required: ["branch_id"],
      },
    },
    {
      name: "rebase_branch",
      description: "Rebase a database branch on top of the parent project's latest migrations.",
      inputSchema: {
        type: "object",
        properties: {
          branch_id: { type: "string", description: "The branch ID to rebase" },
        },
        required: ["branch_id"],
      },
    },
    // Docs
    {
      name: "search_docs",
      description: "Search the Supabase documentation.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  ],
};
