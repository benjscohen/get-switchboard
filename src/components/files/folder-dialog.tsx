"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEscapeKey } from "@/hooks/use-escape-key";

interface FolderDialogProps {
  parentPath: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function FolderDialog({ parentPath, onSubmit, onClose }: FolderDialogProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEscapeKey(onClose);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-bg-card p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">New Folder</h2>
        <p className="mb-4 text-sm text-text-secondary">
          Create a folder in <span className="font-mono">{parentPath}</span>
        </p>
        <form onSubmit={handleSubmit}>
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Folder name"
            required
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
