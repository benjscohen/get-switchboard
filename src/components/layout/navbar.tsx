"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { navItems, siteConfig } from "@/lib/constants";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-border bg-bg/80 backdrop-blur-xl"
          : "bg-transparent"
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <a href="/" className="flex items-center gap-2 text-lg font-bold">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="text-accent"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.7" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.7" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.4" />
          </svg>
          {siteConfig.name}
        </a>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {item.label}
            </a>
          ))}
          <Button href="#waitlist" size="sm">
            Join Waitlist
          </Button>
        </div>

        {/* Mobile menu button */}
        <button
          className="flex items-center md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {mobileOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="8" x2="20" y2="8" />
                <line x1="4" y1="16" x2="20" y2="16" />
              </>
            )}
          </svg>
        </button>
      </Container>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-b border-border bg-bg/95 backdrop-blur-xl md:hidden">
          <Container className="flex flex-col gap-4 py-4">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-text-secondary transition-colors hover:text-text-primary"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <Button href="#waitlist" size="sm" className="w-fit">
              Join Waitlist
            </Button>
          </Container>
        </div>
      )}
    </nav>
  );
}
