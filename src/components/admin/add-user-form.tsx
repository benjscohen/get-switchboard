"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddUserFormProps {
  onUserAdded: () => void;
}

export function AddUserForm({ onUserAdded }: AddUserFormProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
    });

    if (res.ok) {
      setEmail("");
      setName("");
      onUserAdded();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to add user");
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[200px]">
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          Email
        </label>
        <Input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="flex-1 min-w-[150px]">
        <label className="mb-1 block text-xs font-medium text-text-secondary">
          Name (optional)
        </label>
        <Input
          type="text"
          placeholder="Jane Smith"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button type="submit" size="sm" disabled={loading || !email.trim()}>
        {loading ? "Adding..." : "Add user"}
      </Button>
      {error && <p className="w-full text-sm text-red-500">{error}</p>}
    </form>
  );
}
