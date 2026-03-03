import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ className, hover = true, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-bg-card p-6",
        hover && "transition-all duration-200 hover:border-border-hover hover:bg-bg-hover",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
