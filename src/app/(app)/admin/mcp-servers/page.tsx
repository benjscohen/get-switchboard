"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { McpServerForm } from "@/components/admin/mcp-server-form";
import { McpToolList } from "@/components/admin/mcp-tool-list";

interface McpTool {
  id: string;
  toolName: string;
  description: string;
  enabled: boolean;
}

interface McpServer {
  id: string;
  name: string;
  slug: string;
  description: string;
  serverUrl: string;
  authType: string;
  hasSharedKey: boolean;
  keyMode: "shared" | "per_user";
  userKeyInstructions: string | null;
  status: string;
  lastError: string | null;
  lastDiscoveredAt: string | null;
  createdAt: string;
  tools: McpTool[];
}

export default function McpServersPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchServers = useCallback(async () => {
    const res = await fetch("/api/admin/mcp-servers");
    if (res.ok) {
      setServers(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDiscover(id: string) {
    await fetch(`/api/admin/mcp-servers/${id}/discover`, { method: "POST" });
    fetchServers();
  }

  async function handleToggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    await fetch("/api/admin/mcp-servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    fetchServers();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this MCP server? All tool registrations will be lost.")) return;
    await fetch(`/api/admin/mcp-servers?id=${id}`, { method: "DELETE" });
    fetchServers();
  }

  if (loading) {
    return <p className="text-text-tertiary">Loading MCP servers...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">MCP Servers</h2>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add MCP Server"}
        </Button>
      </div>

      {showForm && (
        <Card hover={false}>
          <McpServerForm
            onCreated={() => {
              setShowForm(false);
              fetchServers();
            }}
            onCancel={() => setShowForm(false)}
          />
        </Card>
      )}

      {servers.length === 0 && !showForm && (
        <p className="text-sm text-text-secondary">
          No custom MCP servers configured yet.
        </p>
      )}

      <div className="space-y-3">
        {servers.map((server) => {
          const enabledCount = server.tools.filter((t) => t.enabled).length;
          const isExpanded = expanded.has(server.id);

          return (
            <Card key={server.id} hover={false} className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{server.name}</p>
                    <code className="text-xs text-text-secondary font-mono">
                      {server.slug}
                    </code>
                    <Badge
                      variant={server.status === "active" ? "accent" : "default"}
                    >
                      {server.status}
                    </Badge>
                    {server.authType === "bearer" && (
                      <span className="text-xs text-text-secondary">
                        {server.keyMode === "per_user"
                          ? "Per-user keys"
                          : server.hasSharedKey
                            ? "Shared key"
                            : "No key"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary truncate mt-0.5">
                    {server.serverUrl}
                  </p>
                  {server.lastError && (
                    <p className="text-xs text-red-500 mt-1">
                      {server.lastError}
                    </p>
                  )}
                </div>

                <span className="text-xs text-text-secondary whitespace-nowrap">
                  {enabledCount}/{server.tools.length} tools
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDiscover(server.id)}
                    title="Refresh tools"
                  >
                    Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleToggleStatus(server.id, server.status)
                    }
                  >
                    {server.status === "active" ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(server.id)}
                  >
                    Remove
                  </Button>
                  <button
                    onClick={() => toggleExpand(server.id)}
                    className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </button>
                </div>
              </div>

              {isExpanded && server.tools.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <McpToolList
                    serverId={server.id}
                    tools={server.tools}
                    onUpdated={fetchServers}
                  />
                </div>
              )}

              {isExpanded && server.tools.length === 0 && (
                <p className="mt-3 border-t border-border pt-3 text-xs text-text-secondary">
                  No tools discovered. Click &quot;Refresh&quot; to discover tools.
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
