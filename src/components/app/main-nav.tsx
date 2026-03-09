"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <div className="group/nav relative">
      <Link
        href={link.href}
        className={`text-sm transition-colors ${
          isActive
            ? "text-text-primary font-medium"
            : "text-text-secondary hover:text-text-primary"
        }`}
        aria-haspopup="true"
      >
        {link.label}
      </Link>
      <div className="invisible absolute left-0 top-full z-50 pt-1 opacity-0 transition-all duration-150 group-hover/nav:visible group-hover/nav:opacity-100 focus-within:visible focus-within:opacity-100">
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
