import { getToolRisk, type ToolRiskLevel } from "./tool-risk";
import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ──

export type ToolIndexEntry = {
  name: string;
  description: string;
  searchText: string;
  integration: string;
  integrationId: string;
  category: string;
  action: string;
  risk: ToolRiskLevel;
  keywords: string[];
};

export type ScoredResult = {
  entry: ToolIndexEntry;
  score: number;
};

export type SearchOptions = {
  limit?: number;
  integration?: string;
  category?: string;
  action?: string;
};

export type IntegrationSummary = {
  id: string;
  name: string;
  category: string;
  toolCount: number;
  tools: { name: string; description?: string; risk: ToolRiskLevel }[];
};

// ── Constants ──

export const RELEVANCE_THRESHOLD = 0.3;
export const SHORT_QUERY_THRESHOLD = 0.2;
export const KEYWORD_ONLY_THRESHOLD = 0.15;
export const DEFAULT_LIMIT = 10;

export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  support: ["CRM", "customer relationship", "helpdesk", "tickets", "customer support"],
  tasks: ["todo", "work items", "project management", "backlog"],
  messaging: ["chat", "instant message", "IM", "team communication"],
  "project-management": ["kanban", "sprint", "agile", "stories", "issues"],
  email: ["mail", "inbox", "correspondence"],
  calendar: ["schedule", "meetings", "appointments", "availability"],
  documents: ["docs", "word processing", "writing"],
  spreadsheets: ["excel", "tables", "data"],
  files: ["storage", "cloud storage", "file management"],
  advertising: ["ads", "campaigns", "marketing", "PPC"],
  crm: ["CRM", "sales", "contacts", "deals", "pipeline", "customer relationship", "leads", "accounts"],
  documentation: ["docs", "library docs", "API reference", "code examples", "SDK docs", "package docs"],
  search: ["web search", "semantic search", "AI search", "research", "lookup", "internet search", "find information"],
};

export const CATEGORY_MAP: Record<string, string> = {
  "google-calendar": "calendar",
  "google-gmail": "email",
  "google-docs": "documents",
  "google-drive": "files",
  "google-sheets": "spreadsheets",
  "google-slides": "presentations",
  asana: "tasks",
  intercom: "support",
  slack: "messaging",
  shortcut: "project-management",
  firecrawl: "web-scraping",
  granola: "meetings",
  "google-ads": "advertising",
  "hubspot-crm": "crm",
  "linkedin-ads": "advertising",
  context7: "documentation",
  exa: "search",
  platform: "platform",
  vault: "secrets",
};

export const ACTION_VERBS = new Set([
  "create", "list", "get", "search", "update", "delete", "send", "read",
  "write", "manage", "reply", "forward", "trash", "batch", "clear", "find",
  "export", "download", "copy", "move", "import", "watch", "stop", "patch",
  "append", "sort", "filter", "validate", "format", "rsvp", "share",
  "unshare", "about", "quick",
]);

export const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "in", "on", "of",
  "with", "by", "from", "at", "is", "it", "this", "that",
]);

export const SEARCH_ENRICHMENTS: Record<string, { useWhen: string; aliases: string }> = {
  // Google Calendar
  google_calendar_create_event: {
    useWhen: "User wants to schedule a meeting, add an event, book time, or create a calendar entry",
    aliases: "schedule meeting, book time, add event, new appointment, set up meeting",
  },
  google_calendar_list_events: {
    useWhen: "User wants to see their schedule, check agenda, view upcoming events, or see what's on their calendar",
    aliases: "show schedule, view agenda, upcoming meetings, what's on my calendar, check availability",
  },
  google_calendar_search_events: {
    useWhen: "User wants to find a specific event, look up a meeting, or search their calendar",
    aliases: "find event, look up meeting, search calendar, locate appointment",
  },
  google_calendar_delete_event: {
    useWhen: "User wants to cancel a meeting, remove an event, or delete from calendar",
    aliases: "cancel meeting, remove event, delete appointment, unschedule",
  },
  google_calendar_find_free_busy: {
    useWhen: "User wants to check availability, find free time, or see when someone is available",
    aliases: "check availability, find free time, when is free, open slots",
  },

  // Google Gmail
  google_gmail_send_message: {
    useWhen: "User wants to send an email, compose a message, or email someone",
    aliases: "send email, compose email, write email, email someone, new email",
  },
  google_gmail_list_messages: {
    useWhen: "User wants to check their inbox, see recent emails, or list messages",
    aliases: "check inbox, recent emails, show emails, view inbox, mail",
  },
  google_gmail_get_message: {
    useWhen: "User wants to read a specific email, open a message, or view email details",
    aliases: "read email, open email, view message, email details",
  },
  google_gmail_reply_to_message: {
    useWhen: "User wants to reply to an email, respond to a message",
    aliases: "reply email, respond to email, answer email, email back",
  },
  google_gmail_forward_message: {
    useWhen: "User wants to forward an email to someone else",
    aliases: "forward email, share email, pass along email, send to someone",
  },
  google_gmail_search: {
    useWhen: "User wants to find an email, search their inbox, or look up a message",
    aliases: "find email, search inbox, look up email, locate message",
  },
  google_gmail_manage_drafts: {
    useWhen: "User wants to create, view, or manage email drafts",
    aliases: "draft email, save draft, compose draft, email draft",
  },

  // Google Docs
  google_docs_create_document: {
    useWhen: "User wants to create a new document, start writing, or make a new doc",
    aliases: "new document, create doc, start document, new google doc",
  },
  google_docs_read_content: {
    useWhen: "User wants to read a document, view doc contents, or see what's in a document",
    aliases: "read document, view doc, open document, see doc contents",
  },
  google_docs_search: {
    useWhen: "User wants to find a document, search their docs, or look up a file",
    aliases: "find document, search docs, look up doc, locate document",
  },
  google_docs_insert_text: {
    useWhen: "User wants to add text to a document, write in a doc, or insert content",
    aliases: "add text, write to doc, insert content, type in document",
  },
  google_docs_replace_text: {
    useWhen: "User wants to find and replace text in a document or update document content",
    aliases: "find and replace, update text, change text, modify document content",
  },

  // Google Drive
  google_drive_search: {
    useWhen: "User wants to find a file, search their drive, or look up a document in Drive",
    aliases: "find file, search drive, look up file, locate in drive",
  },
  google_drive_create_file: {
    useWhen: "User wants to create a new file or folder in Google Drive",
    aliases: "new file, create folder, add to drive, upload file",
  },
  google_drive_download: {
    useWhen: "User wants to download a file from Google Drive",
    aliases: "download file, get file, save file, export from drive",
  },
  google_drive_trash: {
    useWhen: "User wants to delete a file, trash a document, or remove something from Drive",
    aliases: "delete file, trash file, remove from drive, discard file",
  },

  // Google Sheets
  google_sheets_read: {
    useWhen: "User wants to read a spreadsheet, view sheet data, or get values from a sheet",
    aliases: "read spreadsheet, view sheet, get cell values, open spreadsheet",
  },
  google_sheets_write: {
    useWhen: "User wants to write to a spreadsheet, update cell values, or put data in a sheet",
    aliases: "write to sheet, update cells, put data, edit spreadsheet",
  },
  google_sheets_create: {
    useWhen: "User wants to create a new spreadsheet or make a new sheet",
    aliases: "new spreadsheet, create sheet, new google sheet",
  },
  google_sheets_append: {
    useWhen: "User wants to add rows to a spreadsheet or append data",
    aliases: "add rows, append data, insert rows, add to sheet",
  },
  google_sheets_get_info: {
    useWhen: "User wants to see spreadsheet metadata, list tabs/sheets, get tab names or IDs, or check sheet properties",
    aliases: "list tabs, sheet info, tab names, sheet metadata, list sheets, spreadsheet info, tab IDs",
  },
  google_sheets_search: {
    useWhen: "User wants to find text in a spreadsheet, search across sheets, or locate a value in cells",
    aliases: "find text, search cells, locate value, find in sheet, search spreadsheet",
  },
  google_sheets_clear: {
    useWhen: "User wants to clear cell values, erase data from a range, or empty cells in a sheet",
    aliases: "clear cells, erase data, empty range, clear values, wipe cells",
  },
  google_sheets_sort_filter: {
    useWhen: "User wants to sort spreadsheet data by column, set a filter, or clear filters on a sheet",
    aliases: "sort column, filter rows, auto filter, sort data, clear filter, sort spreadsheet",
  },
  google_sheets_manage_tabs: {
    useWhen: "User wants to add a new tab, create a sheet, delete a tab, rename a sheet, duplicate a tab, hide or unhide a sheet, reorder tabs, or change tab color",
    aliases: "create tab, new sheet, add worksheet, delete tab, remove sheet, rename tab, duplicate tab, hide tab, unhide tab, move tab, tab color, new tab, sheet tab",
  },
  google_sheets_copy_tab: {
    useWhen: "User wants to copy a tab to another spreadsheet or duplicate a sheet across files",
    aliases: "copy tab, copy sheet, duplicate to another spreadsheet, transfer tab",
  },
  google_sheets_modify_structure: {
    useWhen: "User wants to insert or delete rows or columns, freeze panes, or auto-resize columns in a spreadsheet",
    aliases: "insert rows, insert columns, delete rows, delete columns, freeze rows, freeze columns, auto resize, add row, add column",
  },
  google_sheets_format: {
    useWhen: "User wants to format cells, apply bold or italic, change font color or background, merge cells, or add notes in a spreadsheet",
    aliases: "bold, italic, font size, font color, background color, merge cells, unmerge, cell notes, number format, alignment, wrap text",
  },
  google_sheets_conditional_format: {
    useWhen: "User wants to add or remove conditional formatting rules, highlight cells based on values, or apply color scales",
    aliases: "conditional formatting, highlight cells, color scale, format rules, conditional rules",
  },
  google_sheets_validate: {
    useWhen: "User wants to set data validation, create dropdown lists, or add input constraints to cells",
    aliases: "dropdown, data validation, input validation, dropdown list, cell validation, restrict input",
  },
  google_sheets_manage_charts: {
    useWhen: "User wants to create, update, or delete a chart in a spreadsheet",
    aliases: "create chart, add chart, bar chart, line chart, pie chart, update chart, delete chart, graph",
  },
  google_sheets_manage_named_ranges: {
    useWhen: "User wants to create or delete named ranges in a spreadsheet",
    aliases: "named range, create named range, delete named range, name a range, range name",
  },

  // Google Slides
  google_slides_create_presentation: {
    useWhen: "User wants to create a new presentation or start a slideshow",
    aliases: "new presentation, create slides, new slideshow, start presentation",
  },
  google_slides_get_presentation: {
    useWhen: "User wants to view or read a presentation",
    aliases: "view presentation, open slides, read presentation, see slideshow",
  },

  // Asana
  asana_create_task: {
    useWhen: "User wants to create a task, add a to-do, or make a new work item in Asana",
    aliases: "new task, add todo, create work item, add to asana",
  },
  asana_search_tasks: {
    useWhen: "User wants to find tasks, search for work items, or look up tasks in Asana",
    aliases: "find task, search tasks, look up work item, find in asana",
  },
  asana_update_task: {
    useWhen: "User wants to update a task, change task status, or modify a work item",
    aliases: "update task, change status, modify task, edit work item, complete task, mark done",
  },
  asana_get_task: {
    useWhen: "User wants to view task details or see a specific task",
    aliases: "view task, task details, see task, get task info",
  },

  // Slack
  slack_send_message: {
    useWhen: "User wants to send a Slack message, post to a channel, or DM someone",
    aliases: "send slack, post message, dm someone, message channel, chat",
  },
  slack_read_channel: {
    useWhen: "User wants to read Slack messages, see channel history, or check a channel",
    aliases: "read slack, view channel, channel history, see messages, check slack",
  },
  slack_search_public: {
    useWhen: "User wants to search Slack, find a message, or look up something in Slack",
    aliases: "search slack, find message, look up in slack, search channels",
  },

  // Exa Search
  web_search_exa: {
    useWhen: "User wants to search the web, find information online, or look something up",
    aliases: "web search, find info online, look up, search internet, google",
  },
  deep_search_exa: {
    useWhen: "User wants an in-depth answer synthesized from multiple web sources",
    aliases: "in-depth answer, synthesize, comprehensive research, deep search",
  },
  find_similar_exa: {
    useWhen: "User wants to find pages similar to a URL or discover related content",
    aliases: "similar pages, related content, find like, competitors, alternatives",
  },
  company_research_exa: {
    useWhen: "User wants to research a company, find business information, or look up an organization",
    aliases: "company info, business research, org lookup, company details",
  },
  people_search_exa: {
    useWhen: "User wants to find a person, search professional profiles, or look up someone",
    aliases: "find person, professional search, who is, linkedin lookup, people finder",
  },

  // Context7
  "resolve-library-id": {
    useWhen: "User wants to find a library ID, look up a package, or search for library documentation",
    aliases: "find library, search package, look up docs, library ID, package name",
  },
  "get-library-docs": {
    useWhen: "User wants to read library documentation, get code examples, or look up API reference for a specific library",
    aliases: "read docs, library documentation, code examples, API reference, SDK docs, package docs, how to use",
  },

  // Memory
  save_memory: {
    useWhen: "Remember something important, save context, persist a learning or preference",
    aliases: "remember, note, save context, persist, store memory",
  },
  recall_memories: {
    useWhen: "Load context from previous conversations, check what you know about the user",
    aliases: "remember, recall, get memories, load context, what do I know",
  },

  // Files
  file_read: {
    useWhen: "Read a file, load a document, view file contents or metadata",
    aliases: "read file, open file, view document, get file contents",
  },
  file_write: {
    useWhen: "Create or update a file, save a document, write content to a file",
    aliases: "write file, create file, save document, update file",
  },
  file_search: {
    useWhen: "Search for files by name or content, find a document",
    aliases: "find file, search files, locate document, look up file",
  },


  // Platform
  submit_feedback: {
    useWhen: "User wants to submit feedback, report an issue, or share suggestions about Switchboard",
    aliases: "give feedback, report issue, suggest improvement, bug report",
  },
  manage_skills: {
    useWhen: "User wants to list, view, create, update, or delete skills, automations, or saved prompts",
    aliases: "show skills, view automations, list prompts, available skills, create skill, edit skill, delete skill",
  },
};

// ── Helper functions ──

export function extractAction(toolName: string): string {
  // Remove integration prefix (e.g., "google_calendar_" or "asana_")
  const parts = toolName.split("_");

  for (let i = 0; i < parts.length; i++) {
    if (ACTION_VERBS.has(parts[i])) {
      return parts.slice(i).join("_");
    }
  }
  // If no action verb found, return the last part
  return parts[parts.length - 1];
}

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export function buildSearchText(
  toolName: string,
  description: string,
  integrationName: string,
  category: string
): string {
  const action = extractAction(toolName);
  const enrichment = SEARCH_ENRICHMENTS[toolName];

  const useWhen = enrichment?.useWhen
    ?? `User wants to ${action.replace(/_/g, " ")} using ${integrationName}`;
  const aliases = enrichment?.aliases
    ?? toolName.replace(/_/g, " ");

  const parts = [
    `Tool: ${toolName}`,
    `Integration: ${integrationName}`,
    `Category: ${category}`,
    `Action: ${action}`,
    `Description: ${description}`,
    `Use when: ${useWhen}`,
    `Also known as: ${aliases}`,
  ];

  const catSynonyms = CATEGORY_SYNONYMS[category];
  if (catSynonyms) {
    parts.push(`Related terms: ${catSynonyms.join(", ")}`);
  }

  return parts.join("\n");
}

// ── Index building ──

export type ToolInput = {
  name: string;
  description: string;
  integrationId: string;
  integrationName: string;
};

export function buildToolIndex(
  tools: ToolInput[],
): ToolIndexEntry[] {
  return tools.map((tool) => {
    const category = CATEGORY_MAP[tool.integrationId] ?? "other";
    const action = extractAction(tool.name);
    const searchText = buildSearchText(
      tool.name,
      tool.description,
      tool.integrationName,
      category
    );
    const keywords = extractKeywords(searchText);

    return {
      name: tool.name,
      description: tool.description,
      searchText,
      integration: tool.integrationName,
      integrationId: tool.integrationId,
      category,
      action,
      risk: getToolRisk(tool.name),
      keywords,
    };
  });
}

// ── Similarity functions ──

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ── Search functions ──

export function keywordSearch(query: string, index: ToolIndexEntry[]): ScoredResult[] {
  const queryTokens = extractKeywords(query);
  if (queryTokens.length === 0) return [];

  const querySet = new Set(queryTokens);

  return index.map((entry) => {
    const entrySet = new Set(entry.keywords);

    // Exact tool name match gets a big bonus
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, "_");
    const nameBonus = entry.name === normalizedQuery ? 0.5 : 0;

    // Check for partial name match
    const nameWords = entry.name.split("_");
    const namePartialBonus = queryTokens.some((qt) => nameWords.includes(qt)) ? 0.1 : 0;

    // Jaccard-like overlap
    let intersection = 0;
    for (const token of querySet) {
      if (entrySet.has(token)) intersection++;
    }
    const union = querySet.size + entrySet.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;

    // Also count how many query tokens matched (recall)
    const recall = queryTokens.length > 0 ? intersection / queryTokens.length : 0;

    // Weighted combination: favor recall so short queries aren't penalized
    const score = recall * 0.6 + jaccard * 0.2 + nameBonus + namePartialBonus;

    return { entry, score };
  }).filter((r) => r.score > 0);
}

export async function searchToolsWithEmbeddings(
  query: string,
  fullIndex: ToolIndexEntry[],
  visibleToolNames: Set<string>,
  opts?: SearchOptions
): Promise<ScoredResult[]> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;

  // Filter to visible tools first
  let filtered = fullIndex.filter((e) => visibleToolNames.has(e.name));

  // Apply filters
  if (opts?.integration) {
    filtered = filtered.filter((e) => e.integrationId === opts.integration);
  }
  if (opts?.category) {
    filtered = filtered.filter((e) => e.category === opts.category);
  }
  if (opts?.action) {
    filtered = filtered.filter((e) => e.action.startsWith(opts.action!));
  }

  const filteredNames = filtered.map((e) => e.name);

  // 1. Get query embedding (OpenAI, LRU cached)
  const queryEmbedding = await getQueryEmbedding(query);

  // 2. If we got an embedding, use pgvector for semantic search
  const semanticScores = new Map<string, number>();
  if (queryEmbedding.length > 0) {
    const dbResults = await searchToolsByEmbedding(queryEmbedding, filteredNames, limit * 3);
    for (const r of dbResults) {
      semanticScores.set(r.tool_name, r.similarity);
    }
  }

  // 3. Keyword search (in-memory, instant)
  const keywordResults = keywordSearch(query, filtered);
  const keywordScores = new Map<string, number>();
  for (const r of keywordResults) {
    keywordScores.set(r.entry.name, r.score);
  }

  // 4. Merge: hybrid scoring
  const hasSemantic = semanticScores.size > 0;

  const results: ScoredResult[] = filtered.map((entry) => {
    const semantic = semanticScores.get(entry.name) ?? 0;
    const keyword = keywordScores.get(entry.name) ?? 0;

    // Name match bonus
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, "_");
    const nameBonus = entry.name === normalizedQuery ? 0.3 : 0;

    // Hybrid: 60% semantic + 30% keyword + 10% name bonus potential
    // Fall back to keyword-only when no semantic scores available
    const score = hasSemantic
      ? semantic * 0.6 + keyword * 0.3 + nameBonus
      : keyword + nameBonus;

    return { entry, score };
  });

  // Graduated threshold: short queries (1-2 tokens) get a lower bar since
  // synonym matches produce moderate semantic scores
  const queryTokens = extractKeywords(query);
  const isShortQuery = queryTokens.length <= 2;

  const threshold = !hasSemantic
    ? KEYWORD_ONLY_THRESHOLD
    : isShortQuery
      ? SHORT_QUERY_THRESHOLD
      : RELEVANCE_THRESHOLD;

  return results
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Keyword-only sync search (for use when async is not possible). */
export function searchTools(
  query: string,
  fullIndex: ToolIndexEntry[],
  visibleToolNames: Set<string>,
  opts?: SearchOptions
): ScoredResult[] {
  const limit = opts?.limit ?? DEFAULT_LIMIT;

  let filtered = fullIndex.filter((e) => visibleToolNames.has(e.name));

  if (opts?.integration) {
    filtered = filtered.filter((e) => e.integrationId === opts.integration);
  }
  if (opts?.category) {
    filtered = filtered.filter((e) => e.category === opts.category);
  }
  if (opts?.action) {
    filtered = filtered.filter((e) => e.action.startsWith(opts.action!));
  }

  return keywordSearch(query, filtered)
    .filter((r) => r.score >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Browse integrations ──

export function browseIntegrations(
  fullIndex: ToolIndexEntry[],
  visibleToolNames: Set<string>,
  opts?: { integration?: string; category?: string }
): IntegrationSummary[] {
  let visible = fullIndex.filter((e) => visibleToolNames.has(e.name));

  if (opts?.integration) {
    visible = visible.filter((e) => e.integrationId === opts.integration);
  }
  if (opts?.category) {
    visible = visible.filter((e) => e.category === opts.category);
  }

  const groups = new Map<string, IntegrationSummary>();

  for (const entry of visible) {
    let group = groups.get(entry.integrationId);
    if (!group) {
      group = {
        id: entry.integrationId,
        name: entry.integration,
        category: entry.category,
        toolCount: 0,
        tools: [],
      };
      groups.set(entry.integrationId, group);
    }
    group.toolCount++;
    group.tools.push({
      name: entry.name,
      risk: entry.risk,
    });
  }

  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Integration summary for discovery mode ──

/**
 * Build a compact one-liner summarizing available integrations for enriching
 * the discover_tools description in discovery mode.
 */
export function buildIntegrationSummaryLine(
  fullIndex: ToolIndexEntry[],
  visibleToolNames: Set<string>
): string {
  const summaries = browseIntegrations(fullIndex, visibleToolNames);
  if (summaries.length === 0) return "";

  // Group by category for compact display
  const byCategory = new Map<string, { names: string[]; tools: number }>();
  for (const s of summaries) {
    const cat = s.category || "other";
    const existing = byCategory.get(cat);
    if (existing) {
      existing.names.push(s.name);
      existing.tools += s.toolCount;
    } else {
      byCategory.set(cat, { names: [s.name], tools: s.toolCount });
    }
  }

  const parts: string[] = [];
  for (const [cat, { names, tools }] of byCategory) {
    parts.push(`${names.join(", ")} (${cat}, ${tools} tools)`);
  }

  let line = parts.join("; ");
  if (line.length > 400) line = line.slice(0, 397) + "...";
  return line;
}

// ── Embedding support ──

export const EMBEDDING_MODEL = "text-embedding-3-large";
export const EMBEDDING_DIMENSIONS = 1536;

// LRU cache for query embeddings
const embeddingCache = new Map<string, { embedding: number[]; ts: number }>();
const CACHE_MAX = 100;

export async function getQueryEmbedding(query: string): Promise<number[]> {
  const cached = embeddingCache.get(query);
  if (cached) {
    cached.ts = Date.now();
    return cached.embedding;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: query,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const embedding: number[] = data.data?.[0]?.embedding ?? [];

    // Evict oldest if at capacity
    if (embeddingCache.size >= CACHE_MAX) {
      let oldestKey = "";
      let oldestTs = Infinity;
      for (const [k, v] of embeddingCache) {
        if (v.ts < oldestTs) {
          oldestTs = v.ts;
          oldestKey = k;
        }
      }
      if (oldestKey) embeddingCache.delete(oldestKey);
    }

    embeddingCache.set(query, { embedding, ts: Date.now() });
    return embedding;
  } catch {
    return [];
  }
}

// ── pgvector search ──

type EmbeddingSearchResult = {
  tool_name: string;
  description: string;
  integration_id: string;
  integration_name: string;
  similarity: number;
};

export async function searchToolsByEmbedding(
  queryEmbedding: number[],
  toolNames: string[],
  limit: number = 20,
): Promise<EmbeddingSearchResult[]> {
  if (toolNames.length === 0) return [];

  try {
    const { data, error } = await supabaseAdmin.rpc("search_tool_embeddings", {
      query_embedding: `[${queryEmbedding.join(",")}]`,
      tool_names: toolNames,
      match_limit: limit,
    });

    if (error) {
      console.warn("[tool-search] pgvector search error:", error.message);
      return [];
    }

    return (data ?? []) as EmbeddingSearchResult[];
  } catch (err) {
    console.warn("[tool-search] pgvector search failed:", err);
    return [];
  }
}

// ── Auto-embed new tools ──

let _ensureInProgress = false;

export async function ensureToolEmbeddings(tools: ToolInput[]): Promise<void> {
  if (_ensureInProgress || tools.length === 0) return;
  _ensureInProgress = true;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return;

    // 1. Fetch existing tool names + search_text from DB
    const { data: existing } = await supabaseAdmin
      .from("tool_embeddings")
      .select("tool_name, search_text");

    const existingMap = new Map<string, string>();
    for (const row of existing ?? []) {
      existingMap.set(row.tool_name, row.search_text);
    }

    // 2. Find tools that are missing or have changed search_text
    const toEmbed: ToolInput[] = [];
    for (const tool of tools) {
      const category = CATEGORY_MAP[tool.integrationId] ?? "other";
      const searchText = buildSearchText(tool.name, tool.description, tool.integrationName, category);
      const existingText = existingMap.get(tool.name);

      if (!existingText || existingText !== searchText) {
        toEmbed.push(tool);
      }
    }

    if (toEmbed.length === 0) return;

    console.log(`[tool-search] Embedding ${toEmbed.length} new/changed tools...`);

    // 3. Generate embeddings in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const batch = toEmbed.slice(i, i + BATCH_SIZE);
      const texts = batch.map((t) => {
        const category = CATEGORY_MAP[t.integrationId] ?? "other";
        return buildSearchText(t.name, t.description, t.integrationName, category);
      });

      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
      });

      if (!res.ok) {
        console.warn(`[tool-search] OpenAI embedding error: ${res.status}`);
        break;
      }

      const data = await res.json();
      const sorted = data.data.sort(
        (a: { index: number }, b: { index: number }) => a.index - b.index
      );

      const rows = batch.map((tool, j) => {
        const category = CATEGORY_MAP[tool.integrationId] ?? "other";
        return {
          tool_name: tool.name,
          description: tool.description,
          integration_id: tool.integrationId,
          integration_name: tool.integrationName,
          search_text: texts[j],
          embedding: `[${sorted[j].embedding.join(",")}]`,
          model: EMBEDDING_MODEL,
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabaseAdmin
        .from("tool_embeddings")
        .upsert(rows, { onConflict: "tool_name" });

      if (error) {
        console.warn("[tool-search] Upsert error:", error.message);
      }
    }

    console.log(`[tool-search] Done embedding ${toEmbed.length} tools`);
  } catch (err) {
    console.warn("[tool-search] ensureToolEmbeddings failed:", err);
  } finally {
    _ensureInProgress = false;
  }
}
