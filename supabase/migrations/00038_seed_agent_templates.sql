-- Agent templates — read-only reference table for predefined agent starters
-- =========================================================================

create table agent_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  instructions text not null,
  tool_access jsonb not null default '[]',
  model text,
  category text not null default 'general',
  default_scope text not null default 'organization',
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- No RLS — this is a public read-only reference table accessed via service-role.

insert into agent_templates (name, slug, description, instructions, tool_access, category, default_scope, sort_order) values
  ('Research Assistant', 'research-assistant', 'Conduct thorough research on topics using available tools', 'You are a research assistant. When given a topic or question, conduct thorough research using available tools. Save findings to files, organize information clearly, and provide well-sourced summaries. Use memory to track research progress across sessions.', '["platform"]', 'general', 'organization', 1),
  ('Daily Standup', 'daily-standup', 'Automated daily standup summaries from calendar and Slack', 'You are a daily standup assistant. Each morning, review today''s calendar for meetings and deadlines. Summarize what was accomplished yesterday from recent Slack activity, what''s planned for today based on the calendar, and flag any blockers. Post a concise standup update to the designated Slack channel.', '["slack", "google_calendar"]', 'integration', 'organization', 2),
  ('Inbox Triage', 'inbox-triage', 'Categorize and summarize unread emails by urgency', 'You are an inbox triage assistant. Review unread emails and categorize them by urgency: urgent (needs response today), action-required (needs response this week), FYI (informational only), and low-priority. Summarize each category with key details. Optionally notify via Slack for urgent items.', '["google_gmail", "slack"]', 'integration', 'organization', 3),
  ('Meeting Prep', 'meeting-prep', 'Prepare briefing documents for upcoming meetings', 'You are a meeting preparation assistant. For each upcoming meeting, gather context: review the agenda, identify attendees, pull relevant documents, and summarize recent related communications. Prepare a briefing document with talking points, open questions, and relevant background information.', '["google_calendar", "google_docs"]', 'integration', 'organization', 4);
