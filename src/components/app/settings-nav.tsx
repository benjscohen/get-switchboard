"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SettingsNavProps {
  tabs: { href: string; label: string }[];
}

export function SettingsNav({ tabs }: SettingsNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {tabs.map(({ href, label }, i) => {
        const isActive =
          i === 0
            ? pathname === href
            : pathname.startsWith(href);

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
