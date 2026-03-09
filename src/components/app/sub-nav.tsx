"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SubNavProps {
  tabs: { href: string; label: string; prefixMatch?: boolean }[];
}

export function SubNav({ tabs }: SubNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {tabs.map(({ href, label, prefixMatch }) => {
        const isActive = prefixMatch
          ? pathname.startsWith(href)
          : pathname === href;

        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent/10 text-accent"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-card"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
