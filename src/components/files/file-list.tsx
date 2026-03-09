"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format-time";

interface FileItem {
  id: string;
  path: string;
  name: string;
  isFolder: boolean;
  mimeType: string;
  size: number;
  currentVersion: number;
  updatedAt: string;
}

interface FileListProps {
  items: FileItem[];
  onOpenFile: (item: FileItem) => void;
  onNavigateFolder: (path: string) => void;
  onDelete: (item: FileItem) => void;
  onHistory: (item: FileItem) => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


export function FileList({ items, onOpenFile, onNavigateFolder, onDelete, onHistory }: FileListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
        <p className="text-sm text-text-secondary">
          This folder is empty. Create a file or use the <code className="text-xs">file_write</code> MCP tool.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-bg-card text-left text-xs text-text-tertiary">
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium w-20">Size</th>
            <th className="px-4 py-2 font-medium w-16">Version</th>
            <th className="px-4 py-2 font-medium w-24">Modified</th>
            <th className="px-4 py-2 font-medium w-28"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-border last:border-0 transition-colors hover:bg-bg-hover"
            >
              <td className="px-4 py-2.5">
                <button
                  className="flex items-center gap-2 text-sm text-text-primary hover:text-accent"
                  onClick={() =>
                    item.isFolder ? onNavigateFolder(item.path) : onOpenFile(item)
                  }
                >
                  {item.isFolder ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 text-accent/60">
                      <path d="M2 3a1 1 0 00-1 1v8a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1H8.414a1 1 0 01-.707-.293L6.293 3.293A1 1 0 005.586 3H2z" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-text-tertiary">
                      <path d="M4 2h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
                      <path d="M9 2v4h4" />
                    </svg>
                  )}
                  <span className="truncate">{item.name}</span>
                </button>
              </td>
              <td className="px-4 py-2.5 text-xs text-text-tertiary">
                {item.isFolder ? "-" : formatSize(item.size)}
              </td>
              <td className="px-4 py-2.5">
                {!item.isFolder && <Badge>v{item.currentVersion}</Badge>}
              </td>
              <td className="px-4 py-2.5 text-xs text-text-tertiary">
                {formatRelativeTime(item.updatedAt)}
              </td>
              <td className="px-4 py-2.5">
                {!item.isFolder && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onHistory(item)}>
                      History
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(item)}>
                      Delete
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
