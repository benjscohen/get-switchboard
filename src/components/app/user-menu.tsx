"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface UserMenuProps {
  displayName: string;
  avatarUrl: string | null;
  showOrgSettings: boolean;
  showAdmin: boolean;
}

export function UserMenu({
  displayName,
  avatarUrl,
  showOrgSettings,
  showAdmin,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-bg-card"
      >
        {avatarUrl && (
          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full" />
        )}
        <span className="text-sm text-text-secondary">{displayName}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-bg py-1 shadow-lg">
          {showOrgSettings && (
            <a
              href="/org"
              className="block px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-card hover:text-text-primary"
            >
              Org Settings
            </a>
          )}
          {showAdmin && (
            <a
              href="/admin"
              className="block px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-card hover:text-text-primary"
            >
              Admin
            </a>
          )}
          {(showOrgSettings || showAdmin) && (
            <div className="my-1 border-t border-border" />
          )}
          <button
            onClick={handleSignOut}
            className="w-full px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-card hover:text-text-primary"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
