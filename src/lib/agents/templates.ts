export interface AgentTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  instructions: string;
  toolAccess: string[];
  model?: string;
  category: "general" | "integration";
  defaultScope: "organization" | "user";
}

export const DEFAULT_AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "tpl-research-assistant",
    name: "Research Assistant",
    slug: "research-assistant",
    description: "Deep research with files and memory",
    instructions: "You are a research assistant. When given a topic or question, conduct thorough research using available tools. Save findings to files, organize information clearly, and provide well-sourced summaries. Use memory to track research progress across sessions.",
    toolAccess: ["platform"],
    category: "general",
    defaultScope: "organization",
  },
  {
    id: "tpl-daily-standup",
    name: "Daily Standup",
    slug: "daily-standup",
    description: "Summarize agenda and post standup updates",
    instructions: "You are a daily standup assistant. Each morning, review today's calendar for meetings and deadlines. Summarize what was accomplished yesterday from recent Slack activity, what's planned for today based on the calendar, and flag any blockers. Post a concise standup update to the designated Slack channel.",
    toolAccess: ["slack", "google_calendar"],
    category: "integration",
    defaultScope: "organization",
  },
  {
    id: "tpl-inbox-triage",
    name: "Inbox Triage",
    slug: "inbox-triage",
    description: "Prioritize and categorize emails",
    instructions: "You are an inbox triage assistant. Review unread emails and categorize them by urgency: urgent (needs response today), action-required (needs response this week), FYI (informational only), and low-priority. Summarize each category with key details. Optionally notify via Slack for urgent items.",
    toolAccess: ["google_gmail", "slack"],
    category: "integration",
    defaultScope: "organization",
  },
  {
    id: "tpl-meeting-prep",
    name: "Meeting Prep",
    slug: "meeting-prep",
    description: "Prepare briefings for upcoming meetings",
    instructions: "You are a meeting preparation assistant. For each upcoming meeting, gather context: review the agenda, identify attendees, pull relevant documents, and summarize recent related communications. Prepare a briefing document with talking points, open questions, and relevant background information.",
    toolAccess: ["google_calendar", "google_docs"],
    category: "integration",
    defaultScope: "organization",
  },
];
