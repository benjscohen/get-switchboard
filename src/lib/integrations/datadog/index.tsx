import type { ProxyIntegrationConfig } from "../types";

function DatadogIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 128 128" className="shrink-0">
      <rect width="128" height="128" rx="12" fill="#632CA6" />
      <path
        d="M82.5 36c-3.5-2.7-7.8-3.9-12.3-3.9-2.8 0-5.6.5-8.2 1.5-2.1-1.4-4.5-2.2-7.1-2.2-3.3 0-6.4 1.3-8.7 3.5C43.4 37.5 41.5 41 41.5 45v1.2c-3.8 3.6-6 8.6-6 14 0 10.8 8.7 19.5 19.5 19.5 2.3 0 4.5-.4 6.5-1.1 2.4 1.6 5.3 2.6 8.4 2.6 4.1 0 7.8-1.6 10.5-4.3 2.5.8 5.1 1.3 7.8 1.3C99.8 78.2 109 69 109 57.4c0-9.8-6.7-18-15.8-20.3C91.3 34.3 87.2 33 82.5 36zM70.2 72.5c-1.8.7-3.7 1-5.7 1-8.5 0-15.5-7-15.5-15.5 0-4.2 1.7-8 4.5-10.8.5-.5.8-1.2.8-1.9V45c0-2.5 1.1-4.7 2.8-6.3 1.7-1.5 4-2.5 6.5-2.5 1.8 0 3.4.5 4.8 1.4-3.5 2.3-6.2 5.8-7.5 10-.3.9 0 1.9.7 2.5.7.6 1.7.8 2.5.4 3.7-1.6 7-2 10.1-2 3.3 0 5.7.9 8.4 2.5.5.3 1.1.4 1.7.3.6-.1 1.1-.4 1.4-.9 1.5-2.2 3.9-3.5 6.5-3.5 1.2 0 2.3.3 3.3.7C100.3 41.5 105 49 105 57.4 105 66.7 97.5 74.2 88.2 74.2c-2.4 0-4.7-.5-6.8-1.3-.7-.3-1.5-.2-2.1.2-2.3 1.8-5.2 2.8-8.3 2.8-1.9 0-3.7-.4-5.4-1.2"
        fill="white"
      />
    </svg>
  );
}

export const datadogIntegration: ProxyIntegrationConfig = {
  id: "datadog",
  name: "Datadog",
  description:
    "Monitor infrastructure, search logs, query metrics, check monitors, and manage incidents in Datadog",
  icon: DatadogIcon,
  serverUrl:
    "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp?toolsets=core,alerting,apm,dbm,error-tracking,feature-flags,llmobs,networks,security,software-delivery,synthetics",
  keyMode: "org",
  headerKeys: ["DD-API-KEY", "DD-APPLICATION-KEY"],
  fallbackTools: [
    {
      name: "list_dashboards",
      description: "List Datadog dashboards.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_dashboard",
      description: "Get a specific Datadog dashboard by ID.",
      inputSchema: {
        type: "object",
        properties: {
          dashboard_id: { type: "string", description: "Dashboard ID" },
        },
        required: ["dashboard_id"],
      },
    },
    {
      name: "get_monitors",
      description: "List and search Datadog monitors.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Monitor search query" },
        },
      },
    },
    {
      name: "get_logs",
      description: "Search and retrieve log entries from Datadog.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Log search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "list_hosts",
      description: "List infrastructure hosts in Datadog.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_incidents",
      description: "List Datadog incidents.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_incident",
      description: "Get details of a specific Datadog incident.",
      inputSchema: {
        type: "object",
        properties: {
          incident_id: { type: "string", description: "Incident ID" },
        },
        required: ["incident_id"],
      },
    },
    {
      name: "list_metrics",
      description: "List available metrics in Datadog.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_metrics",
      description: "Query metric data points from Datadog.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Metric query" },
        },
        required: ["query"],
      },
    },
    {
      name: "list_spans",
      description: "Search APM trace spans in Datadog.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Span search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_trace",
      description: "Get a specific APM trace from Datadog.",
      inputSchema: {
        type: "object",
        properties: {
          trace_id: { type: "string", description: "Trace ID" },
        },
        required: ["trace_id"],
      },
    },
    {
      name: "list_notebooks",
      description: "List Datadog notebooks.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_events",
      description: "List events in Datadog.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_services",
      description: "List APM services in Datadog.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
};
