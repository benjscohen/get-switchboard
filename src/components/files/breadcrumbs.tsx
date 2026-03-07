"use client";

interface BreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps) {
  const segments = path === "/" ? [] : path.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-sm">
      <button
        className="text-text-secondary transition-colors hover:text-text-primary"
        onClick={() => onNavigate("/")}
      >
        /
      </button>
      {segments.map((seg, i) => {
        const segPath = "/" + segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <span key={segPath} className="flex items-center gap-1">
            {i > 0 && <span className="text-text-tertiary">/</span>}
            {isLast ? (
              <span className="font-medium text-text-primary">{seg}</span>
            ) : (
              <button
                className="text-text-secondary transition-colors hover:text-text-primary"
                onClick={() => onNavigate(segPath)}
              >
                {seg}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
