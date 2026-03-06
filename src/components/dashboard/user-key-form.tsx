"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

function SimpleMarkdown({ text }: { text: string }) {
  const elements = useMemo(() => {
    // Split by markdown link pattern, bold, and italic
    const parts: React.ReactNode[] = [];
    // Process the text segment by segment
    const regex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
      // Add text before this match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      if (match[1] && match[2]) {
        // Link: [text](url)
        parts.push(
          <a
            key={key++}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent/80"
          >
            {match[1]}
          </a>
        );
      } else if (match[3]) {
        // Bold: **text**
        parts.push(<strong key={key++}>{match[3]}</strong>);
      } else if (match[4]) {
        // Italic: *text*
        parts.push(<em key={key++}>{match[4]}</em>);
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  }, [text]);

  return <>{elements}</>;
}

interface UserKeyFormProps {
  type: "custom-mcp" | "proxy";
  targetId: string;
  targetName: string;
  hasExistingKey: boolean;
  instructions?: React.ReactNode;
  /** For custom_headers auth: the header keys the user must provide */
  headerKeys?: string[];
  onSaved: () => void;
  onCancel: () => void;
}

export function UserKeyForm({
  type,
  targetId,
  targetName,
  hasExistingKey,
  instructions,
  headerKeys,
  onSaved,
  onCancel,
}: UserKeyFormProps) {
  const isMultiHeader = headerKeys && headerKeys.length > 0;
  const [apiKey, setApiKey] = useState("");
  const [headerValues, setHeaderValues] = useState<Record<string, string>>(
    () => Object.fromEntries((headerKeys ?? []).map((k) => [k, ""]))
  );
  const [saving, setSaving] = useState(false);

  const canSubmit = isMultiHeader
    ? Object.values(headerValues).some((v) => v.trim())
    : !!apiKey;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload: Record<string, unknown> = { type, targetId };
    if (isMultiHeader) {
      // Filter to only headers that have values
      const hdrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(headerValues)) {
        if (v.trim()) hdrs[k] = v.trim();
      }
      payload.customHeaders = hdrs;
    } else {
      payload.apiKey = apiKey;
    }

    const res = await fetch("/api/user-keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    setApiKey("");
    if (isMultiHeader) setHeaderValues(Object.fromEntries((headerKeys ?? []).map((k) => [k, ""])));
    if (data.discoveredTools > 0) {
      window.location.reload();
    } else {
      onSaved();
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {instructions && (
        <p className="text-sm text-text-secondary mb-3 whitespace-pre-line">
          {typeof instructions === "string" ? (
            <SimpleMarkdown text={instructions} />
          ) : (
            instructions
          )}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-2">
        {isMultiHeader ? (
          <>
            {headerKeys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-secondary w-40 shrink-0 truncate" title={key}>
                  {key}
                </span>
                <input
                  type="password"
                  value={headerValues[key] ?? ""}
                  onChange={(e) => setHeaderValues({ ...headerValues, [key]: e.target.value })}
                  placeholder={hasExistingKey ? "Leave blank to keep existing" : `Value for ${key}`}
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
                />
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" type="submit" disabled={saving || !canSubmit}>
                {saving ? "..." : hasExistingKey ? "Update Headers" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              placeholder={
                hasExistingKey
                  ? "Enter new key to replace existing"
                  : `API key for ${targetName}`
              }
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
            />
            <Button size="sm" type="submit" disabled={saving || !apiKey}>
              {saving ? "..." : hasExistingKey ? "Update Key" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
