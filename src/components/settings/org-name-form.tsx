"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OrgNameFormProps {
  orgName: string;
  orgSlug: string;
}

export function OrgNameForm({ orgName, orgSlug }: OrgNameFormProps) {
  const router = useRouter();
  const [name, setName] = useState(orgName);
  const [saving, setSaving] = useState(false);

  async function updateName() {
    if (!name.trim() || name === orgName) return;
    setSaving(true);
    const res = await fetch("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) router.refresh();
    setSaving(false);
  }

  return (
    <Card hover={false}>
      <h2 className="mb-4 text-sm font-medium text-text-secondary">
        Organization Name
      </h2>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button
          size="sm"
          onClick={updateName}
          disabled={saving || name === orgName}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-text-tertiary">Slug: {orgSlug}</p>
    </Card>
  );
}
