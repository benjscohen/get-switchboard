"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CodeBlockProps {
  code: string;
  className?: string;
  hideCopy?: boolean;
}

export function CodeBlock({ code, className, hideCopy }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
          onClick={copy}
        >
          {copied ? "Copied!" : "Copy"}
        </Button>
      )}
    </div>
  );
}
