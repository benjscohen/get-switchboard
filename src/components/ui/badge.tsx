import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "accent";
}

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        variant === "default" &&
          "border border-border bg-bg-card text-text-secondary",
        variant === "accent" &&
          "border border-accent/30 bg-accent/10 text-accent",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
