import type { LocalIntegrationConfig } from "../types";

function ChromeIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/integrations/chrome.svg" alt="" width={20} height={20} className="shrink-0" />
  );
}

export const chromeMcpIntegration: LocalIntegrationConfig = {
  id: "chrome-mcp",
  name: "Chrome DevTools",
  description:
    "Control Chrome DevTools for debugging, profiling, and browser automation via a local MCP server.",
  icon: () => <ChromeIcon />,
  setupInstructions: (
    <div className="space-y-3 text-sm text-text-secondary">
      <p>
        <strong className="text-text-primary">Chrome DevTools</strong> lets
        Claude interact with your browser — clicking, reading pages, running
        audits, and more. Follow these steps to set it up:
      </p>
      <ol className="list-decimal list-inside space-y-2 text-xs">
        <li>
          <strong className="text-text-primary">Open Chrome with a special setting.</strong>{" "}
          Quit Chrome completely, then reopen it from your terminal by pasting this command:
          <pre className="mt-1 rounded-lg border border-border bg-bg-card p-2 text-xs font-mono overflow-x-auto">
            {`# macOS\nopen -a "Google Chrome" --args --remote-debugging-port=9222\n\n# Windows\nchrome.exe --remote-debugging-port=9222`}
          </pre>
        </li>
        <li>
          <strong className="text-text-primary">Add the integration to Claude Desktop.</strong>{" "}
          Open Claude Desktop, go to{" "}
          <strong>Settings → Developer → Edit Config</strong>, and paste this
          into the file that opens:
          <pre className="mt-1 rounded-lg border border-border bg-bg-card p-2 text-xs font-mono overflow-x-auto">
            {JSON.stringify(
              {
                mcpServers: {
                  "chrome-devtools": {
                    command: "npx",
                    args: ["chrome-devtools-mcp@latest"],
                  },
                },
              },
              null,
              2
            )}
          </pre>
        </li>
        <li>
          <strong className="text-text-primary">Restart Claude Desktop.</strong>{" "}
          Close and reopen it — the Chrome DevTools tools will appear
          automatically.
        </li>
      </ol>
      <p className="text-xs">
        Need help?{" "}
        <a
          href="https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-chrome-devtools"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          View the full setup guide
        </a>
      </p>
    </div>
  ),
  tools: [
    { name: "click", description: "Click an element on the page" },
    { name: "drag", description: "Drag an element to another location" },
    { name: "evaluate_script", description: "Execute JavaScript in the page context" },
    { name: "fill", description: "Fill in a form field" },
    { name: "get_console_logs", description: "Get console log messages" },
    { name: "get_element_styles", description: "Get computed styles for an element" },
    { name: "get_network_activity", description: "Get network request/response data" },
    { name: "get_page_a11y_snapshot", description: "Get an accessibility tree snapshot of the page" },
    { name: "get_page_content", description: "Get the HTML content of the page" },
    { name: "get_page_metadata", description: "Get page metadata (title, URL, etc.)" },
    { name: "highlight_elements", description: "Highlight elements on the page" },
    { name: "hover", description: "Hover over an element" },
    { name: "key_press", description: "Press a keyboard key" },
    { name: "lighthouse_audit", description: "Run a Lighthouse audit on the page" },
    { name: "navigate_page", description: "Navigate to a URL" },
    { name: "network_intercept", description: "Intercept and modify network requests" },
    { name: "page_find", description: "Search for text on the page" },
    { name: "query_dom", description: "Query the DOM with a CSS selector" },
    { name: "scroll", description: "Scroll the page or an element" },
    { name: "select_option", description: "Select an option from a dropdown" },
    { name: "set_device_metrics", description: "Set viewport size and device metrics" },
    { name: "snapshot_diff", description: "Compare two page snapshots" },
    { name: "storage_clear", description: "Clear browser storage" },
    { name: "storage_get", description: "Get values from browser storage" },
    { name: "storage_set", description: "Set values in browser storage" },
    { name: "tab_list", description: "List open browser tabs" },
    { name: "tab_manage", description: "Switch, open, or close tabs" },
    { name: "take_screenshot", description: "Take a screenshot of the page" },
    { name: "type_text", description: "Type text into an element" },
  ],
};
