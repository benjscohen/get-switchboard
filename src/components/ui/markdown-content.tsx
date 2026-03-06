"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownContentProps {
  content: string;
  highlightArgs?: boolean;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-4 text-lg font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block rounded-md bg-bg-hover p-3 text-xs font-mono overflow-x-auto">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-bg-hover px-1.5 py-0.5 text-xs font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border pl-3 text-text-secondary last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-accent underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-bg-hover px-3 py-1.5 text-left text-xs font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-3 py-1.5 text-sm">{children}</td>
  ),
  hr: () => <hr className="my-3 border-border" />,
};

function highlightArgBadges(text: string): string {
  return text.replace(
    /\{\{(\w+)\}\}/g,
    '<span class="inline-flex items-center rounded bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-accent font-mono">$1</span>',
  );
}

export function MarkdownContent({ content, highlightArgs }: MarkdownContentProps) {
  const processed = highlightArgs
    ? content.replace(/\{\{(\w+)\}\}/g, "`{{$1}}`")
    : content;

  return (
    <div className="text-sm text-text-primary">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processed}
      </ReactMarkdown>
    </div>
  );
}

// Re-export for potential direct use
export { highlightArgBadges };
