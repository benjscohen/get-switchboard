"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/files/breadcrumbs";
import { FolderTree, buildFolderTree } from "@/components/files/folder-tree";
import { FileList } from "@/components/files/file-list";
import { FileEditor } from "@/components/files/file-editor";
import { FileHistory } from "@/components/files/file-history";
import { FolderDialog } from "@/components/files/folder-dialog";

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

interface FileEntry {
  id: string;
  path: string;
  name: string;
  parentPath: string;
  isFolder: boolean;
  content: string | null;
  mimeType: string;
  metadata: Record<string, unknown>;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState("/");
  const [items, setItems] = useState<FileItem[]>([]);
  const [allFolders, setAllFolders] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FileEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<FileItem | null>(null);
  const [creatingFolder, setCreatingFolder] = useState<string | null>(null);

  const fetchItems = useCallback(async (path: string) => {
    const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
    if (res.ok) {
      setItems(await res.json());
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    const res = await fetch("/api/files?path=/&recursive=true");
    if (res.ok) {
      const all: FileItem[] = await res.json();
      setAllFolders(all.filter((i) => i.isFolder));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchItems(currentPath), fetchFolders()]).then(() =>
      setLoading(false),
    );
  }, [currentPath, fetchItems, fetchFolders]);

  function navigateTo(path: string) {
    setCurrentPath(path);
  }

  async function handleSave(data: { path: string; content: string; metadata?: Record<string, unknown> }) {
    if (editing) {
      await fetch(`/api/files/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: data.content, metadata: data.metadata }),
      });
    } else {
      await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    }
    setEditing(null);
    setCreating(false);
    await fetchItems(currentPath);
    await fetchFolders();
  }

  async function handleDelete(item: FileItem) {
    if (item.isFolder) {
      await fetch(`/api/files/folder?path=${encodeURIComponent(item.path)}&recursive=true`, {
        method: "DELETE",
      });
    } else {
      await fetch(`/api/files/${item.id}`, { method: "DELETE" });
    }
    await fetchItems(currentPath);
    await fetchFolders();
  }

  async function handleOpenFile(item: FileItem) {
    const res = await fetch(`/api/files/${item.id}`);
    if (res.ok) {
      const file: FileEntry = await res.json();
      setEditing(file);
    }
  }

  function handleCreateFolder(parentPath: string) {
    setCreatingFolder(parentPath);
  }

  async function handleFolderSubmit(name: string) {
    if (creatingFolder === null) return;
    const folderPath = creatingFolder === "/" ? `/${name}` : `${creatingFolder}/${name}`;
    await fetch("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: folderPath }),
    });
    setCreatingFolder(null);
    await fetchItems(currentPath);
    await fetchFolders();
  }

  async function handleDeleteFolder(path: string) {
    if (!confirm(`Delete folder "${path}" and all its contents?`)) return;
    await fetch(`/api/files/folder?path=${encodeURIComponent(path)}&recursive=true`, {
      method: "DELETE",
    });
    if (currentPath === path || currentPath.startsWith(path + "/")) {
      setCurrentPath("/");
    }
    await fetchItems(currentPath);
    await fetchFolders();
  }

  async function handleRollback(fileId: string, version: number) {
    await fetch(`/api/files/${fileId}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    await fetchItems(currentPath);
  }

  const folderTree = buildFolderTree(allFolders);

  return (
    <>
      {/* Action bar */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Your agent&apos;s virtual file system. Organize context, preferences, and notes.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => handleCreateFolder(currentPath)}>
            + Folder
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            + New File
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Sidebar: folder tree */}
        <div className="w-56 shrink-0">
          <div className="rounded-xl border border-border bg-bg-card p-3">
            <p className="mb-2 text-xs font-medium text-text-tertiary uppercase tracking-wide">Folders</p>
            <FolderTree
              items={folderTree}
              currentPath={currentPath}
              onNavigate={navigateTo}
              onCreateFolder={handleCreateFolder}
              onDeleteFolder={handleDeleteFolder}
            />
          </div>
        </div>

        {/* Main area */}
        <div className="min-w-0 flex-1">
          {/* Breadcrumbs */}
          <div className="mb-4">
            <Breadcrumbs path={currentPath} onNavigate={navigateTo} />
          </div>

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-bg-card p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded bg-bg-hover" />
                    <div className="h-4 w-48 rounded bg-bg-hover" />
                    <div className="ml-auto h-4 w-16 rounded bg-bg-hover" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* File list */}
          {!loading && (
            <FileList
              items={items}
              onOpenFile={handleOpenFile}
              onNavigateFolder={navigateTo}
              onDelete={handleDelete}
              onHistory={setViewingHistory}
            />
          )}
        </div>
      </div>

      {/* Folder dialog */}
      {creatingFolder !== null && (
        <FolderDialog
          parentPath={creatingFolder}
          onSubmit={handleFolderSubmit}
          onClose={() => setCreatingFolder(null)}
        />
      )}

      {/* Editor modal */}
      {(editing || creating) && (
        <FileEditor
          file={editing ?? undefined}
          currentPath={currentPath}
          onSave={handleSave}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}

      {/* History modal */}
      {viewingHistory && (
        <FileHistory
          fileId={viewingHistory.id}
          filePath={viewingHistory.path}
          currentVersion={viewingHistory.currentVersion}
          onRollback={(version) => handleRollback(viewingHistory.id, version)}
          onClose={() => setViewingHistory(null)}
        />
      )}
    </>
  );
}
