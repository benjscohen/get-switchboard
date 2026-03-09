"use client";
import { useState, useRef, useCallback } from "react";

interface ComposeThreadProps {
  onCreated: (id: string) => void;
  onCancel?: () => void;
}

export function ComposeThread({ onCreated, onCancel }: ComposeThreadProps) {
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create thread");
      }

      const { id } = await res.json();
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [prompt, submitting, onCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-4">
        <h2 className="text-sm font-medium text-text-primary">New thread</h2>

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What should the agent work on?"
          rows={4}
          disabled={submitting}
          className="w-full resize-none rounded-lg border border-border bg-bg-card px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          autoFocus
        />

        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}

        <div className="flex items-center justify-between">
          {onCancel ? (
            <button
              onClick={onCancel}
              disabled={submitting}
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || !prompt.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Starting..." : "Start Thread"}
          </button>
        </div>

        <p className="text-xs text-text-tertiary">
          Press {typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent) ? "⌘" : "Ctrl"}+Enter to submit
        </p>
      </div>
    </div>
  );
}
