"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/usage", label: "Usage Logs" },
  { href: "/admin/mcp-servers", label: "MCP Servers" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {links.map(({ href, label }) => {
        const isActive =
          href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(href);

        return (
          <a
            key={href}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent/10 text-accent"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-card"
            }`}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
