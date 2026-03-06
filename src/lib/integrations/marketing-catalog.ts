/**
 * Marketing page integration list.
 *
 * This is the single source of truth for the landing-page integrations grid.
 * When a new integration is added to registry.ts or proxy-registry.ts,
 * add a corresponding entry here with marketing-friendly copy.
 *
 * Kept separate from the registries to avoid pulling heavy tool/schema
 * code into the client bundle (constants.ts is imported by "use client" components).
 */

export type MarketingIntegration = {
  name: string;
  description: string;
  icon: string;
  available: boolean;
};

// ── Available integrations ─────────────────────────────────────────────

const available: MarketingIntegration[] = [
  // Builtin OAuth — Google grouped
  {
    name: "Google Workspace",
    description:
      "Gmail, Calendar, Drive, Docs — full suite access for your AI assistant.",
    icon: "/integrations/google.svg",
    available: true,
  },
  // Builtin OAuth
  {
    name: "HubSpot",
    description:
      "CRM, marketing, and sales — manage contacts, deals, and campaigns.",
    icon: "/integrations/hubspot.svg",
    available: true,
  },
  {
    name: "Asana",
    description:
      "Track projects, manage tasks, and coordinate team workflows.",
    icon: "/integrations/asana.svg",
    available: true,
  },
  // Proxy integrations (from proxy-registry)
  {
    name: "Slack",
    description:
      "Send messages, search channels, manage workflows from any AI tool.",
    icon: "/integrations/slack.svg",
    available: true,
  },
  {
    name: "Shortcut",
    description:
      "Project management for software teams — stories, epics, and iterations.",
    icon: "/integrations/shortcut.svg",
    available: true,
  },
  {
    name: "Granola",
    description:
      "AI meeting notes — automatic transcription, summaries, and action items.",
    icon: "/integrations/granola.svg",
    available: true,
  },
  // Not in registries — external / custom MCP
  {
    name: "Gong",
    description:
      "Revenue intelligence — call recordings, deal insights, and coaching.",
    icon: "/integrations/gong.svg",
    available: true,
  },
  {
    name: "GitHub",
    description:
      "Issues, PRs, code search, and repository management via natural language.",
    icon: "/integrations/github.svg",
    available: true,
  },
];

// ── Coming soon ────────────────────────────────────────────────────────

const comingSoon: MarketingIntegration[] = [
  {
    name: "Notion",
    description:
      "Create pages, query databases, and manage your team's knowledge base.",
    icon: "/integrations/notion.svg",
    available: false,
  },
  {
    name: "Jira",
    description:
      "Create and manage issues, track sprints, and update project boards.",
    icon: "/integrations/jira.svg",
    available: false,
  },
  {
    name: "Salesforce",
    description:
      "Access CRM data, update records, and automate sales workflows.",
    icon: "/integrations/salesforce.svg",
    available: false,
  },
];

export function getMarketingIntegrations(): MarketingIntegration[] {
  return [...available, ...comingSoon];
}
