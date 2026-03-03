import { cn } from "@/lib/utils";
import { type InputHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-border bg-bg-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary transition-colors duration-200 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
        className
      )}
      {...props}
    />
  );
}
