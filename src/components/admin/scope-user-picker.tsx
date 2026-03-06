"use client";

import { useState, useRef, useEffect } from "react";

interface Member {
  id: string;
  name: string;
  role: string;
}

interface ScopeUserPickerProps {
  members: Member[];
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
}

export function ScopeUserPicker({ members, selectedIds, onChange }: ScopeUserPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const nonAdminMembers = members.filter(
    (m) => m.role !== "owner" && m.role !== "admin"
  );

  const filtered = nonAdminMembers.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  }

  function remove(id: string) {
    const next = new Set(selectedIds);
    next.delete(id);
    onChange(next);
  }

  const selectedMembers = nonAdminMembers.filter((m) => selectedIds.has(m.id));

  return (
    <div ref={ref} className="relative">
      {/* Selected pills */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selectedMembers.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-card px-2.5 py-0.5 text-xs"
          >
            {m.name}
            <button
              type="button"
              onClick={() => remove(m.id)}
              className="ml-0.5 text-text-tertiary hover:text-text-primary"
            >
              x
            </button>
          </span>
        ))}
      </div>

      {/* Search input */}
      <input
        type="text"
        placeholder="Search members..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setOpen(true)}
        className="w-full rounded-md border border-border bg-bg-primary px-3 py-1.5 text-sm outline-none focus:border-accent"
      />

      {/* Dropdown */}
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-bg-card shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-text-tertiary">No members found</p>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg-hover"
              >
                <span
                  className={`h-3.5 w-3.5 shrink-0 rounded border ${
                    selectedIds.has(m.id)
                      ? "border-accent bg-accent"
                      : "border-border"
                  }`}
                />
                <span className="truncate">{m.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      <p className="mt-1 text-xs text-text-tertiary">
        Org admins and owners always have access regardless of this setting.
      </p>
    </div>
  );
}
