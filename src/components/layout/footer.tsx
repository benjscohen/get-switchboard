import Link from "next/link";
import { Container } from "@/components/ui/container";
import { footerLinks, siteConfig } from "@/lib/constants";

export function Footer() {
  const columns = Object.values(footerLinks);

  return (
    <footer className="border-t border-border bg-bg py-12 md:py-16">
      <Container>
        <div className="flex flex-col items-center gap-8 md:flex-row md:justify-between">
          {/* Brand */}
          <div className="flex flex-col items-center md:items-start">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold">
              <svg
                width="20"
                height="20"
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
            </Link>
            <p className="mt-2 text-sm text-text-tertiary">
              One URL. Every tool.
            </p>
          </div>

          {/* Navigation links */}
          <nav className="flex flex-wrap justify-center gap-6">
            {columns.map((column) =>
              column.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm text-text-tertiary transition-colors hover:text-text-secondary"
                >
                  {link.label}
                </a>
              ))
            )}
          </nav>
        </div>

        <div className="mt-10 border-t border-border pt-8 text-center text-sm text-text-tertiary">
          <p>
            &copy; {new Date().getFullYear()} {siteConfig.name}. Made with love by{" "}
            <a
              href="https://www.proton.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-secondary transition-colors hover:text-text-primary"
            >
              Proton AI
            </a>
          </p>
        </div>
      </Container>
    </footer>
  );
}
