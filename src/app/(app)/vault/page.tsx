"use client";

import { useState, useEffect, useCallback } from "react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { VaultList } from "@/components/vault/vault-list";
import { VaultForm } from "@/components/vault/vault-form";

interface SecretFieldMeta {
  name: string;
  sensitive: boolean;
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
}

export interface VaultSecretDetail extends VaultSecret {
  fields: Array<{ name: string; value: string; sensitive: boolean }>;
}

export default function VaultPage() {
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VaultSecretDetail | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchSecrets = useCallback(async () => {
    const res = await fetch("/api/vault");
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
  }) {
    if (editing) {
      await fetch(`/api/vault/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } else {
      await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setEditing(null);
    setCreating(false);
    fetchSecrets();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/vault/${id}`, { method: "DELETE" });
    fetchSecrets();
  }

  return (
    <Container className="py-10">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vault</h1>
        <Button size="sm" onClick={() => setCreating(true)}>
          + New Secret
        </Button>
      </div>
      <p className="mb-8 text-sm text-text-secondary">
        Securely store API keys, credentials, and sensitive data. Accessible via MCP tools.
      </p>

      {loading && (
        <div className="space-y-3">
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
        <VaultList
          secrets={secrets}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
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
    </Container>
  );
}
