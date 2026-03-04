"use client";

import { useState, useEffect, useCallback, use } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { PermissionsEditor } from "@/components/admin/permissions-editor";

interface UserDetail {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  status: string;
  permissionsMode: string;
}

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const isSelf = currentUserId === id;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleMsg, setRoleMsg] = useState("");
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const users: UserDetail[] = await res.json();
      const found = users.find((u) => u.id === id);
      if (found) {
        setUser(found);
        setRole(found.role);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  async function handleRoleSave() {
    if (!user) return;
    setRoleSaving(true);
    setRoleMsg("");

    const res = await fetch(`/api/admin/users?id=${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });

    if (res.ok) {
      setRoleMsg("Role updated");
      setTimeout(() => setRoleMsg(""), 3000);
      fetchUser();
    } else {
      const d = await res.json();
      setRoleMsg(d.error || "Failed to update role");
    }
    setRoleSaving(false);
  }

  async function handleRemove() {
    if (!user) return;
    setRemoving(true);

    const res = await fetch(`/api/admin/users?id=${user.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      window.location.href = "/admin/users";
    } else {
      const d = await res.json();
      alert(d.error || "Failed to remove user");
      setRemoving(false);
      setConfirmRemove(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-text-tertiary">Loading...</div>;
  }

  if (!user) {
    return <div className="py-12 text-center text-text-tertiary">User not found</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <a
          href="/admin/users"
          className="mb-4 inline-block text-sm text-text-secondary hover:text-text-primary"
        >
          &larr; Back to users
        </a>
        <div className="flex items-center gap-4">
          {user.image ? (
            <img src={user.image} alt="" className="h-12 w-12 rounded-full" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-hover text-lg font-medium text-text-secondary">
              {(user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold">{user.name || "Unnamed user"}</h2>
            <p className="text-sm text-text-secondary">{user.email}</p>
          </div>
          <Badge variant={user.status === "active" ? "accent" : "default"}>
            {user.status}
          </Badge>
        </div>
      </div>

      {/* Role */}
      <Card hover={false}>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Role
        </h3>
        <div className="flex items-center gap-3">
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[
              { value: "user", label: "User" },
              { value: "admin", label: "Admin" },
            ]}
            disabled={isSelf}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRoleSave}
            disabled={roleSaving || role === user.role || isSelf}
          >
            {roleSaving ? "Saving..." : "Save"}
          </Button>
          {roleMsg && (
            <span
              className={`text-sm ${roleMsg.includes("updated") ? "text-green-500" : "text-red-500"}`}
            >
              {roleMsg}
            </span>
          )}
          {isSelf && (
            <span className="text-xs text-text-tertiary">
              Cannot change your own role
            </span>
          )}
        </div>
      </Card>

      {/* Access Permissions */}
      <Card hover={false}>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
          Access Permissions
        </h3>
        <PermissionsEditor userId={id} isSelf={isSelf} />
      </Card>

      {/* Danger Zone */}
      {!isSelf && (
        <Card hover={false} className="border-red-500/30">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-500">
            Danger Zone
          </h3>
          {!confirmRemove ? (
            <Button
              size="sm"
              variant="secondary"
              className="border-red-500/30 text-red-500 hover:bg-red-500/10"
              onClick={() => setConfirmRemove(true)}
            >
              Remove user
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-text-secondary">
                This will deactivate the user. Are you sure?
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="border-red-500/30 text-red-500 hover:bg-red-500/10"
                onClick={handleRemove}
                disabled={removing}
              >
                {removing ? "Removing..." : "Yes, remove"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmRemove(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
