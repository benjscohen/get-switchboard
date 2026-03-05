"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Domain {
  id: string;
  domain: string;
  isPrimary: boolean;
}

interface DomainManagerProps {
  domains: Domain[];
}

export function DomainManager({ domains }: DomainManagerProps) {
  const router = useRouter();
  const [newDomain, setNewDomain] = useState("");

  async function addDomain() {
    if (!newDomain.trim()) return;
    const res = await fetch("/api/org/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: newDomain.trim() }),
    });
    if (res.ok) {
      setNewDomain("");
      router.refresh();
    }
  }

  async function removeDomain(id: string) {
    await fetch(`/api/org/domains?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Card hover={false}>
      <h2 className="mb-4 text-sm font-medium text-text-secondary">
        Email Domains
      </h2>
      <p className="mb-3 text-xs text-text-tertiary">
        Users signing up with these email domains will automatically join your
        organization.
      </p>
      <div className="mb-4 flex gap-2">
        <Input
          placeholder="example.com"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          className="max-w-xs"
        />
        <Button size="sm" onClick={addDomain}>
          Add Domain
        </Button>
      </div>
      {domains.length > 0 ? (
        <div className="space-y-2">
          {domains.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg bg-bg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{d.domain}</span>
                {d.isPrimary && (
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
                    Primary
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeDomain(d.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-tertiary">No domains configured.</p>
      )}
    </Card>
  );
}
