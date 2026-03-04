"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AddUserForm } from "@/components/admin/add-user-form";

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  status: string;
  permissionsMode: string;
  apiKeyCount: number;
  connectionCount: number;
  requestCount: number;
  lastActive: string | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      setUsers(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Add user */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Add user</h2>
        <div className="rounded-xl border border-border bg-bg-card p-4">
          <AddUserForm onUserAdded={fetchUsers} />
        </div>
      </section>

      {/* User list */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Users{" "}
            <span className="text-sm font-normal text-text-secondary">
              ({users.length})
            </span>
          </h2>
          <Input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-text-tertiary">Loading...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-bg-card p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th className="pb-2 pr-4 font-medium">User</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Access</th>
                  <th className="pb-2 pr-4 font-medium">Last Active</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-bg-hover">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        {user.image ? (
                          <img
                            src={user.image}
                            alt=""
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-hover text-xs font-medium text-text-secondary">
                            {(user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium">
                            {user.name || "—"}
                          </div>
                          <div className="text-xs text-text-secondary">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={user.role === "admin" ? "accent" : "default"}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={user.status === "active" ? "accent" : "default"}
                      >
                        {user.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {user.permissionsMode === "full" ? "Full" : "Custom"}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary whitespace-nowrap">
                      {user.lastActive
                        ? new Date(user.lastActive).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="py-3">
                      <a
                        href={`/admin/users/${user.id}`}
                        className="text-sm text-accent hover:underline"
                      >
                        Manage
                      </a>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-text-tertiary"
                    >
                      {search ? "No users match your search" : "No users yet"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
