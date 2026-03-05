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
  onSaved: () => void;
  onCancel: () => void;
}

export function UserKeyForm({
  type,
  targetId,
  targetName,
  hasExistingKey,
  instructions,
  onSaved,
  onCancel,
}: UserKeyFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/user-keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, targetId, apiKey }),
    });
    const data = await res.json();
    setSaving(false);
    setApiKey("");
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
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
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
      </form>
    </div>
  );
}
