"use client";
import { useState, useCallback } from "react";
import { ThreadInput } from "./thread-input";
import { AGENT_MODELS } from "@/lib/agent-models";

interface ComposeThreadProps {
  onCreated: (id: string) => void;
  onCancel?: () => void;
}

export function ComposeThread({ onCreated, onCancel }: ComposeThreadProps) {
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("");

  const handleSubmit = useCallback(
    async (prompt: string, files: File[]) => {
      setError(null);

      try {
        let res: Response;

        if (files.length > 0) {
          const formData = new FormData();
          formData.append("prompt", prompt);
          if (model) formData.append("model", model);
          for (const file of files) {
            formData.append("files", file);
          }
          res = await fetch("/api/threads", { method: "POST", body: formData });
        } else {
          res = await fetch("/api/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, ...(model ? { model } : {}) }),
          });
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to create thread");
        }

        const { id } = await res.json();
        onCreated(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    },
    [onCreated, model],
  );

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">New thread</h2>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text-secondary"
          >
            <option value="">Default model</option>
            {AGENT_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <ThreadInput
          placeholder="What should the agent work on?"
          submitLabel="Start Thread"
          loadingLabel="Starting..."
          onSubmit={handleSubmit}
          autoFocus
          minRows={4}
        />

        {error && <p className="text-xs text-red-500">{error}</p>}

        {onCancel && (
          <button
            onClick={onCancel}
            className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
