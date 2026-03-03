import { cn } from "@/lib/utils";
import { type HTMLAttributes } from "react";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  id?: string;
}

export function Section({ id, className, children, ...props }: SectionProps) {
  return (
    <section
      id={id}
      className={cn("py-24 md:py-32", className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto mb-12 max-w-2xl text-center", className)} {...props}>
      {children}
    </div>
  );
}

export function SectionTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-3xl font-bold tracking-tight md:text-4xl", className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function SectionDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("mt-4 text-lg text-text-secondary", className)}
      {...props}
    >
      {children}
    </p>
  );
}
