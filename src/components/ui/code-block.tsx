"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface CodeBlockProps {
  code: string;
  className?: string;
  hideCopy?: boolean;
}

export function CodeBlock({ code, className, hideCopy }: CodeBlockProps) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <div className={cn("group relative", className)}>
      <pre className="overflow-x-auto rounded-lg bg-bg p-4 text-sm leading-relaxed text-text-primary">
        <code className="font-mono">{code}</code>
      </pre>
      {!hideCopy && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => copy(code)}
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
      )}
    </div>
  );
}
