"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FileData {
  id?: string;
  path: string;
  content: string | null;
  metadata: Record<string, unknown>;
}

interface FileEditorProps {
  file?: FileData;
  currentPath?: string;
  onSave: (data: { path: string; content: string; metadata?: Record<string, unknown> }) => Promise<void>;
  onClose: () => void;
}

export function FileEditor({ file, currentPath, onSave, onClose }: FileEditorProps) {
  const isEdit = !!file?.id;
  const defaultPath = file?.path ?? (currentPath === "/" ? "/" : currentPath + "/");
  const [path, setPath] = useState(defaultPath);
  const [content, setContent] = useState(file?.content ?? "");
  const [metadataStr, setMetadataStr] = useState(
    file?.metadata && Object.keys(file.metadata).length > 0
      ? JSON.stringify(file.metadata, null, 2)
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!path.trim() || !content.trim()) return;

    let metadata: Record<string, unknown> | undefined;
    if (metadataStr.trim()) {
      try {
        metadata = JSON.parse(metadataStr);
        setMetaError(null);
      } catch {
        setMetaError("Invalid JSON");
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({ path: path.trim(), content, metadata });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-border bg-bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">
            {isEdit ? "Edit File" : "New File"}
          </h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Path</label>
            <Input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              readOnly={isEdit}
              placeholder="/projects/acme/notes.md"
              className="font-mono"
              disabled={isEdit}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="File content..."
              rows={10}
              className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm font-mono placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Metadata (optional JSON)
            </label>
            <textarea
              value={metadataStr}
              onChange={(e) => {
                setMetadataStr(e.target.value);
                setMetaError(null);
              }}
              placeholder='{"tag": "value"}'
              rows={3}
              className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm font-mono placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            />
            {metaError && (
              <p className="mt-1 text-xs text-red-500">{metaError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !path.trim() || !content.trim()}>
              {saving ? "Saving..." : isEdit ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
