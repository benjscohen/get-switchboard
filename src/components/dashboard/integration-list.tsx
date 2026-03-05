"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserKeyForm } from "./user-key-form";
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

export type UserKeyItem = {
  type: "custom-mcp" | "proxy";
  targetId: string;
  name: string;
  description: string;
  icon: ReactNode;
  toolCount: number;
  tools: IntegrationTool[];
  hasPersonalKey: boolean;
  userKeyInstructions: ReactNode | null;
  /** custom-mcp only */
  keyMode?: "shared" | "per_user";
  hasSharedKey?: boolean;
  authType?: string;
};

type LocalItem = {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  toolCount: number;
  tools: IntegrationTool[];
  setupInstructions: ReactNode;
};

type UnifiedItem =
  | { kind: "integration"; data: IntegrationItem; connected: boolean }
  | { kind: "user-key"; data: UserKeyItem; connected: boolean };

function isUserKeyConnected(item: UserKeyItem): boolean {
  if (item.hasPersonalKey) return true;
  if (item.type === "proxy") return false;
  // custom-mcp: check shared key / auth type
  if (item.keyMode === "per_user") return false;
  if (item.hasSharedKey) return true;
  if (item.authType === "bearer") return false;
  return true; // "none" auth = no key needed
}

export function IntegrationList({
  initialIntegrations,
  proxyIntegrations = [],
  userKeyIntegrations = [],
  localIntegrations = [],
  subtitle,
}: {
  initialIntegrations: IntegrationItem[];
  proxyIntegrations?: IntegrationItem[];
  userKeyIntegrations?: UserKeyItem[];
  localIntegrations?: LocalItem[];
  subtitle?: string;
}) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [userKeys, setUserKeys] = useState(userKeyIntegrations);

  const handleDisconnect = (id: string) => {
    setIntegrations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, connected: false } : i))
    );
  };

  const handleUserKeyChange = (
    type: "custom-mcp" | "proxy",
    targetId: string,
    hasKey: boolean
  ) => {
    setUserKeys((prev) =>
      prev.map((i) =>
        i.type === type && i.targetId === targetId
          ? { ...i, hasPersonalKey: hasKey }
          : i
      )
    );
  };

  // Build unified list (excludes local integrations — they get their own section)
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
    ...userKeys.map((i) => ({
      kind: "user-key" as const,
      data: i,
      connected: isUserKeyConnected(i),
    })),
  ];

  // Sort: unconnected first, then connected
  unified.sort((a, b) => Number(a.connected) - Number(b.connected));

  return (
    <>
      <Card hover={false}>
        <h2 className={`text-sm font-medium text-text-secondary ${subtitle ? "mb-1" : "mb-4"}`}>
          Integrations
        </h2>
        {subtitle && (
          <p className="mb-4 text-xs text-text-tertiary">{subtitle}</p>
        )}
        <div className="space-y-3">
          {unified.map((item) => {
            if (item.kind === "integration") {
              return (
                <div key={item.data.id}>
                  <IntegrationRow
                    integration={item.data}
                    onDisconnect={handleDisconnect}
                  />
                </div>
              );
            }

            return (
              <div key={`${item.data.type}:${item.data.targetId}`}>
                <UserKeyRow
                  item={item.data}
                  onKeyChange={handleUserKeyChange}
                />
              </div>
            );
          })}
        </div>
      </Card>

      {localIntegrations.length > 0 && (
        <Card hover={false}>
          <h2 className="text-sm font-medium text-text-secondary mb-1">
            Local Integrations
          </h2>
          <p className="mb-4 text-xs text-text-tertiary">
            These run on your computer and are not managed by Switchboard.
          </p>
          <div className="space-y-3">
            {localIntegrations.map((item) => (
              <LocalRow key={item.id} item={item} />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

/* ── Shared expand/collapse tool list ── */

function ToolGrid({ tools }: { tools: IntegrationTool[] }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="grid gap-2 max-h-64 overflow-y-auto">
        {tools.map((tool) => (
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
  );
}

function ExpandButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
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
  );
}

/* ── Integration Row (OAuth / org-key proxies) ── */

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
            <Badge variant={integration.connected ? "success" : "default"}>
              {integration.connected && <svg className="mr-1 h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              {integration.connected ? "Enabled" : "Not configured"}
            </Badge>
          ) : (
            <>
              <Badge variant={integration.connected ? "success" : "default"}>
                {integration.connected && <svg className="mr-1 h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
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
                <a
                  href={`/api/integrations/connect?integration=${integration.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 cursor-pointer whitespace-nowrap bg-bg-card text-text-primary border border-border hover:border-border-hover hover:bg-bg-hover px-3 py-1.5 text-sm"
                >
                  Connect
                </a>
              )}
            </>
          )}
          <ExpandButton expanded={expanded} onToggle={() => setExpanded(!expanded)} />
        </div>
      </div>

      {integration.id === "google-gmail" && integration.connected && (
        <GmailSenderSettings />
      )}

      {expanded && <ToolGrid tools={integration.tools} />}
    </div>
  );
}

/* ── Gmail Signature Preview (sandboxed iframe) ── */

function SignaturePreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(60);

  const srcdoc = `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; padding: 8px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #333; overflow: hidden; }
  img { max-width: 100%; height: auto; }
  a { color: #1a73e8; pointer-events: none; }
</style></head><body>${html}</body></html>`;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const resize = () => {
      try {
        const h = iframe.contentDocument?.body?.scrollHeight;
        if (h && h > 0) setHeight(h);
      } catch { /* cross-origin fallback */ }
    };

    iframe.addEventListener("load", resize);
    return () => iframe.removeEventListener("load", resize);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-same-origin"
      className="w-full border border-border rounded-md bg-white"
      style={{ height: Math.min(height, 300), overflow: "hidden" }}
      title="Gmail signature preview"
    />
  );
}

/* ── Gmail Sender Settings ── */

function GmailSenderSettings() {
  const [senderName, setSenderName] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [signatureHtml, setSignatureHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/gmail-settings");
      if (res.ok) {
        const data = await res.json();
        setSenderName(data.senderName ?? "");
        setEmail(data.email ?? null);
        setSignatureHtml(data.signatureHtml ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/integrations/gmail-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderName }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs text-text-secondary">Loading sender settings...</p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3 space-y-3">
      <p className="text-xs font-medium text-text-secondary">Sender Settings</p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs text-text-secondary mb-1">
            Display Name {email && <span className="text-text-tertiary">({email})</span>}
          </label>
          <input
            type="text"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="e.g. John Smith"
            className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </Button>
      </div>
      {signatureHtml && (
        <div>
          <p className="text-xs text-text-secondary mb-1">Gmail Signature (auto-appended)</p>
          <SignaturePreview html={signatureHtml} />
        </div>
      )}
    </div>
  );
}

/* ── Unified User-Key Row (per-user proxy + custom MCP) ── */

function UserKeyRow({
  item,
  onKeyChange,
}: {
  item: UserKeyItem;
  onKeyChange: (type: "custom-mcp" | "proxy", targetId: string, hasKey: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRemoveKey() {
    setRemoving(true);
    onKeyChange(item.type, item.targetId, false);
    await fetch(
      `/api/user-keys?type=${item.type}&targetId=${item.targetId}`,
      { method: "DELETE" }
    );
    setRemoving(false);
  }

  // Compute key status
  const keyStatus = item.hasPersonalKey
    ? "personal"
    : item.type === "proxy"
      ? "required"
      : item.keyMode === "per_user"
        ? "required"
        : item.hasSharedKey
          ? "shared"
          : item.authType === "bearer"
            ? "required"
            : "none";

  const defaultIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <path d="M5 7h6M5 9.5h4" />
    </svg>
  );

  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-card text-text-secondary">
          {item.icon ?? defaultIcon}
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
              <Badge variant="success"><svg className="mr-1 h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>Key Configured</Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKeyForm(true)}
              >
                Edit Key
              </Button>
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
            <Badge variant="success"><svg className="mr-1 h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>No Auth</Badge>
          )}
          <ExpandButton expanded={expanded} onToggle={() => setExpanded(!expanded)} />
        </div>
      </div>

      {showKeyForm && (
        <UserKeyForm
          type={item.type}
          targetId={item.targetId}
          targetName={item.name}
          hasExistingKey={item.hasPersonalKey}
          instructions={item.userKeyInstructions}
          onSaved={() => {
            setShowKeyForm(false);
            onKeyChange(item.type, item.targetId, true);
          }}
          onCancel={() => setShowKeyForm(false)}
        />
      )}

      {expanded && <ToolGrid tools={item.tools} />}
    </div>
  );
}

/* ── Local Row ── */

function LocalRow({ item }: { item: LocalItem }) {
  const [expanded, setExpanded] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

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
          <Badge variant="default">Local</Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowSetup(!showSetup)}
          >
            {showSetup ? "Hide Guide" : "Setup Guide"}
          </Button>
          <ExpandButton expanded={expanded} onToggle={() => setExpanded(!expanded)} />
        </div>
      </div>

      {showSetup && (
        <div className="mt-3 border-t border-border pt-3">
          {item.setupInstructions}
        </div>
      )}

      {expanded && <ToolGrid tools={item.tools} />}
    </div>
  );
}
