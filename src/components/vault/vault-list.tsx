"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VaultSecret } from "@/app/(app)/vault/page";

const CATEGORY_LABELS: Record<string, string> = {
  api_key: "API Key",
  credential: "Credential",
  payment: "Payment",
  note: "Note",
  other: "Other",
};

interface VaultListProps {
  secrets: VaultSecret[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function VaultList({ secrets, onEdit, onDelete }: VaultListProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return secrets.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter && s.category !== categoryFilter) return false;
      return true;
    });
  }, [secrets, search, categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set(secrets.map((s) => s.category));
    return Array.from(set).sort();
  }, [secrets]);

  if (secrets.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
        <p className="text-text-secondary">No secrets yet. Create one to get started.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder="Search secrets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c] ?? c}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map((secret) => (
          <Card key={secret.id} hover={false} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{secret.name}</h3>
                  <Badge variant={secret.category === "credential" ? "accent" : "default"}>
                    {CATEGORY_LABELS[secret.category] ?? secret.category}
                  </Badge>
                  {secret.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-bg-hover px-2 py-0.5 text-xs text-text-tertiary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                {secret.description && (
                  <p className="mt-1 text-xs text-text-secondary">{secret.description}</p>
                )}
                <p className="mt-1 text-xs text-text-tertiary">
                  Fields: {secret.fieldNames.map((f) => f.name).join(", ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" onClick={() => onEdit(secret.id)}>
                  View
                </Button>
                {confirmDelete === secret.id ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-400"
                      onClick={() => {
                        onDelete(secret.id);
                        setConfirmDelete(null);
                      }}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-400"
                    onClick={() => setConfirmDelete(secret.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-4 text-center text-sm text-text-secondary">
          No secrets match your search.
        </p>
      )}
    </div>
  );
}
