import type { ProxyIntegrationConfig } from "../types";

function GitHubIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/integrations/github.svg" alt="" width={18} height={18} className="shrink-0" />
  );
}

export const githubIntegration: ProxyIntegrationConfig = {
  id: "github",
  name: "GitHub",
  description:
    "Repositories, issues, pull requests, code search, and more",
  icon: GitHubIcon,
  serverUrl: "https://api.githubcopilot.com/mcp/",
  keyMode: "per_user",
  userKeyInstructions: (
    <>
      Enter your GitHub Personal Access Token.{" "}
      <a
        href="https://github.com/settings/tokens"
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-brand hover:text-brand/80"
      >
        Generate one here
      </a>
      . Select the scopes you need (e.g. repo, read:org).
    </>
  ),
  fallbackTools: [
    // Repos
    {
      name: "get_file_contents",
      description: "Get the contents of a file or directory from a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner (user or organization)" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "File or directory path" },
          branch: { type: "string", description: "Branch name (defaults to repo default branch)" },
        },
        required: ["owner", "repo", "path"],
      },
    },
    {
      name: "create_or_update_file",
      description: "Create or update a single file in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "File content" },
          message: { type: "string", description: "Commit message" },
          branch: { type: "string", description: "Branch name" },
          sha: { type: "string", description: "SHA of the file being replaced (required for updates)" },
        },
        required: ["owner", "repo", "path", "content", "message", "branch"],
      },
    },
    {
      name: "push_files",
      description: "Push multiple files to a GitHub repository in a single commit.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          branch: { type: "string", description: "Branch name" },
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                content: { type: "string" },
              },
              required: ["path", "content"],
            },
            description: "Files to push",
          },
          message: { type: "string", description: "Commit message" },
        },
        required: ["owner", "repo", "branch", "files", "message"],
      },
    },
    {
      name: "search_repositories",
      description: "Search for GitHub repositories.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (GitHub search syntax)" },
          page: { type: "number", description: "Page number for pagination" },
          perPage: { type: "number", description: "Results per page (max 100)" },
        },
        required: ["query"],
      },
    },
    {
      name: "create_repository",
      description: "Create a new GitHub repository in your account.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Repository name" },
          description: { type: "string", description: "Repository description" },
          private: { type: "boolean", description: "Whether the repository is private" },
          autoInit: { type: "boolean", description: "Initialize with a README" },
        },
        required: ["name"],
      },
    },
    {
      name: "fork_repository",
      description: "Fork a GitHub repository to your account or specified organization.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          organization: { type: "string", description: "Organization to fork to (optional)" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "create_branch",
      description: "Create a new branch in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          branch: { type: "string", description: "New branch name" },
          from_branch: { type: "string", description: "Source branch (defaults to repo default branch)" },
        },
        required: ["owner", "repo", "branch"],
      },
    },
    {
      name: "list_commits",
      description: "Get list of commits of a branch in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          sha: { type: "string", description: "Branch name or commit SHA" },
          page: { type: "number", description: "Page number" },
          perPage: { type: "number", description: "Results per page" },
        },
        required: ["owner", "repo"],
      },
    },
    // Issues
    {
      name: "create_issue",
      description: "Create a new issue in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          title: { type: "string", description: "Issue title" },
          body: { type: "string", description: "Issue body" },
          assignees: { type: "array", items: { type: "string" }, description: "Usernames to assign" },
          labels: { type: "array", items: { type: "string" }, description: "Labels to add" },
          milestone: { type: "number", description: "Milestone number" },
        },
        required: ["owner", "repo", "title"],
      },
    },
    {
      name: "list_issues",
      description: "List issues in a GitHub repository with filtering options.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state filter" },
          labels: { type: "string", description: "Comma-separated label names" },
          sort: { type: "string", enum: ["created", "updated", "comments"], description: "Sort field" },
          direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
          since: { type: "string", description: "ISO 8601 date — only issues updated after this" },
          page: { type: "number", description: "Page number" },
          perPage: { type: "number", description: "Results per page" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "get_issue",
      description: "Get details of a specific issue in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue number" },
        },
        required: ["owner", "repo", "issue_number"],
      },
    },
    {
      name: "update_issue",
      description: "Update an existing issue in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue number" },
          title: { type: "string", description: "New title" },
          body: { type: "string", description: "New body" },
          state: { type: "string", enum: ["open", "closed"], description: "Issue state" },
          labels: { type: "array", items: { type: "string" }, description: "Labels to set" },
          assignees: { type: "array", items: { type: "string" }, description: "Usernames to assign" },
          milestone: { type: "number", description: "Milestone number" },
        },
        required: ["owner", "repo", "issue_number"],
      },
    },
    {
      name: "add_issue_comment",
      description: "Add a comment to an existing issue.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue number" },
          body: { type: "string", description: "Comment body" },
        },
        required: ["owner", "repo", "issue_number", "body"],
      },
    },
    {
      name: "search_issues",
      description: "Search for issues and pull requests across GitHub repositories.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (GitHub search syntax)" },
          sort: { type: "string", enum: ["comments", "reactions", "reactions-+1", "reactions--1", "reactions-smile", "reactions-thinking_face", "reactions-heart", "reactions-tada", "interactions", "created", "updated"], description: "Sort field" },
          order: { type: "string", enum: ["asc", "desc"], description: "Sort order" },
          page: { type: "number", description: "Page number" },
          perPage: { type: "number", description: "Results per page" },
        },
        required: ["query"],
      },
    },
    // Pull Requests
    {
      name: "create_pull_request",
      description: "Create a new pull request in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          title: { type: "string", description: "PR title" },
          body: { type: "string", description: "PR description" },
          head: { type: "string", description: "Branch containing changes" },
          base: { type: "string", description: "Branch to merge into" },
          draft: { type: "boolean", description: "Create as draft PR" },
          maintainer_can_modify: { type: "boolean", description: "Allow maintainer edits" },
        },
        required: ["owner", "repo", "title", "head", "base"],
      },
    },
    {
      name: "list_pull_requests",
      description: "List pull requests in a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "PR state filter" },
          head: { type: "string", description: "Filter by head branch (user:branch)" },
          base: { type: "string", description: "Filter by base branch" },
          sort: { type: "string", enum: ["created", "updated", "popularity", "long-running"], description: "Sort field" },
          direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
          page: { type: "number", description: "Page number" },
          perPage: { type: "number", description: "Results per page" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "get_pull_request",
      description: "Get details of a specific pull request.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "Pull request number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "get_pull_request_files",
      description: "Get the list of files changed in a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "Pull request number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "get_pull_request_status",
      description: "Get the combined status of all checks for a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "Pull request number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "get_pull_request_comments",
      description: "Get the review comments on a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "Pull request number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "get_pull_request_reviews",
      description: "Get the reviews for a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "Pull request number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "create_pull_request_review",
      description: "Create a review on a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "Pull request number" },
          body: { type: "string", description: "Review body text" },
          event: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"], description: "Review action" },
          comments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "File path" },
                position: { type: "number", description: "Line position in the diff" },
                body: { type: "string", description: "Comment body" },
              },
              required: ["path", "position", "body"],
            },
            description: "Line-specific comments",
          },
        },
        required: ["owner", "repo", "pull_number", "body", "event"],
      },
    },
    {
      name: "merge_pull_request",
      description: "Merge a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "Pull request number" },
          commit_title: { type: "string", description: "Merge commit title" },
          commit_message: { type: "string", description: "Merge commit message" },
          merge_method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "update_pull_request_branch",
      description: "Update a pull request branch with the latest changes from the base branch.",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "Pull request number" },
          expected_head_sha: { type: "string", description: "Expected SHA of the head ref" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    // Search
    {
      name: "search_code",
      description: "Search for code across GitHub repositories.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (GitHub code search syntax)" },
          page: { type: "number", description: "Page number" },
          perPage: { type: "number", description: "Results per page" },
        },
        required: ["query"],
      },
    },
    {
      name: "search_users",
      description: "Search for GitHub users.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          page: { type: "number", description: "Page number" },
          perPage: { type: "number", description: "Results per page" },
        },
        required: ["query"],
      },
    },
  ],
};
