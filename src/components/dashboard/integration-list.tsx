"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
};

export function IntegrationList({
  integrations,
}: {
  integrations: IntegrationItem[];
}) {
  return (
    <Card hover={false}>
      <h2 className="mb-4 text-sm font-medium text-text-secondary">
        Integrations
      </h2>
      <div className="space-y-3">
        {integrations.map((integration) => (
          <IntegrationRow key={integration.id} integration={integration} />
        ))}
      </div>
    </Card>
  );
}

function IntegrationRow({ integration }: { integration: IntegrationItem }) {
  const [expanded, setExpanded] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const router = useRouter();
  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: integration.id }),
      });
      router.refresh();
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
