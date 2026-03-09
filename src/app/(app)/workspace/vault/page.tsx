"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { VaultList } from "@/components/vault/vault-list";
import { VaultForm } from "@/components/vault/vault-form";
import { VaultShareModal } from "@/components/vault/vault-share-modal";

interface SecretFieldMeta {
  name: string;
  sensitive: boolean;
}

export interface ShareSummary {
  users: number;
  teams: number;
  organizations: number;
}

export interface VaultSecret {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  fieldNames: SecretFieldMeta[];
  createdAt: string;
  updatedAt: string;
  ownership?: "owned" | "shared";
  sharedBy?: string;
  shareSummary?: ShareSummary;
}

export interface VaultSecretDetail extends VaultSecret {
  fields: Array<{ name: string; value: string; sensitive: boolean }>;
}

export default function VaultPage() {
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VaultSecretDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<{ id: string; name: string } | null>(null);

  const fetchSecrets = useCallback(async () => {
    const res = await fetch("/api/vault?include=all");
    if (res.ok) setSecrets(await res.json());
  }, []);

  useEffect(() => {
    fetchSecrets().then(() => setLoading(false));
  }, [fetchSecrets]);

  async function handleEdit(id: string) {
    const res = await fetch(`/api/vault/${id}`);
    if (res.ok) setEditing(await res.json());
  }

  async function handleSave(data: {
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    fields: Array<{ name: string; value: string; sensitive?: boolean }>;
  }): Promise<{ ok: boolean; error?: string }> {
    const res = editing
      ? await fetch(`/api/vault/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      : await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || "Failed to save secret" };
    }

    setEditing(null);
    setCreating(false);
    fetchSecrets();
    return { ok: true };
  }

  async function handleDelete(id: string) {
    await fetch(`/api/vault/${id}`, { method: "DELETE" });
    fetchSecrets();
  }

  function handleShare(id: string, name: string) {
    setSharing({ id, name });
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Securely store API keys, credentials, and sensitive data. Share with teammates, teams, or the org.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          + New Secret
        </Button>
      </div>

      {loading && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg-card p-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-bg-hover" />
                  <div className="h-3 w-48 rounded bg-bg-hover" />
                </div>
                <div className="h-8 w-20 rounded bg-bg-hover" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div className="mt-6">
          <VaultList
            secrets={secrets}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onShare={handleShare}
          />
        </div>
      )}

      {(creating || editing) && (
        <VaultForm
          secret={editing ?? undefined}
          onSave={handleSave}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {sharing && (
        <VaultShareModal
          secretId={sharing.id}
          secretName={sharing.name}
          onClose={() => {
            setSharing(null);
            fetchSecrets();
          }}
        />
      )}
    </>
  );
}
