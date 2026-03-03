"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function EndpointCard({ origin }: { origin: string }) {
  const [copied, setCopied] = useState(false);
  const endpoint = `${origin}/api/mcp`;

  function copy() {
    navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card hover={false}>
      <h2 className="mb-1 text-sm font-medium text-text-secondary">
        MCP Endpoint
      </h2>
      <div className="flex items-center gap-3">
        <code className="flex-1 truncate rounded-lg bg-bg px-3 py-2 font-mono text-sm text-text-primary">
          {endpoint}
        </code>
        <Button size="sm" variant="secondary" onClick={copy}>
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-text-tertiary">
        Add this URL to your MCP client (Claude, Cursor, etc.) with your API key
        as the Bearer token.
      </p>
    </Card>
  );
}
