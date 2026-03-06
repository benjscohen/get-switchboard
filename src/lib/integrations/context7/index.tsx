import type { ProxyIntegrationConfig } from "../types";

function Context7Icon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
      <rect x="2" y="1" width="14" height="16" rx="2" fill="#00E9A3" />
      <rect x="5" y="4" width="8" height="1.5" rx="0.5" fill="#fff" />
      <rect x="5" y="7" width="6" height="1.5" rx="0.5" fill="#fff" />
      <rect x="5" y="10" width="7" height="1.5" rx="0.5" fill="#fff" />
      <rect x="5" y="13" width="5" height="1.5" rx="0.5" fill="#fff" />
    </svg>
  );
}

export const context7Integration: ProxyIntegrationConfig = {
  id: "context7",
  name: "Context7",
  description:
    "Up-to-date, version-specific library documentation and code examples by Context7",
  icon: Context7Icon,
  serverUrl: "https://mcp.context7.com/mcp",
  keyMode: "org",
  fallbackTools: [
    {
      name: "resolve-library-id",
      description:
        "Search for libraries by name to get Context7-compatible library IDs. Use this before calling get-library-docs to find the correct library ID.",
      inputSchema: {
        type: "object",
        properties: {
          libraryName: {
            type: "string",
            description: "The name of the library to search for (e.g. 'react', 'next.js', 'langchain')",
          },
        },
        required: ["libraryName"],
      },
    },
    {
      name: "get-library-docs",
      description:
        "Fetch up-to-date documentation and code examples for a library using its Context7-compatible library ID. Use resolve-library-id first to get the correct ID.",
      inputSchema: {
        type: "object",
        properties: {
          context7CompatibleLibraryID: {
            type: "string",
            description: "The Context7-compatible library ID (obtained from resolve-library-id)",
          },
          topic: {
            type: "string",
            description: "Optional topic to filter documentation (e.g. 'hooks', 'routing', 'middleware')",
          },
          tokens: {
            type: "number",
            description: "Maximum number of tokens to return (default varies by library)",
          },
        },
        required: ["context7CompatibleLibraryID"],
      },
    },
  ],
};
