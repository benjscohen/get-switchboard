export interface SkillTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  category: "general" | "integration";
  requiredIntegration?: string;
  defaultScope: "organization" | "user";
}

/** Fallback templates used when the DB skill_templates table is unavailable. */
export const DEFAULT_TEMPLATES: SkillTemplate[] = [
  {
    id: "tpl-code-review",
    name: "Code Review",
    slug: "code-review",
    description: "Review code for bugs, style issues, and improvements",
    content:
      "Review the following code for bugs, style issues, and potential improvements. Language: {{language}}",
    arguments: [
      { name: "language", description: "Programming language", required: false },
    ],
    category: "general",
    defaultScope: "organization",
  },
  {
    id: "tpl-meeting-notes",
    name: "Meeting Notes",
    slug: "meeting-notes",
    description: "Summarize meeting transcripts into decisions and action items",
    content:
      "Summarize this meeting transcript into: 1) Key decisions made, 2) Action items with owners, 3) Follow-up topics. Be concise and actionable.",
    arguments: [],
    category: "general",
    defaultScope: "organization",
  },
  {
    id: "tpl-write-docs",
    name: "Write Documentation",
    slug: "write-docs",
    description: "Generate clear documentation with examples",
    content:
      "Write clear, well-structured documentation for {{topic}}. Include a brief overview, usage examples, and edge cases to watch for.",
    arguments: [
      { name: "topic", description: "The topic to document", required: true },
    ],
    category: "general",
    defaultScope: "organization",
  },
  {
    id: "tpl-draft-email",
    name: "Draft Email",
    slug: "draft-email",
    description: "Draft a professional email",
    content:
      "Draft a professional email to {{recipient}} about {{subject}}. Keep it concise and actionable. Tone: {{tone}}.",
    arguments: [
      { name: "recipient", description: "Who the email is for", required: true },
      { name: "subject", description: "Email subject", required: true },
      {
        name: "tone",
        description: "Tone (formal, friendly, urgent)",
        required: false,
      },
    ],
    category: "general",
    defaultScope: "user",
  },
  {
    id: "tpl-summarize-slack",
    name: "Summarize Slack Channel",
    slug: "summarize-slack",
    description: "Summarize recent Slack channel discussions",
    content:
      "Read recent messages from the {{channel}} Slack channel and provide a summary of key discussions, decisions, and action items.",
    arguments: [
      { name: "channel", description: "Slack channel name", required: true },
    ],
    category: "integration",
    requiredIntegration: "slack",
    defaultScope: "organization",
  },
  {
    id: "tpl-create-task",
    name: "Create Task from Description",
    slug: "create-task",
    description: "Create a project task from a description",
    content:
      "Create a task with the following details: {{description}}. Set priority and assign appropriately.",
    arguments: [
      { name: "description", description: "Task description", required: true },
    ],
    category: "integration",
    requiredIntegration: "asana",
    defaultScope: "organization",
  },
  {
    id: "tpl-summarize-inbox",
    name: "Summarize Inbox",
    slug: "summarize-inbox",
    description: "Summarize unread emails highlighting urgent items",
    content:
      "Summarize my recent unread emails. Highlight urgent items, action-required messages, and FYI-only messages separately.",
    arguments: [],
    category: "integration",
    requiredIntegration: "google_gmail",
    defaultScope: "organization",
  },
  {
    id: "tpl-calendar-prep",
    name: "Calendar Prep",
    slug: "calendar-prep",
    description: "Prepare briefings for upcoming meetings",
    content:
      "Review my calendar for {{date}} and prepare a brief for each meeting. Include attendees, context from recent communications, and suggested talking points.",
    arguments: [
      {
        name: "date",
        description: "Date to prepare for (e.g. today, tomorrow)",
        required: false,
      },
    ],
    category: "integration",
    requiredIntegration: "google_calendar",
    defaultScope: "organization",
  },
];
