"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export function ApiKeysCard({ userId }: { userId: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    const res = await fetch(`/api/admin/users/${userId}/api-keys`);
    if (res.ok) {
      setKeys(await res.json());
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function revoke(keyId: string) {
    if (!confirm("Revoke this API key? The user will no longer be able to authenticate with it.")) return;
    setRevokingId(keyId);
    const res = await fetch(`/api/admin/users/${userId}/api-keys?keyId=${keyId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert("Failed to revoke key");
    }
    setRevokingId(null);
    fetchKeys();
  }

  if (loading) {
    return <p className="text-sm text-text-tertiary">Loading API keys...</p>;
  }

  if (keys.length === 0) {
    return <p className="text-sm text-text-tertiary">No API keys</p>;
  }

  return (
    <div className="space-y-2">
      {keys.map((k) => (
        <div
          key={k.id}
          className={`flex items-center justify-between rounded-lg bg-bg px-3 py-2${k.revokedAt ? " opacity-50" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {k.name}
              {k.revokedAt && (
                <span className="ml-2 text-xs font-normal text-red-400">
                  Revoked
                </span>
              )}
            </p>
            <p className="font-mono text-xs text-text-tertiary">
              {k.keyPrefix}...
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs text-text-tertiary">
              <div>Created {new Date(k.createdAt).toLocaleDateString()}</div>
              {k.lastUsedAt && (
                <div>Last used {new Date(k.lastUsedAt).toLocaleDateString()}</div>
              )}
            </div>
            {!k.revokedAt && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:bg-red-500/10"
                onClick={() => revoke(k.id)}
                disabled={revokingId === k.id}
              >
                {revokingId === k.id ? "Revoking..." : "Revoke"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
