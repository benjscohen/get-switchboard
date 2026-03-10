import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "accent" | "success" | "destructive";
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
        variant === "success" &&
          "border border-green-500/30 bg-green-500/10 text-green-500",
        variant === "destructive" &&
          "border border-red-500/30 bg-red-500/10 text-red-500",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
