/**
 * Tool risk classification for MCP safety controls.
 *
 * Every builtin tool is classified as "read", "write", or "destructive".
 * Unknown/custom tools default to "write" (safe middle ground).
 */

export type ToolRiskLevel = "read" | "write" | "destructive";

const toolRiskMap: Record<string, ToolRiskLevel> = {
  // ── Google Calendar ──
  google_calendar_list_events: "read",
  google_calendar_get_event: "read",
  google_calendar_create_event: "write",
  google_calendar_update_event: "write",
  google_calendar_patch_event: "write",
  google_calendar_delete_event: "destructive",
  google_calendar_move_event: "write",
  google_calendar_quick_add: "write",
  google_calendar_import_event: "write",
  google_calendar_list_recurring_instances: "read",
  google_calendar_rsvp: "write",
  google_calendar_search_events: "read",
  google_calendar_watch_events: "write",
  google_calendar_batch_events: "destructive",
  google_calendar_list_calendars: "read",
  google_calendar_get_calendar: "read",
  google_calendar_create_calendar: "write",
  google_calendar_update_calendar: "write",
  google_calendar_delete_calendar: "destructive",
  google_calendar_clear_calendar: "destructive",
  google_calendar_get_calendar_entry: "read",
  google_calendar_update_calendar_entry: "write",
  google_calendar_add_calendar: "write",
  google_calendar_remove_calendar: "destructive",
  google_calendar_list_sharing_rules: "read",
  google_calendar_share_calendar: "write",
  google_calendar_update_sharing: "write",
  google_calendar_unshare_calendar: "destructive",
  google_calendar_find_free_busy: "read",
  google_calendar_get_settings: "read",
  google_calendar_get_setting: "read",
  google_calendar_get_colors: "read",
  google_calendar_stop_watching: "write",

  // ── Google Gmail ──
  google_gmail_list_messages: "read",
  google_gmail_get_message: "read",
  google_gmail_get_attachment: "read",
  google_gmail_send_message: "destructive",
  google_gmail_reply_to_message: "destructive",
  google_gmail_forward_message: "destructive",
  google_gmail_modify_message: "write",
  google_gmail_trash_message: "destructive",
  google_gmail_batch_modify_messages: "destructive",
  google_gmail_list_threads: "read",
  google_gmail_get_thread: "read",
  google_gmail_manage_drafts: "write",
  google_gmail_manage_labels: "write",
  google_gmail_manage_vacation: "destructive",
  google_gmail_manage_filters: "destructive",
  google_gmail_get_profile: "read",
  google_gmail_list_history: "read",

  // ── Google Docs ──
  google_docs_create_document: "write",
  google_docs_get_document: "read",
  google_docs_read_content: "read",
  google_docs_search: "read",
  google_docs_insert_text: "write",
  google_docs_replace_text: "write",
  google_docs_delete_content: "destructive",
  google_docs_format_text: "write",
  google_docs_format_paragraph: "write",
  google_docs_manage_tables: "write",
  google_docs_format_table: "write",
  google_docs_manage_sections: "write",
  google_docs_manage_headers_footers: "write",
  google_docs_manage_images: "write",
  google_docs_manage_named_ranges: "write",
  google_docs_manage_tabs: "write",
  google_docs_update_document_style: "write",

  // ── Google Sheets ──
  google_sheets_get_info: "read",
  google_sheets_create: "write",
  google_sheets_search: "read",
  google_sheets_read: "read",
  google_sheets_write: "write",
  google_sheets_append: "write",
  google_sheets_clear: "destructive",
  google_sheets_sort_filter: "write",
  google_sheets_manage_tabs: "write",
  google_sheets_copy_tab: "write",
  google_sheets_modify_structure: "write",
  google_sheets_format: "write",
  google_sheets_conditional_format: "write",
  google_sheets_validate: "write",
  google_sheets_manage_charts: "write",
  google_sheets_manage_named_ranges: "write",

  // ── Google Slides ──
  google_slides_get_presentation: "read",
  google_slides_get_slide_content: "read",
  google_slides_get_slide_thumbnail: "read",
  google_slides_create_presentation: "write",
  google_slides_manage_slides: "write",
  google_slides_add_element: "write",
  google_slides_manage_text: "write",
  google_slides_manage_table: "write",
  google_slides_format_text: "write",
  google_slides_format_element: "write",
  google_slides_update_page: "write",
  google_slides_batch_update: "write",
  google_slides_delete_element: "destructive",

  // ── Google Drive ──
  google_drive_search: "read",
  google_drive_get_file: "read",
  google_drive_create_file: "write",
  google_drive_update_file: "write",
  google_drive_copy_file: "write",
  google_drive_trash: "destructive",
  google_drive_export: "read",
  google_drive_download: "read",
  google_drive_manage_permissions: "destructive",
  google_drive_manage_comments: "write",
  google_drive_manage_replies: "write",
  google_drive_list_revisions: "read",
  google_drive_manage_shared_drives: "write",
  google_drive_about: "read",

  // ── Asana ──
  asana_search_tasks: "read",
  asana_get_task: "read",
  asana_create_task: "write",
  asana_update_task: "write",
  asana_manage_task_relations: "write",
  asana_manage_task_dependencies: "write",
  asana_manage_subtasks: "write",
  asana_manage_projects: "write",
  asana_manage_sections: "write",
  asana_manage_stories: "write",
  asana_manage_goals: "write",
  asana_manage_tags: "write",
  asana_get_context: "read",
  asana_manage_custom_fields: "write",
  asana_manage_portfolios: "write",
  asana_manage_attachments: "write",
  asana_manage_templates: "write",

  // ── HubSpot CRM ──
  hubspot_crm_manage_objects: "write",
  hubspot_crm_search_objects: "read",
  hubspot_crm_batch_objects: "write",
  hubspot_crm_manage_associations: "write",
  hubspot_crm_merge_objects: "destructive",
  hubspot_crm_manage_properties: "write",
  hubspot_crm_manage_property_groups: "write",
  hubspot_crm_manage_schemas: "write",
  hubspot_crm_get_object_schema: "read",
  hubspot_crm_manage_pipelines: "write",
  hubspot_crm_manage_pipeline_stages: "write",
  hubspot_crm_manage_owners: "read",
  hubspot_crm_manage_users: "read",
  hubspot_crm_manage_lists: "write",
  hubspot_crm_manage_imports: "write",
  hubspot_crm_manage_exports: "read",
  hubspot_crm_manage_deal_splits: "write",
  hubspot_crm_manage_calling_transcripts: "read",
  hubspot_crm_manage_marketing_events: "write",
  hubspot_crm_manage_feedback_submissions: "read",
  hubspot_crm_manage_forecasts: "read",
  hubspot_crm_manage_campaigns: "write",
  hubspot_crm_manage_sequences: "write",

  // ── Exa Search ──
  web_search_exa: "read",
  web_search_advanced_exa: "read",
  deep_search_exa: "read",
  find_similar_exa: "read",
  get_contents_exa: "read",
  crawling_exa: "read",
  company_research_exa: "read",
  people_search_exa: "read",
  get_code_context_exa: "read",
  deep_researcher_start: "write",
  deep_researcher_check: "read",

  // ── Skill tools ──
  manage_skills: "write",

  // ── Vault tools ──
  vault_list_secrets: "read",
  vault_get_secret: "read",
  vault_set_secret: "write",
  vault_delete_secret: "destructive",
  vault_search_secrets: "read",

  // ── Platform tools ──
  submit_feedback: "write",
  discover_tools: "read",
};

// Pattern-based heuristic for tools not in the static map.
// Checked in order — first match wins.
const DESTRUCTIVE_PATTERNS = [
  /\bdelete\b/, /\btrash\b/, /\bclear\b/, /\bremove\b/, /\bunshare\b/,
  /\bsend message\b/, /\breply to message\b/, /\bforward message\b/,
  /\bbatch modify\b/, /\bmanage vacation\b/, /\bmanage filters\b/,
  /\bmanage permissions\b/, /\bpurge\b/, /\bdestroy\b/,
];
const READ_PATTERNS = [
  /\blist\b/, /\bget\b/, /\bsearch\b/, /\bread\b/, /\bfind\b/,
  /\babout\b/, /\bexport\b/, /\bdownload\b/, /\bprofile\b/,
  /\bsettings?\b/, /\bcolors?\b/, /\bhistory\b/, /\binfo\b/,
  /\bthumbnail\b/, /\brevisions?\b/, /\bcount\b/, /\bstatus\b/,
];

function inferRisk(toolName: string): ToolRiskLevel {
  // Replace _ with space so \b word boundaries work correctly for
  // tool names like "slack_search_channels" or "protoniq__semantic_search"
  const normalized = toolName.toLowerCase().replace(/_/g, " ");
  if (DESTRUCTIVE_PATTERNS.some((p) => p.test(normalized))) return "destructive";
  if (READ_PATTERNS.some((p) => p.test(normalized))) return "read";
  return "write";
}

/**
 * Get the risk level of a tool.
 * Uses a static map for known builtin tools, with a pattern-based
 * heuristic fallback for new or custom tools.
 */
export function getToolRisk(toolName: string): ToolRiskLevel {
  return toolRiskMap[toolName] ?? inferRisk(toolName);
}

/**
 * Check if a tool's risk level is allowed by the given scope.
 * Scope acts as a ceiling: "read_only" allows only read,
 * "read_write" allows read + write, "full" allows everything.
 */
export function isRiskAllowedByScope(
  risk: ToolRiskLevel,
  scope: string
): boolean {
  if (scope === "full") return true;
  if (scope === "read_write") return risk !== "destructive";
  if (scope === "read_only") return risk === "read";
  return true; // unknown scope → permissive (shouldn't happen)
}
