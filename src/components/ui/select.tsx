import { cn } from "@/lib/utils";
import { type SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
}

export function Select({ options, className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-accent",
        className
      )}
      {...props}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
