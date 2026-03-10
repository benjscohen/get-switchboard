import { cn } from "@/lib/utils";

export const TAG_COLORS: Record<string, string> = {
  web: "bg-blue-100 text-blue-700",
  slack: "bg-purple-100 text-purple-700",
  scheduled: "bg-amber-100 text-amber-700",
  browser: "bg-neutral-100 text-neutral-600",
  files: "bg-neutral-100 text-neutral-600",
  search: "bg-neutral-100 text-neutral-600",
  github: "bg-neutral-100 text-neutral-600",
};

export function TagPill({ tag }: { tag: string }) {
  const color = TAG_COLORS[tag] ?? "bg-neutral-100 text-neutral-600";
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none", color)}>
      {tag}
    </span>
  );
}
