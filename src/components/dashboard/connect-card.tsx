"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeBlock } from "@/components/ui/code-block";
import { Tabs, TabList, TabTrigger, TabPanel } from "@/components/ui/tabs";
import { MCP_CLIENTS, generateSnippet, generatePrompt } from "@/lib/mcp-snippets";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { revokeApiKey } from "@/lib/api";
import { PermissionsForm } from "./permissions-form";

function CopyButton({
  text,
  label,
  variant = "secondary",
}: {
  text: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <Button size="sm" variant={variant} onClick={() => copy(text)}>
      {copied ? (
        <span className="inline-flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied!
        </span>
      ) : label}
    </Button>
  );
}

interface ApiKeyEntry {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  scope?: string;
  expiresAt: string;
  permissions?: Record<string, string[] | null> | null;
  isAgentKey?: boolean;
}

type AvailableIntegration = {
  id: string;
  name: string;
  tools: { name: string; description: string }[];
};

function permissionsSummary(k: ApiKeyEntry): string | null {
  if (!k.permissions) return null;
  const ids = Object.keys(k.permissions);
  if (ids.length === 0) return "No integrations";
  if (ids.length <= 2) return ids.join(", ");
  return `${ids.length} integrations`;
}

function getExpiryInfo(expiresAt: string): { label: string; className: string } {
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) return { label: "Expired", className: "text-red-400" };
  if (daysLeft <= 14) return { label: `Expires in ${daysLeft}d`, className: "text-amber-500" };
  return { label: `Expires ${new Date(expiresAt).toLocaleDateString()}`, className: "text-text-tertiary" };
}

const SCOPE_LABELS: Record<string, string> = {
  full: "Full access",
  read_write: "Read + Write",
  read_only: "Read only",
};

export function ConnectCard({
  origin,
  initialKeys,
  availableIntegrations = [],
  connectionStats,
}: {
  origin: string;
  initialKeys: ApiKeyEntry[];
  availableIntegrations?: AvailableIntegration[];
  connectionStats?: { connected: number; total: number };
}) {
  const [keys, setKeys] = useState<ApiKeyEntry[]>(initialKeys);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScope, setNewKeyScope] = useState("full");
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manageExpanded, setManageExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [permMode, setPermMode] = useState<"all" | "specific">("all");
  const [permissions, setPermissions] = useState<Record<string, string[] | null>>({});

  const advancedSection = availableIntegrations.length > 0 && (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAdvancedOpen(!advancedOpen)}
        className="inline-flex items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-primary cursor-pointer"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${advancedOpen ? "rotate-90" : ""}`}
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        Restrict to specific integrations or tools
      </button>
      {advancedOpen && (
        <div className="mt-2">
          <PermissionsForm
            mode={permMode}
            onModeChange={setPermMode}
            permissions={permissions}
            onPermissionsChange={setPermissions}
            integrations={availableIntegrations}
            radioName="perm-mode"
          />
        </div>
      )}
    </div>
  );

  const activeKeys = keys.filter((k) => !k.revokedAt && new Date(k.expiresAt) > new Date());
  const hasActiveKeys = activeKeys.length > 0;

  async function generate() {
    setLoading(true);
    const effectivePermissions = advancedOpen && permMode === "specific" ? permissions : null;
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newKeyName || "Default",
        scope: newKeyScope,
        permissions: effectivePermissions,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewRawKey(data.key);
      setNewKeyName("");
      setNewKeyScope("full");
      setAdvancedOpen(false);
      setPermMode("all");
      setPermissions({});
      setKeys((prev) => [
        {
          id: crypto.randomUUID(),
          name: data.name,
          keyPrefix: data.prefix,
          lastUsedAt: null,
          createdAt: new Date().toISOString(),
          revokedAt: null,
          scope: data.scope ?? "full",
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          permissions: data.permissions ?? null,
        },
        ...prev,
      ]);
    } else {
      console.error("Failed to generate API key:", res.status);
    }
    setLoading(false);
  }

  async function revoke(id: string) {
    setKeys((prev) =>
      prev.map((k) =>
        k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k
      )
    );
    await revokeApiKey(id);
  }

  // Mode 2: key was just generated — show snippets
  if (newRawKey) {
    return (
      <Card hover={false}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-secondary">
            Connect your MCP client
          </h2>
          <button
            onClick={() => setNewRawKey(null)}
            className="inline-flex items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-text-primary cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to keys
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 p-3">
          <p className="text-xs font-medium text-accent">
            Copy your config now — the key won&apos;t be shown again
          </p>
        </div>

        <Tabs defaultTab={MCP_CLIENTS[0].id} className="space-y-3">
          <TabList>
            {MCP_CLIENTS.map((c) => (
              <TabTrigger key={c.id} id={c.id}>
                {c.label}
              </TabTrigger>
            ))}
          </TabList>
          {MCP_CLIENTS.map((c) => (
            <TabPanel key={c.id} id={c.id}>
              <p className="mb-2 text-xs text-text-tertiary">{c.hint}</p>
              <CodeBlock code={generateSnippet(origin, newRawKey, c.id)} hideCopy />
              <div className="mt-3 flex items-center gap-2">
                <CopyButton
                  text={generatePrompt(origin, newRawKey, c.id)}
                  label="Copy with instructions"
                  variant="primary"
                />
                <CopyButton
                  text={generateSnippet(origin, newRawKey, c.id)}
                  label="Copy config only"
                  variant="ghost"
                />
              </div>
            </TabPanel>
          ))}
        </Tabs>
      </Card>
    );
  }

  // Mode 1: First visit (no active keys) — Get Started
  if (!hasActiveKeys) {
    return (
      <Card hover={false}>
        <h2 className="mb-4 text-sm font-medium text-text-secondary">
          Get Started
        </h2>

        <div className="space-y-4">
          {/* Step 1 — active */}
          <div className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-medium">
              1
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium mb-2">Generate an API key</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Key name (optional)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="max-w-xs"
                />
                <select
                  value={newKeyScope}
                  onChange={(e) => setNewKeyScope(e.target.value)}
                  className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
                >
                  <option value="full">Full access</option>
                  <option value="read_write">Read + Write</option>
                  <option value="read_only">Read only</option>
                </select>
                <Button size="sm" onClick={generate} disabled={loading}>
                  {loading ? "Generating..." : "Generate Key"}
                </Button>
              </div>
              {advancedSection}
            </div>
          </div>

          {/* Step 2 — dimmed */}
          <div className="flex gap-3 opacity-50">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-medium">
              2
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Add to your MCP client</p>
              <p className="text-xs text-text-tertiary">
                You&apos;ll get a config snippet to copy after generating a key.
              </p>
            </div>
          </div>

          {/* Step 3 — dimmed */}
          <div className="flex gap-3 opacity-50">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-medium">
              3
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Connect services below</p>
              <p className="text-xs text-text-tertiary">
                Link your accounts to make their tools available through MCP.
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Mode 3: Returning user (has active keys) — compact status bar
  return (
    <div className="rounded-xl border border-border bg-bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-green-500">
            <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-medium">MCP client connected</span>
          <span className="text-text-tertiary">·</span>
          <span className="text-text-tertiary">
            {activeKeys.length} active key{activeKeys.length !== 1 && "s"}
          </span>
          {activeKeys.some((k) => {
            const daysLeft = Math.ceil((new Date(k.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysLeft > 0 && daysLeft <= 14;
          }) && (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-amber-500">key expiring soon</span>
            </>
          )}
          {connectionStats && connectionStats.connected < connectionStats.total && (
            <>
              <span className="text-text-tertiary">·</span>
              <span className="text-amber-500">
                {connectionStats.connected} of {connectionStats.total} services connected
              </span>
            </>
          )}
        </div>
        <button
          onClick={() => setManageExpanded(!manageExpanded)}
          className="inline-flex items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-text-primary cursor-pointer"
        >
          Manage keys
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${manageExpanded ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>

      {manageExpanded && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-3 flex gap-2">
            <Input
              placeholder="Key name (optional)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="max-w-xs"
            />
            <select
              value={newKeyScope}
              onChange={(e) => setNewKeyScope(e.target.value)}
              className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
            >
              <option value="full">Full access</option>
              <option value="read_write">Read + Write</option>
              <option value="read_only">Read only</option>
            </select>
            <Button size="sm" onClick={generate} disabled={loading}>
              {loading ? "Generating..." : "New Key"}
            </Button>
          </div>
          {advancedSection}

          <div className="mt-3 space-y-2">
            {keys.map((k) => {
              const expired = !k.revokedAt && new Date(k.expiresAt) <= new Date();
              const inactive = !!k.revokedAt || expired;
              const expiry = getExpiryInfo(k.expiresAt);
              return (
                <div
                  key={k.id}
                  className={`flex items-center justify-between rounded-lg bg-bg px-3 py-2${inactive ? " opacity-50" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {k.name}
                      {k.isAgentKey && !k.revokedAt && !expired && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                          Agent
                        </span>
                      )}
                      {k.revokedAt && (
                        <span className="ml-2 text-xs font-normal text-red-400">
                          Revoked
                        </span>
                      )}
                      {expired && !k.revokedAt && (
                        <span className="ml-2 text-xs font-normal text-red-400">
                          Expired
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-text-tertiary">
                      {k.keyPrefix}...
                      {k.scope && k.scope !== "full" && (
                        <span className="ml-2 font-sans text-amber-500">
                          {SCOPE_LABELS[k.scope] ?? k.scope}
                        </span>
                      )}
                      {permissionsSummary(k) && (
                        <span className="ml-2 font-sans text-text-tertiary">
                          · {permissionsSummary(k)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {!k.revokedAt && (
                      <span className={`text-xs ${expiry.className}`}>
                        {expiry.label}
                      </span>
                    )}
                    {k.revokedAt && (
                      <span className="text-xs text-text-tertiary">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </span>
                    )}
                    {!inactive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revoke(k.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
