"use client";

import { useState, useCallback } from "react";

interface TreeItem {
  path: string;
  name: string;
  isFolder: boolean;
  children?: TreeItem[];
}

interface FolderTreeProps {
  items: TreeItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onDeleteFolder: (path: string) => void;
}

function FolderNode({
  item,
  currentPath,
  depth,
  onNavigate,
  onCreateFolder,
  onDeleteFolder,
}: {
  item: TreeItem;
  currentPath: string;
  depth: number;
  onNavigate: (path: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onDeleteFolder: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(
    currentPath === item.path || currentPath.startsWith(item.path + "/"),
  );
  const [showMenu, setShowMenu] = useState(false);
  const isActive = currentPath === item.path;
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = useCallback(() => {
    setExpanded(!expanded);
    onNavigate(item.path);
  }, [expanded, item.path, onNavigate]);

  return (
    <div>
      <div
        className="group relative flex items-center"
        onMouseLeave={() => setShowMenu(false)}
      >
        <button
          className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
            isActive
              ? "bg-accent/10 text-accent font-medium"
              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={handleClick}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`shrink-0 transition-transform ${expanded && hasChildren ? "rotate-90" : ""} ${!hasChildren ? "opacity-0" : ""}`}
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="shrink-0 opacity-60"
          >
            {expanded ? (
              <path d="M1 4a1 1 0 011-1h4.586a1 1 0 01.707.293L8.707 4.707A1 1 0 009.414 5H14a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" />
            ) : (
              <path d="M2 3a1 1 0 00-1 1v8a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1H8.414a1 1 0 01-.707-.293L6.293 3.293A1 1 0 005.586 3H2z" />
            )}
          </svg>
          <span className="truncate">{item.name}</span>
        </button>
        <button
          className="absolute right-1 hidden shrink-0 rounded p-0.5 text-text-tertiary hover:bg-bg-hover hover:text-text-primary group-hover:block"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="4" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="12" r="1.5" />
          </svg>
        </button>
        {showMenu && (
          <div className="absolute right-0 top-full z-10 w-36 rounded-lg border border-border bg-bg-primary py-1 shadow-lg">
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-hover"
              onClick={() => {
                onCreateFolder(item.path);
                setShowMenu(false);
              }}
            >
              New folder
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-bg-hover"
              onClick={() => {
                onDeleteFolder(item.path);
                setShowMenu(false);
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {expanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FolderNode
              key={child.path}
              item={child}
              currentPath={currentPath}
              depth={depth + 1}
              onNavigate={onNavigate}
              onCreateFolder={onCreateFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({ items, currentPath, onNavigate, onCreateFolder, onDeleteFolder }: FolderTreeProps) {
  const isRootActive = currentPath === "/";

  return (
    <div className="space-y-0.5">
      <button
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm transition-colors ${
          isRootActive
            ? "bg-accent/10 text-accent font-medium"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        }`}
        onClick={() => onNavigate("/")}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 opacity-60">
          <path d="M2 3a1 1 0 00-1 1v8a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1H8.414a1 1 0 01-.707-.293L6.293 3.293A1 1 0 005.586 3H2z" />
        </svg>
        <span>/</span>
      </button>
      {items.map((item) => (
        <FolderNode
          key={item.path}
          item={item}
          currentPath={currentPath}
          depth={1}
          onNavigate={onNavigate}
          onCreateFolder={onCreateFolder}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </div>
  );
}

// Build a tree from a flat list of items
export function buildFolderTree(
  items: Array<{ path: string; name: string; isFolder: boolean }>,
): TreeItem[] {
  const folderItems = items.filter((i) => i.isFolder);
  const pathMap = new Map<string, TreeItem>();

  // Create all nodes
  for (const item of folderItems) {
    pathMap.set(item.path, { ...item, children: [] });
  }

  // Build tree
  const roots: TreeItem[] = [];
  for (const item of folderItems) {
    const parentPath = item.path.substring(0, item.path.lastIndexOf("/")) || "/";
    const parent = pathMap.get(parentPath);
    if (parent) {
      parent.children!.push(pathMap.get(item.path)!);
    } else {
      roots.push(pathMap.get(item.path)!);
    }
  }

  return roots;
}
