"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";

interface NavLink {
  href: string;
  label: string;
  children?: { href: string; label: string }[];
}

interface MainNavProps {
  links: NavLink[];
}

function NavDropdownItem({ link, isActive }: { link: NavLink; isActive: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => {
        clearTimer();
        setOpen(true);
      }}
      onMouseLeave={() => {
        clearTimer();
        timeoutRef.current = setTimeout(() => setOpen(false), 150);
      }}
      onFocus={() => {
        clearTimer();
        setOpen(true);
      }}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <Link
        href={link.href}
        className={`text-sm transition-colors ${
          isActive
            ? "text-text-primary font-medium"
            : "text-text-secondary hover:text-text-primary"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {link.label}
      </Link>
      <div
        className={`absolute left-0 top-full pt-1 transition-opacity duration-100 ${
          open ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      >
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
