import type { ProxyIntegrationConfig } from "../types";

function ExaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <circle cx="9" cy="9" r="7" fill="#4F46E5" />
      <circle cx="9" cy="9" r="3.5" fill="none" stroke="#fff" strokeWidth="1.5" />
      <line x1="11.5" y1="11.5" x2="15" y2="15" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export const exaIntegration: ProxyIntegrationConfig = {
  id: "exa",
  name: "Exa",
  description:
    "AI-powered web search, content extraction, company research, and deep research by Exa",
  icon: ExaIcon,
  serverUrl: "https://mcp.exa.ai/mcp",
  keyMode: "per_user",
  userKeyInstructions: (
    <>
      Enter your Exa API key.{" "}
      <a
        href="https://dashboard.exa.ai/api-keys"
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-brand hover:text-brand/80"
      >
        Get one here
      </a>
      .
    </>
  ),
  fallbackTools: [
    {
      name: "web_search_exa",
      description:
        "Search the web using Exa's AI-powered semantic search engine. Returns relevant web pages matching the query.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          numResults: {
            type: "number",
            description: "Number of results to return (default 10)",
          },
          contentsOptions: {
            type: "object",
            description: "Options for content extraction from results",
            properties: {
              text: {
                type: "object",
                properties: {
                  maxCharacters: { type: "number", description: "Max characters of text to return" },
                  includeHtmlTags: { type: "boolean", description: "Include HTML tags in text" },
                },
              },
              highlights: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Custom query for highlights" },
                  numSentences: { type: "number", description: "Number of sentences per highlight" },
                  highlightsPerUrl: { type: "number", description: "Number of highlights per URL" },
                },
              },
              summary: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Custom query for summary generation" },
                },
              },
            },
          },
        },
        required: ["query"],
      },
    },
    {
      name: "web_search_advanced_exa",
      description:
        "Advanced Exa search with filters for domains, dates, categories, text inclusion/exclusion, and livecrawl for fresh results.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
          numResults: { type: "number", description: "Number of results (default 10)" },
          type: {
            type: "string",
            enum: ["keyword", "neural", "auto"],
            description: "Search type (default auto)",
          },
          category: {
            type: "string",
            enum: [
              "company", "research paper", "news", "pdf", "github",
              "tweet", "linkedin", "personal site", "people", "finance",
            ],
            description: "Filter by content category",
          },
          includeDomains: {
            type: "array",
            items: { type: "string" },
            description: "Only include results from these domains",
          },
          excludeDomains: {
            type: "array",
            items: { type: "string" },
            description: "Exclude results from these domains",
          },
          startPublishedDate: {
            type: "string",
            description: "Filter results published after this date (ISO 8601)",
          },
          endPublishedDate: {
            type: "string",
            description: "Filter results published before this date (ISO 8601)",
          },
          includeText: {
            type: "array",
            items: { type: "string" },
            description: "Only include results containing all of these strings",
          },
          excludeText: {
            type: "array",
            items: { type: "string" },
            description: "Exclude results containing any of these strings",
          },
          livecrawl: {
            type: "string",
            enum: ["always", "fallback", "never"],
            description: "Livecrawl behavior for fresh content",
          },
          maxAgeHours: {
            type: "number",
            description: "Maximum age of results in hours (for freshness filtering)",
          },
          contentsOptions: {
            type: "object",
            description: "Options for content extraction (text, highlights, summary)",
            properties: {
              text: {
                type: "object",
                properties: {
                  maxCharacters: { type: "number" },
                  includeHtmlTags: { type: "boolean" },
                },
              },
              highlights: {
                type: "object",
                properties: {
                  query: { type: "string" },
                  numSentences: { type: "number" },
                  highlightsPerUrl: { type: "number" },
                },
              },
              summary: {
                type: "object",
                properties: {
                  query: { type: "string" },
                },
              },
            },
          },
        },
        required: ["query"],
      },
    },
    {
      name: "deep_search_exa",
      description:
        "Perform a deep search that synthesizes information from multiple sources into a comprehensive answer.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The research query" },
        },
        required: ["query"],
      },
    },
    {
      name: "find_similar_exa",
      description:
        "Find web pages similar to a given URL. Useful for discovering related content, competitors, or alternative sources.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to find similar pages for" },
          numResults: { type: "number", description: "Number of results (default 10)" },
          includeDomains: {
            type: "array",
            items: { type: "string" },
            description: "Only include results from these domains",
          },
          excludeDomains: {
            type: "array",
            items: { type: "string" },
            description: "Exclude results from these domains",
          },
          startPublishedDate: { type: "string", description: "Published after (ISO 8601)" },
          endPublishedDate: { type: "string", description: "Published before (ISO 8601)" },
          contentsOptions: {
            type: "object",
            description: "Options for content extraction (text, highlights, summary)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "get_contents_exa",
      description:
        "Retrieve clean content from one or more URLs or Exa result IDs. Returns text, highlights, and/or summaries.",
      inputSchema: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "string" },
            description: "URLs or Exa result IDs to get content from",
          },
          text: {
            type: "object",
            description: "Text extraction options",
            properties: {
              maxCharacters: { type: "number", description: "Max characters to return" },
              includeHtmlTags: { type: "boolean", description: "Include HTML tags" },
            },
          },
          highlights: {
            type: "object",
            description: "Highlight extraction options",
            properties: {
              query: { type: "string", description: "Custom query for highlights" },
              numSentences: { type: "number", description: "Sentences per highlight" },
              highlightsPerUrl: { type: "number", description: "Highlights per URL" },
            },
          },
          summary: {
            type: "object",
            description: "Summary generation options",
            properties: {
              query: { type: "string", description: "Custom query for summary" },
            },
          },
        },
        required: ["ids"],
      },
    },
    {
      name: "crawling_exa",
      description:
        "Extract the full content from a single URL, including text, HTML, and metadata.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to crawl and extract content from" },
        },
        required: ["url"],
      },
    },
    {
      name: "company_research_exa",
      description:
        "Research a company using Exa's AI search. Returns business information, news, and relevant web pages.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Company name or research query" },
        },
        required: ["query"],
      },
    },
    {
      name: "people_search_exa",
      description:
        "Search for professional profiles and people information across LinkedIn and other sources.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Person name or search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_code_context_exa",
      description:
        "Find code examples, documentation, and technical context for programming questions.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Programming or technical query" },
        },
        required: ["query"],
      },
    },
    {
      name: "deep_researcher_start",
      description:
        "Start an asynchronous deep research agent that investigates a topic thoroughly and produces a detailed report.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The research question or topic" },
        },
        required: ["query"],
      },
    },
    {
      name: "deep_researcher_check",
      description:
        "Check the status and retrieve results of a deep research job started with deep_researcher_start.",
      inputSchema: {
        type: "object",
        properties: {
          researchId: { type: "string", description: "The research job ID from deep_researcher_start" },
        },
        required: ["researchId"],
      },
    },
  ],
};
