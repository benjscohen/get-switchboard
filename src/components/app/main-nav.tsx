"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavLink {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
}

interface MainNavProps {
  links: NavLink[];
}

function NavDropdownItem({ link, isActive }: { link: NavLink; isActive: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 text-sm transition-colors cursor-default ${
          isActive
            ? "text-text-primary font-medium hover:text-accent"
            : "text-text-secondary hover:text-text-primary"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {link.label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 pt-1">
          <div
            className="min-w-[140px] rounded-lg border border-border bg-bg py-1 shadow-lg"
            role="menu"
          >
            {link.children!.map((child) => {
              const isChildActive = pathname === child.href || pathname.startsWith(child.href + "/");
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  role="menuitem"
                  className={`block px-3 py-1.5 text-sm transition-colors ${
                    isChildActive
                      ? "text-text-primary font-medium"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary"
                  }`}
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function MainNav({ links }: MainNavProps) {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(link.href + "/");

        if (link.children) {
          return <NavDropdownItem key={link.href} link={link} isActive={isActive} />;
        }

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm transition-colors ${
              isActive
                ? "text-text-primary font-medium"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
