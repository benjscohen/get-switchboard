-- Skill templates — read-only reference table for predefined skill starters
-- ========================================================================

create table skill_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  content text not null,
  arguments jsonb not null default '[]',
  category text not null default 'general',
  required_integration text,
  default_scope text not null default 'organization',
  sort_order int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- No RLS — this is a public read-only reference table accessed via service-role.

insert into skill_templates (name, slug, description, content, arguments, category, required_integration, default_scope, sort_order) values
  ('Code Review', 'code-review', 'Review code for bugs, style issues, and improvements', 'Review the following code for bugs, style issues, and potential improvements. Language: {{language}}', '[{"name":"language","description":"Programming language","required":false}]', 'general', null, 'organization', 1),
  ('Meeting Notes', 'meeting-notes', 'Summarize meeting transcripts into decisions and action items', 'Summarize this meeting transcript into: 1) Key decisions made, 2) Action items with owners, 3) Follow-up topics. Be concise and actionable.', '[]', 'general', null, 'organization', 2),
  ('Write Documentation', 'write-docs', 'Generate clear documentation with examples', 'Write clear, well-structured documentation for {{topic}}. Include a brief overview, usage examples, and edge cases to watch for.', '[{"name":"topic","description":"The topic to document","required":true}]', 'general', null, 'organization', 3),
  ('Draft Email', 'draft-email', 'Draft a professional email', 'Draft a professional email to {{recipient}} about {{subject}}. Keep it concise and actionable. Tone: {{tone}}.', '[{"name":"recipient","description":"Who the email is for","required":true},{"name":"subject","description":"Email subject","required":true},{"name":"tone","description":"Tone (formal, friendly, urgent)","required":false}]', 'general', null, 'user', 4),
  ('Summarize Slack Channel', 'summarize-slack', 'Summarize recent Slack channel discussions', 'Read recent messages from the {{channel}} Slack channel and provide a summary of key discussions, decisions, and action items.', '[{"name":"channel","description":"Slack channel name","required":true}]', 'integration', 'slack', 'organization', 5),
  ('Create Task from Description', 'create-task', 'Create a project task from a description', 'Create a task with the following details: {{description}}. Set priority and assign appropriately.', '[{"name":"description","description":"Task description","required":true}]', 'integration', 'asana', 'organization', 6),
  ('Summarize Inbox', 'summarize-inbox', 'Summarize unread emails highlighting urgent items', 'Summarize my recent unread emails. Highlight urgent items, action-required messages, and FYI-only messages separately.', '[]', 'integration', 'google_gmail', 'organization', 7),
  ('Calendar Prep', 'calendar-prep', 'Prepare briefings for upcoming meetings', 'Review my calendar for {{date}} and prepare a brief for each meeting. Include attendees, context from recent communications, and suggested talking points.', '[{"name":"date","description":"Date to prepare for (e.g. today, tomorrow)","required":false}]', 'integration', 'google_calendar', 'organization', 8);
