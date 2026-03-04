"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomMcpKeyForm } from "./custom-mcp-key-form";
import type { ReactNode } from "react";

type IntegrationTool = {
  name: string;
  description: string;
};

type IntegrationItem = {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  toolCount: number;
  tools: IntegrationTool[];
  connected: boolean;
  kind: "builtin" | "custom-mcp" | "native-proxy";
};

type PerUserProxyItem = {
  integrationId: string;
  name: string;
  description: string;
  icon: ReactNode;
  toolCount: number;
  tools: IntegrationTool[];
  hasPersonalKey: boolean;
  userKeyInstructions: ReactNode | null;
};

type CustomMcpItem = IntegrationItem & {
  serverId: string;
  authType: string;
  keyMode: "shared" | "per_user";
  userKeyInstructions: ReactNode | null;
  hasSharedKey: boolean;
  hasPersonalKey: boolean;
};

type UnifiedItem =
  | { kind: "integration"; data: IntegrationItem; connected: boolean }
  | { kind: "per-user-proxy"; data: PerUserProxyItem; connected: boolean }
  | { kind: "custom-mcp"; data: CustomMcpItem; connected: boolean };

function isCustomMcpConnected(item: CustomMcpItem): boolean {
  if (item.hasPersonalKey) return true;
  if (item.keyMode === "per_user") return false;
  if (item.hasSharedKey) return true;
  if (item.authType === "bearer") return false;
  return true; // "none" auth = no key needed
}

export function IntegrationList({
  initialIntegrations,
  proxyIntegrations = [],
  perUserProxyIntegrations = [],
  initialCustomIntegrations = [],
  subtitle,
}: {
  initialIntegrations: IntegrationItem[];
  proxyIntegrations?: IntegrationItem[];
  perUserProxyIntegrations?: PerUserProxyItem[];
  initialCustomIntegrations?: CustomMcpItem[];
  subtitle?: string;
}) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [customIntegrations, setCustomIntegrations] = useState(initialCustomIntegrations);
  const [perUserProxies, setPerUserProxies] = useState(perUserProxyIntegrations);

  const handleDisconnect = (id: string) => {
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, connected: false } : i))
    );
  };

  const handleRemoveKey = (serverId: string) => {
    setCustomIntegrations((prev) =>
      prev.map((i) =>
        i.serverId === serverId ? { ...i, hasPersonalKey: false } : i
      )
    );
  };

  const handleAddKey = (serverId: string) => {
    setCustomIntegrations((prev) =>
      prev.map((i) =>
        i.serverId === serverId ? { ...i, hasPersonalKey: true } : i
      )
    );
  };

  const handleProxyKeyChange = (integrationId: string, hasKey: boolean) => {
    setPerUserProxies((prev) =>
      prev.map((i) =>
        i.integrationId === integrationId ? { ...i, hasPersonalKey: hasKey } : i
      )
    );
  };

  // Build unified list
  const unified: UnifiedItem[] = [
    ...integrations.map((i) => ({
      kind: "integration" as const,
      data: i,
      connected: i.connected,
    })),
    ...proxyIntegrations.map((i) => ({
      kind: "integration" as const,
      data: i,
      connected: i.connected,
    })),
    ...perUserProxies.map((i) => ({
      kind: "per-user-proxy" as const,
      data: i,
      connected: i.hasPersonalKey,
    })),
    ...customIntegrations.map((i) => ({
      kind: "custom-mcp" as const,
      data: i,
      connected: isCustomMcpConnected(i),
    })),
  ];

  // Sort: unconnected first, then connected
  unified.sort((a, b) => Number(a.connected) - Number(b.connected));

  return (
    <Card hover={false}>
      <h2 className={`text-sm font-medium text-text-secondary ${subtitle ? "mb-1" : "mb-4"}`}>
        Integrations
      </h2>
      {subtitle && (
        <p className="mb-4 text-xs text-text-tertiary">{subtitle}</p>
      )}
      <div className="space-y-3">
        {unified.map((item) => {
          const dimClass = item.connected
            ? "opacity-50 hover:opacity-100 transition-opacity"
            : "";

          if (item.kind === "integration") {
            return (
              <div key={item.data.id} className={dimClass}>
                <IntegrationRow
                  integration={item.data}
                  onDisconnect={handleDisconnect}
                />
              </div>
            );
          }

          if (item.kind === "per-user-proxy") {
            return (
              <div key={item.data.integrationId} className={dimClass}>
                <PerUserProxyRow
                  item={item.data}
                  onKeyChange={handleProxyKeyChange}
                />
              </div>
            );
          }

          // custom-mcp
          return (
            <div key={item.data.id} className={dimClass}>
              <CustomMcpRow
                item={item.data}
                onRemoveKey={handleRemoveKey}
                onAddKey={handleAddKey}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function IntegrationRow({
  integration,
  onDisconnect,
}: {
  integration: IntegrationItem;
  onDisconnect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  async function handleDisconnect() {
    setDisconnecting(true);
    onDisconnect?.(integration.id);
    try {
      await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: integration.id }),
      });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-card">
          {integration.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{integration.name}</p>
            <span className="text-xs text-text-secondary">
              {integration.toolCount} tools
            </span>
          </div>
          <p className="text-xs text-text-secondary truncate">
            {integration.description}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {integration.kind === "native-proxy" ? (
            <Badge variant={integration.connected ? "accent" : "default"}>
              {integration.connected ? "Enabled" : "Not configured"}
            </Badge>
          ) : (
            <>
              <Badge variant={integration.connected ? "accent" : "default"}>
                {integration.connected ? "Connected" : "Not connected"}
              </Badge>
              {integration.connected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? "..." : "Disconnect"}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  href={`/api/integrations/connect?integration=${integration.id}`}
                >
                  Connect
                </Button>
              )}
            </>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
            aria-label={expanded ? "Collapse tools" : "Expand tools"}
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
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="grid gap-2 max-h-64 overflow-y-auto">
            {integration.tools.map((tool) => (
              <div key={tool.name} className="flex gap-3 text-xs">
                <code className="shrink-0 text-accent font-mono">
                  {tool.name}
                </code>
                <span className="text-text-secondary truncate">
                  {tool.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PerUserProxyRow({
  item,
  onKeyChange,
}: {
  item: PerUserProxyItem;
  onKeyChange: (integrationId: string, hasKey: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleRemoveKey() {
    setRemoving(true);
    onKeyChange(item.integrationId, false);
    await fetch(`/api/proxy-keys?integrationId=${item.integrationId}`, {
      method: "DELETE",
    });
    setRemoving(false);
  }

  async function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/proxy-keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationId: item.integrationId, apiKey }),
    });
    setSaving(false);
    setApiKey("");
    setShowKeyForm(false);
    onKeyChange(item.integrationId, true);
  }

  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-card">
          {item.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{item.name}</p>
            <span className="text-xs text-text-secondary">
              {item.toolCount} tools
            </span>
          </div>
          <p className="text-xs text-text-secondary truncate">
            {item.description}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.hasPersonalKey ? (
            <>
              <Badge variant="accent">Key Configured</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveKey}
                disabled={removing}
              >
                {removing ? "..." : "Remove Key"}
              </Button>
            </>
          ) : (
            <>
              <Badge variant="default">Key Required</Badge>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowKeyForm(true)}
              >
                Add Key
              </Button>
            </>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
            aria-label={expanded ? "Collapse tools" : "Expand tools"}
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
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>

      {showKeyForm && (
        <div className="mt-3 border-t border-border pt-3">
          {item.userKeyInstructions && (
            <p className="text-sm text-text-secondary mb-3 whitespace-pre-line">
              {item.userKeyInstructions}
            </p>
          )}
          <form onSubmit={handleSaveKey} className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              placeholder={`API key for ${item.name}`}
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
            />
            <Button size="sm" type="submit" disabled={saving || !apiKey}>
              {saving ? "..." : "Save"}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setShowKeyForm(false)}>
              Cancel
            </Button>
          </form>
        </div>
      )}

      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="grid gap-2 max-h-64 overflow-y-auto">
            {item.tools.map((tool) => (
              <div key={tool.name} className="flex gap-3 text-xs">
                <code className="shrink-0 text-accent font-mono">
                  {tool.name}
                </code>
                <span className="text-text-secondary truncate">
                  {tool.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomMcpRow({
  item,
  onRemoveKey,
  onAddKey,
}: {
  item: CustomMcpItem;
  onRemoveKey?: (serverId: string) => void;
  onAddKey?: (serverId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRemoveKey() {
    setRemoving(true);
    onRemoveKey?.(item.serverId);
    await fetch(`/api/mcp-keys?serverId=${item.serverId}`, {
      method: "DELETE",
    });
    setRemoving(false);
  }

  const keyStatus = item.hasPersonalKey
    ? "personal"
    : item.keyMode === "per_user"
      ? "required"
      : item.hasSharedKey
        ? "shared"
        : item.authType === "bearer"
          ? "required"
          : "none";

  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-card text-text-secondary">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="12" height="10" rx="2" />
            <path d="M5 7h6M5 9.5h4" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{item.name}</p>
            <span className="text-xs text-text-secondary">
              {item.toolCount} tools
            </span>
          </div>
          <p className="text-xs text-text-secondary truncate">
            {item.description}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {keyStatus === "personal" && (
            <>
              <Badge variant="accent">Key Configured</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveKey}
                disabled={removing}
              >
                {removing ? "..." : "Remove Key"}
              </Button>
            </>
          )}
          {keyStatus === "shared" && (
            <>
              <Badge variant="default">Using Shared Key</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKeyForm(true)}
              >
                Add Your Key
              </Button>
            </>
          )}
          {keyStatus === "required" && (
            <>
              <Badge variant="default">Key Required</Badge>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowKeyForm(true)}
              >
                Add Key
              </Button>
            </>
          )}
          {keyStatus === "none" && (
            <Badge variant="accent">No Auth</Badge>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
            aria-label={expanded ? "Collapse tools" : "Expand tools"}
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
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </div>
      </div>

      {showKeyForm && (
        <div className="mt-3 border-t border-border pt-3">
          {item.userKeyInstructions && (
            <p className="text-sm text-text-secondary mb-3 whitespace-pre-line">
              {item.userKeyInstructions}
            </p>
          )}
          <CustomMcpKeyForm
            serverId={item.serverId}
            serverName={item.name}
            onDone={() => {
              setShowKeyForm(false);
              onAddKey?.(item.serverId);
            }}
          />
        </div>
      )}

      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="grid gap-2 max-h-64 overflow-y-auto">
            {item.tools.map((tool) => (
              <div key={tool.name} className="flex gap-3 text-xs">
                <code className="shrink-0 text-accent font-mono">
                  {tool.name}
                </code>
                <span className="text-text-secondary truncate">
                  {tool.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
