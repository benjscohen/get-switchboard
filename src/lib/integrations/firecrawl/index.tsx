import type { ProxyIntegrationConfig } from "../types";

function FirecrawlIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <path
        d="M9 2c-1.5 3-4 4.5-4 7.5a4 4 0 0 0 8 0C13 6.5 10.5 5 9 2z"
        fill="#FF6B35"
      />
      <path
        d="M9 8c-.8 1.5-2 2.5-2 4a2 2 0 0 0 4 0c0-1.5-1.2-2.5-2-4z"
        fill="#FFD700"
      />
    </svg>
  );
}

export const firecrawlIntegration: ProxyIntegrationConfig = {
  id: "firecrawl",
  name: "Firecrawl",
  description:
    "Web scraping, crawling, search, and content extraction powered by Firecrawl",
  icon: FirecrawlIcon,
  serverUrl: "https://mcp.firecrawl.dev/v2/mcp",
  keyMode: "org",
  toolCount: 12,
  tools: [
    {
      name: "firecrawl_scrape",
      description: "Scrape content from a single URL with advanced options",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to scrape" },
          formats: {
            type: "array",
            items: { type: "string" },
            description:
              "Content formats to return (e.g. markdown, html, json)",
          },
          onlyMainContent: {
            type: "boolean",
            description: "Extract only the main content, filtering out nav, footer, etc.",
          },
          waitFor: {
            type: "number",
            description: "Milliseconds to wait before scraping (for JS rendering)",
          },
          mobile: {
            type: "boolean",
            description: "Use mobile viewport",
          },
          includeTags: {
            type: "array",
            items: { type: "string" },
            description: "HTML tags to include",
          },
          excludeTags: {
            type: "array",
            items: { type: "string" },
            description: "HTML tags to exclude",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "firecrawl_map",
      description: "Map a website to discover all indexed URLs on the site",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to map" },
          search: {
            type: "string",
            description: "Optional search term to filter URLs",
          },
          includeSubdomains: {
            type: "boolean",
            description: "Include subdomains in map",
          },
          limit: {
            type: "number",
            description: "Maximum number of URLs to return",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "firecrawl_search",
      description:
        "Search the web and optionally extract content from search results",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: {
            type: "number",
            description: "Maximum number of results",
          },
          location: {
            type: "string",
            description: "Geographic location for results",
          },
          scrapeOptions: {
            type: "object",
            description: "Options for scraping search result pages",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "firecrawl_crawl",
      description: "Start an asynchronous crawl of a website with advanced options",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to start crawling from" },
          maxDiscoveryDepth: {
            type: "number",
            description: "Maximum depth for link discovery",
          },
          limit: {
            type: "number",
            description: "Maximum number of pages to crawl",
          },
          allowExternalLinks: {
            type: "boolean",
            description: "Allow crawling external links",
          },
          deduplicateSimilarURLs: {
            type: "boolean",
            description: "Deduplicate similar URLs",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "firecrawl_check_crawl_status",
      description: "Check the status and progress of a crawl job",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "The crawl job ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "firecrawl_extract",
      description:
        "Extract structured information from web pages using LLM capabilities",
      inputSchema: {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "URLs to extract from",
          },
          prompt: {
            type: "string",
            description: "Extraction prompt describing what to extract",
          },
          schema: {
            type: "object",
            description: "JSON schema for structured extraction output",
          },
          allowExternalLinks: {
            type: "boolean",
            description: "Allow following external links",
          },
          enableWebSearch: {
            type: "boolean",
            description: "Enable web search to find additional sources",
          },
        },
        required: ["urls", "prompt"],
      },
    },
    {
      name: "firecrawl_agent",
      description:
        "Autonomous web research agent that independently browses and extracts data",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Research prompt describing what to find",
          },
          urls: {
            type: "array",
            items: { type: "string" },
            description: "Optional starting URLs",
          },
          schema: {
            type: "object",
            description: "Optional JSON schema for structured output",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "firecrawl_agent_status",
      description:
        "Check the status of an agent job and retrieve results when complete",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "The agent job ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "firecrawl_browser_create",
      description: "Create a persistent browser session for code execution via CDP",
      inputSchema: {
        type: "object",
        properties: {
          ttl: {
            type: "number",
            description: "Time to live in seconds",
          },
          activityTtl: {
            type: "number",
            description: "Activity-based time to live in seconds",
          },
        },
      },
    },
    {
      name: "firecrawl_browser_execute",
      description: "Execute code in an active browser session",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description: "The browser session ID",
          },
          code: {
            type: "string",
            description: "Code to execute",
          },
          language: {
            type: "string",
            description: "Language of the code (bash, python, javascript)",
          },
        },
        required: ["sessionId", "code"],
      },
    },
    {
      name: "firecrawl_browser_delete",
      description: "Destroy a browser session",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description: "The browser session ID to delete",
          },
        },
        required: ["sessionId"],
      },
    },
    {
      name: "firecrawl_browser_list",
      description: "List browser sessions, optionally filtered by status",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by session status",
          },
        },
      },
    },
  ],
};
