import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ServiceResult } from "@/lib/vault/service";
import { upsertEmbeddings, getQueryEmbedding, extractKeywords, searchByEmbedding, keywordScore, hybridScore, EMBEDDING_TABLES } from "@/lib/embeddings";

// ── Types ──

export interface FileAuth {
  userId: string;
  organizationId?: string;
}

export interface FileEntry {
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

export interface FileListItem {
  id: string;
  path: string;
  name: string;
  isFolder: boolean;
  mimeType: string;
  size: number;
  currentVersion: number;
  updatedAt: string;
}

export interface FileVersionEntry {
  id: string;
  fileId: string;
  version: number;
  path: string;
  name: string;
  content: string | null;
  metadata: Record<string, unknown>;
  changeType: "created" | "updated" | "moved" | "rolled_back";
  changedBy: string;
  changeSummary: string | null;
  createdAt: string;
}

interface FileVersionRow {
  id: string;
  file_id: string;
  version: number;
  path: string;
  name: string;
  content: string | null;
  metadata: Record<string, unknown>;
  change_type: "created" | "updated" | "moved" | "rolled_back";
  changed_by: string;
  change_summary: string | null;
  created_at: string;
}

// ── Path Utilities ──

export function normalizePath(p: string): string {
  let normalized = "/" + p.replace(/\\/g, "/");
  // Collapse multiple slashes
  normalized = normalized.replace(/\/+/g, "/");
  // Remove trailing slash (except root)
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function getParentPath(p: string): string {
  const normalized = normalizePath(p);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return normalized.slice(0, lastSlash);
}

export function getFileName(p: string): string {
  const normalized = normalizePath(p);
  const lastSlash = normalized.lastIndexOf("/");
  return normalized.slice(lastSlash + 1);
}

export function validatePath(p: string): string | null {
  const normalized = normalizePath(p);
  if (normalized === "/") return "Cannot operate on root directly";
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length > 10) return "Path too deep (max 10 levels)";
  for (const seg of segments) {
    if (seg.length > 255) return "Path segment too long (max 255 chars)";
    if (/[<>:"|?*\x00-\x1f]/.test(seg)) return "Path contains invalid characters";
    if (seg === "." || seg === "..") return "Relative path segments not allowed";
  }
  return null;
}

// ── Helpers ──

function orgFilter<T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
  q: T,
  auth: FileAuth,
): T {
  if (auth.organizationId) {
    return q.eq("organization_id", auth.organizationId);
  }
  return q.is("organization_id", null);
}

function formatFile(row: Record<string, unknown>): FileEntry {
  return {
    id: row.id as string,
    path: row.path as string,
    name: row.name as string,
    parentPath: row.parent_path as string,
    isFolder: row.is_folder as boolean,
    content: row.content as string | null,
    mimeType: row.mime_type as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    currentVersion: row.current_version as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function formatVersion(v: FileVersionRow): FileVersionEntry {
  return {
    id: v.id,
    fileId: v.file_id,
    version: v.version,
    path: v.path,
    name: v.name,
    content: v.content,
    metadata: v.metadata ?? {},
    changeType: v.change_type,
    changedBy: v.changed_by,
    changeSummary: v.change_summary,
    createdAt: v.created_at,
  };
}

function formatListItem(row: Record<string, unknown>): FileListItem {
  const content = row.content as string | null;
  return {
    id: row.id as string,
    path: row.path as string,
    name: row.name as string,
    isFolder: row.is_folder as boolean,
    mimeType: row.mime_type as string,
    size: content ? content.length : 0,
    currentVersion: row.current_version as number,
    updatedAt: row.updated_at as string,
  };
}

// ── Embedding Helpers ──

export function shouldEmbedFile(row: Record<string, unknown>): boolean {
  if (row.is_folder) return false;
  const mime = (row.mime_type as string) || "text/plain";
  if (mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/") || mime === "application/octet-stream") {
    return false;
  }
  return true;
}

export function buildFileSearchText(row: Record<string, unknown>): string {
  const parts = [
    `File: ${row.name as string}`,
    `Path: ${row.path as string}`,
  ];
  const mime = row.mime_type as string;
  if (mime && mime !== "text/plain") parts.push(`Type: ${mime}`);
  const content = row.content as string | null;
  if (content) parts.push(`Content: ${content.slice(0, 8000)}`);
  const metadata = row.metadata as Record<string, unknown> | null;
  if (metadata && typeof metadata === "object") {
    const tags = metadata.tags;
    if (Array.isArray(tags)) parts.push(`Tags: ${tags.join(", ")}`);
  }
  return parts.join("\n");
}

const { table: FILE_TABLE, idColumn: FILE_ID_COL } = EMBEDDING_TABLES.files;

function queueFileEmbedding(row: Record<string, unknown>): void {
  if (!shouldEmbedFile(row)) return;
  upsertEmbeddings(FILE_TABLE, FILE_ID_COL, [{
    id: row.id as string,
    searchText: buildFileSearchText(row),
    extraColumns: { path: row.path as string, name: row.name as string },
  }]).catch((err) => console.warn("[files] embedding failed:", err));
}

// ── Internal: ensure parent folders exist ──

async function ensureParentFolders(auth: FileAuth, path: string): Promise<void> {
  const parent = getParentPath(path);
  if (parent === "/") return;

  // Check if parent exists
  let q = supabaseAdmin
    .from("files")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("path", parent)
    .eq("is_folder", true);
  q = orgFilter(q, auth);
  const { data: existing } = await q.maybeSingle();

  if (existing) return;

  // Recursively ensure grandparent
  await ensureParentFolders(auth, parent);

  // Create parent folder (insert only — we already checked it doesn't exist)
  const folderName = getFileName(parent);
  const folderParent = getParentPath(parent);
  await supabaseAdmin.from("files").insert({
    user_id: auth.userId,
    organization_id: auth.organizationId ?? null,
    path: parent,
    name: folderName,
    parent_path: folderParent,
    is_folder: true,
    content: null,
    metadata: {},
    current_version: 1,
    updated_at: new Date().toISOString(),
  });
}

// ── Service Functions ──

export async function readFile(
  auth: FileAuth,
  path: string,
): Promise<ServiceResult<FileEntry>> {
  const normalized = normalizePath(path);
  let q = supabaseAdmin
    .from("files")
    .select("*")
    .eq("user_id", auth.userId)
    .eq("path", normalized);
  q = orgFilter(q, auth);

  const { data, error } = await q.single();
  if (error || !data) return { ok: false, error: "File not found", status: 404 };
  return { ok: true, data: formatFile(data) };
}

export async function readFileById(
  auth: FileAuth,
  id: string,
): Promise<ServiceResult<FileEntry>> {
  let q = supabaseAdmin
    .from("files")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId);
  q = orgFilter(q, auth);

  const { data, error } = await q.single();
  if (error || !data) return { ok: false, error: "File not found", status: 404 };
  return { ok: true, data: formatFile(data) };
}

export async function writeFile(
  auth: FileAuth,
  path: string,
  content: string,
  opts?: { metadata?: Record<string, unknown>; mimeType?: string },
): Promise<ServiceResult<FileEntry>> {
  const normalized = normalizePath(path);
  const pathError = validatePath(normalized);
  if (pathError) return { ok: false, error: pathError, status: 400 };

  // Auto-create parent folders
  await ensureParentFolders(auth, normalized);

  // Check existing to determine version
  let q = supabaseAdmin
    .from("files")
    .select("id, current_version")
    .eq("user_id", auth.userId)
    .eq("path", normalized);
  q = orgFilter(q, auth);
  const { data: existing } = await q.maybeSingle();

  const isCreate = !existing;
  const newVersion = isCreate ? 1 : existing.current_version + 1;

  const row = {
    user_id: auth.userId,
    organization_id: auth.organizationId ?? null,
    path: normalized,
    name: getFileName(normalized),
    parent_path: getParentPath(normalized),
    is_folder: false,
    content,
    mime_type: opts?.mimeType ?? "text/plain",
    metadata: opts?.metadata ?? {},
    current_version: newVersion,
    updated_at: new Date().toISOString(),
  };

  let data: Record<string, unknown>;
  let error: { message: string } | null;

  if (isCreate) {
    const result = await supabaseAdmin
      .from("files")
      .insert(row)
      .select("*")
      .single();
    data = result.data;
    error = result.error;
  } else {
    const result = await supabaseAdmin
      .from("files")
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single();
    data = result.data;
    error = result.error;
  }

  if (error || !data) return { ok: false, error: error?.message ?? "Write failed", status: 500 };

  // Record version
  const { error: versionError } = await supabaseAdmin.from("file_versions").insert({
    file_id: data.id,
    version: newVersion,
    path: data.path,
    name: data.name,
    content: data.content,
    metadata: data.metadata ?? {},
    change_type: isCreate ? "created" : "updated",
    changed_by: auth.userId,
  });
  if (versionError) console.error("Failed to record file version:", versionError.message);

  queueFileEmbedding(data);

  return { ok: true, data: formatFile(data) };
}

export async function deleteFile(
  auth: FileAuth,
  path: string,
): Promise<ServiceResult<{ deleted: true }>> {
  const normalized = normalizePath(path);
  let q = supabaseAdmin
    .from("files")
    .delete()
    .eq("user_id", auth.userId)
    .eq("path", normalized)
    .eq("is_folder", false);
  q = orgFilter(q, auth);

  const { error } = await q;
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: { deleted: true } };
}

export async function deleteFileById(
  auth: FileAuth,
  id: string,
): Promise<ServiceResult<{ deleted: true }>> {
  let q = supabaseAdmin
    .from("files")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  q = orgFilter(q, auth);

  const { error } = await q;
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: { deleted: true } };
}

export async function updateFileById(
  auth: FileAuth,
  id: string,
  input: { content?: string; metadata?: Record<string, unknown>; path?: string },
): Promise<ServiceResult<FileEntry>> {
  let existQ = supabaseAdmin
    .from("files")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId);
  existQ = orgFilter(existQ, auth);
  const { data: existing } = await existQ.single();

  if (!existing) return { ok: false, error: "File not found", status: 404 };

  const newVersion = existing.current_version + 1;
  const updates: Record<string, unknown> = {
    current_version: newVersion,
    updated_at: new Date().toISOString(),
  };
  if (input.content !== undefined) updates.content = input.content;
  if (input.metadata !== undefined) updates.metadata = input.metadata;
  if (input.path !== undefined) {
    const normalized = normalizePath(input.path);
    const pathError = validatePath(normalized);
    if (pathError) return { ok: false, error: pathError, status: 400 };
    updates.path = normalized;
    updates.name = getFileName(normalized);
    updates.parent_path = getParentPath(normalized);
  }

  const { data, error } = await supabaseAdmin
    .from("files")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };

  const { error: versionError } = await supabaseAdmin.from("file_versions").insert({
    file_id: id,
    version: newVersion,
    path: data.path,
    name: data.name,
    content: data.content,
    metadata: data.metadata ?? {},
    change_type: input.path ? "moved" : "updated",
    changed_by: auth.userId,
  });
  if (versionError) console.error("Failed to record file version:", versionError.message);

  queueFileEmbedding(data);

  return { ok: true, data: formatFile(data) };
}

export async function moveFile(
  auth: FileAuth,
  fromPath: string,
  toPath: string,
): Promise<ServiceResult<FileEntry>> {
  const normalizedFrom = normalizePath(fromPath);
  const normalizedTo = normalizePath(toPath);
  const pathError = validatePath(normalizedTo);
  if (pathError) return { ok: false, error: pathError, status: 400 };

  // Get the source file
  let q = supabaseAdmin
    .from("files")
    .select("*")
    .eq("user_id", auth.userId)
    .eq("path", normalizedFrom);
  q = orgFilter(q, auth);
  const { data: source } = await q.single();
  if (!source) return { ok: false, error: "Source not found", status: 404 };

  await ensureParentFolders(auth, normalizedTo);

  const newVersion = source.current_version + 1;

  if (source.is_folder) {
    // Move folder: update path and all descendants
    const { data: updated, error } = await supabaseAdmin
      .from("files")
      .update({
        path: normalizedTo,
        name: getFileName(normalizedTo),
        parent_path: getParentPath(normalizedTo),
        current_version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", source.id)
      .select("*")
      .single();

    if (error) return { ok: false, error: error.message, status: 500 };

    // Update all descendants: replace path prefix
    const oldPrefix = normalizedFrom + "/";
    const newPrefix = normalizedTo + "/";
    // Fetch all descendants and update them
    let dq = supabaseAdmin
      .from("files")
      .select("id, path, parent_path")
      .eq("user_id", auth.userId)
      .like("path", oldPrefix + "%");
    dq = orgFilter(dq, auth);
    const { data: descendants } = await dq;

    if (descendants && descendants.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(
        descendants.map((desc) => {
          const newDescPath = newPrefix + (desc.path as string).slice(oldPrefix.length);
          const newDescParent = getParentPath(newDescPath);
          return supabaseAdmin
            .from("files")
            .update({ path: newDescPath, parent_path: newDescParent, updated_at: now })
            .eq("id", desc.id);
        })
      );
    }

    const { error: versionError } = await supabaseAdmin.from("file_versions").insert({
      file_id: source.id,
      version: newVersion,
      path: normalizedTo,
      name: getFileName(normalizedTo),
      content: null,
      metadata: source.metadata ?? {},
      change_type: "moved",
      changed_by: auth.userId,
      change_summary: `Moved from ${normalizedFrom} to ${normalizedTo}`,
    });
    if (versionError) console.error("Failed to record file version:", versionError.message);

    queueFileEmbedding(updated);

    return { ok: true, data: formatFile(updated) };
  }

  // Move file
  const { data: updated, error } = await supabaseAdmin
    .from("files")
    .update({
      path: normalizedTo,
      name: getFileName(normalizedTo),
      parent_path: getParentPath(normalizedTo),
      current_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", source.id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };

  const { error: moveVersionError } = await supabaseAdmin.from("file_versions").insert({
    file_id: source.id,
    version: newVersion,
    path: normalizedTo,
    name: getFileName(normalizedTo),
    content: source.content,
    metadata: source.metadata ?? {},
    change_type: "moved",
    changed_by: auth.userId,
    change_summary: `Moved from ${normalizedFrom} to ${normalizedTo}`,
  });
  if (moveVersionError) console.error("Failed to record file version:", moveVersionError.message);

  queueFileEmbedding(updated);

  return { ok: true, data: formatFile(updated) };
}

export async function listDirectory(
  auth: FileAuth,
  dirPath: string,
  opts?: { recursive?: boolean },
): Promise<ServiceResult<FileListItem[]>> {
  const normalized = normalizePath(dirPath);

  let q = supabaseAdmin
    .from("files")
    .select("id, path, name, is_folder, mime_type, content, current_version, updated_at")
    .eq("user_id", auth.userId);
  q = orgFilter(q, auth);

  if (opts?.recursive) {
    if (normalized === "/") {
      // All files
    } else {
      q = q.or(`parent_path.eq.${normalized},path.like.${normalized}/%`);
    }
  } else {
    q = q.eq("parent_path", normalized);
  }

  q = q.order("is_folder", { ascending: false }).order("name");

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, status: 500 };

  return { ok: true, data: (data ?? []).map(formatListItem) };
}

export async function createFolder(
  auth: FileAuth,
  path: string,
): Promise<ServiceResult<FileEntry>> {
  const normalized = normalizePath(path);
  const pathError = validatePath(normalized);
  if (pathError) return { ok: false, error: pathError, status: 400 };

  // Check if folder already exists
  let existQ = supabaseAdmin
    .from("files")
    .select("*")
    .eq("user_id", auth.userId)
    .eq("path", normalized)
    .eq("is_folder", true);
  existQ = orgFilter(existQ, auth);
  const { data: existing } = await existQ.maybeSingle();

  if (existing) return { ok: true, data: formatFile(existing) };

  await ensureParentFolders(auth, normalized);

  const row = {
    user_id: auth.userId,
    organization_id: auth.organizationId ?? null,
    path: normalized,
    name: getFileName(normalized),
    parent_path: getParentPath(normalized),
    is_folder: true,
    content: null,
    metadata: {},
    current_version: 1,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("files")
    .insert(row)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: formatFile(data) };
}

export async function deleteFolder(
  auth: FileAuth,
  path: string,
  opts?: { recursive?: boolean },
): Promise<ServiceResult<{ deleted: true }>> {
  const normalized = normalizePath(path);

  // Check if folder has children
  let childQ = supabaseAdmin
    .from("files")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("parent_path", normalized)
    .limit(1);
  childQ = orgFilter(childQ, auth);
  const { data: children } = await childQ;

  if (children && children.length > 0 && !opts?.recursive) {
    return { ok: false, error: "Folder is not empty. Use recursive=true to delete.", status: 400 };
  }

  if (opts?.recursive) {
    // Delete all descendants first
    let descQ = supabaseAdmin
      .from("files")
      .delete()
      .eq("user_id", auth.userId)
      .like("path", normalized + "/%");
    descQ = orgFilter(descQ, auth);
    await descQ;
  }

  // Delete the folder itself
  let q = supabaseAdmin
    .from("files")
    .delete()
    .eq("user_id", auth.userId)
    .eq("path", normalized)
    .eq("is_folder", true);
  q = orgFilter(q, auth);
  const { error } = await q;

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: { deleted: true } };
}

export async function searchFiles(
  auth: FileAuth,
  opts: { query?: string; path?: string },
): Promise<ServiceResult<FileListItem[]>> {
  let q = supabaseAdmin
    .from("files")
    .select("id, path, name, is_folder, mime_type, content, current_version, updated_at")
    .eq("user_id", auth.userId)
    .eq("is_folder", false);
  q = orgFilter(q, auth);

  if (opts.path) {
    const normalized = normalizePath(opts.path);
    q = q.like("path", normalized + "%");
  }

  if (opts.query) {
    const escaped = opts.query.replace(/%/g, "\\%").replace(/_/g, "\\_");
    q = q.or(`name.ilike.%${escaped}%,content.ilike.%${escaped}%`);
  }

  q = q.order("path").limit(50);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, status: 500 };

  return { ok: true, data: (data ?? []).map(formatListItem) };
}

// ── Version / Audit Functions ──

export async function resolveFileId(
  auth: FileAuth,
  path: string,
): Promise<ServiceResult<{ id: string; currentVersion: number }>> {
  const normalized = normalizePath(path);
  let q = supabaseAdmin
    .from("files")
    .select("id, current_version")
    .eq("user_id", auth.userId)
    .eq("path", normalized);
  q = orgFilter(q, auth);

  const { data, error } = await q.single();
  if (error || !data) return { ok: false, error: "File not found", status: 404 };
  return { ok: true, data: { id: data.id, currentVersion: data.current_version } };
}

export async function listVersions(
  auth: FileAuth,
  fileId: string,
): Promise<ServiceResult<FileVersionEntry[]>> {
  const { data: file } = await supabaseAdmin
    .from("files")
    .select("user_id")
    .eq("id", fileId)
    .single();

  if (!file) return { ok: false, error: "File not found", status: 404 };
  if (file.user_id !== auth.userId) return { ok: false, error: "Not found", status: 404 };

  const { data: versions, error } = await supabaseAdmin
    .from("file_versions")
    .select("*")
    .eq("file_id", fileId)
    .order("version", { ascending: false });

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: ((versions ?? []) as FileVersionRow[]).map(formatVersion) };
}

export async function getVersion(
  auth: FileAuth,
  fileId: string,
  version: number,
): Promise<ServiceResult<FileVersionEntry>> {
  const { data: file } = await supabaseAdmin
    .from("files")
    .select("user_id")
    .eq("id", fileId)
    .single();

  if (!file) return { ok: false, error: "File not found", status: 404 };
  if (file.user_id !== auth.userId) return { ok: false, error: "Not found", status: 404 };

  const { data: ver, error } = await supabaseAdmin
    .from("file_versions")
    .select("*")
    .eq("file_id", fileId)
    .eq("version", version)
    .single();

  if (error || !ver) return { ok: false, error: "Version not found", status: 404 };
  return { ok: true, data: formatVersion(ver as FileVersionRow) };
}

export async function rollbackFile(
  auth: FileAuth,
  fileId: string,
  targetVersion: number,
): Promise<ServiceResult<FileEntry>> {
  const { data: file } = await supabaseAdmin
    .from("files")
    .select("*")
    .eq("id", fileId)
    .single();

  if (!file) return { ok: false, error: "File not found", status: 404 };
  if (file.user_id !== auth.userId) return { ok: false, error: "Not found", status: 404 };

  if (targetVersion === file.current_version) {
    return { ok: false, error: "Already at this version", status: 400 };
  }

  const { data: ver } = await supabaseAdmin
    .from("file_versions")
    .select("*")
    .eq("file_id", fileId)
    .eq("version", targetVersion)
    .single();

  if (!ver) return { ok: false, error: "Version not found", status: 404 };

  const newVersion = file.current_version + 1;

  const { data: updated, error } = await supabaseAdmin
    .from("files")
    .update({
      content: ver.content,
      metadata: ver.metadata,
      current_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message, status: 500 };

  const { error: versionError } = await supabaseAdmin.from("file_versions").insert({
    file_id: fileId,
    version: newVersion,
    path: ver.path,
    name: ver.name,
    content: ver.content,
    metadata: ver.metadata,
    change_type: "rolled_back",
    changed_by: auth.userId,
    change_summary: `Rolled back to version ${targetVersion}`,
  });
  if (versionError) console.error("Failed to record file version:", versionError.message);

  queueFileEmbedding(updated);

  return { ok: true, data: formatFile(updated) };
}

// ── Bulk Operations ──

export async function getAllFiles(
  auth: FileAuth,
): Promise<ServiceResult<FileEntry[]>> {
  let q = supabaseAdmin
    .from("files")
    .select("*")
    .eq("user_id", auth.userId)
    .order("path");
  q = orgFilter(q, auth);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message, status: 500 };

  return { ok: true, data: (data ?? []).map(formatFile) };
}

export async function bulkWriteFiles(
  auth: FileAuth,
  entries: Array<{ path: string; content: string; metadata?: Record<string, unknown> }>,
): Promise<ServiceResult<{ upserted: number; paths: string[] }>> {
  if (entries.length === 0) {
    return { ok: true, data: { upserted: 0, paths: [] } };
  }

  const now = new Date().toISOString();
  const normalizedEntries = entries
    .map((e) => ({ ...e, path: normalizePath(e.path) }))
    .filter((e) => !validatePath(e.path));

  const paths = normalizedEntries.map((e) => e.path);

  // Pre-fetch existing files to determine versions
  let q = supabaseAdmin
    .from("files")
    .select("id, path, current_version")
    .eq("user_id", auth.userId)
    .in("path", paths);
  q = orgFilter(q, auth);
  const { data: existingRows } = await q;

  const existingMap = new Map<string, { id: string; current_version: number }>();
  for (const row of existingRows ?? []) {
    existingMap.set(row.path, { id: row.id, current_version: row.current_version });
  }

  // Ensure parent folders for all entries
  const parentPaths = new Set<string>();
  for (const e of normalizedEntries) {
    const parent = getParentPath(e.path);
    if (parent !== "/") parentPaths.add(parent);
  }
  for (const parent of parentPaths) {
    await ensureParentFolders(auth, parent + "/_");
  }

  const insertRows: Array<Record<string, unknown>> = [];
  const updateEntries: Array<{ id: string; row: Record<string, unknown> }> = [];

  for (const e of normalizedEntries) {
    const existing = existingMap.get(e.path);
    const row = {
      user_id: auth.userId,
      organization_id: auth.organizationId ?? null,
      path: e.path,
      name: getFileName(e.path),
      parent_path: getParentPath(e.path),
      is_folder: false,
      content: e.content,
      metadata: e.metadata ?? {},
      current_version: existing ? existing.current_version + 1 : 1,
      updated_at: now,
    };
    if (existing) {
      updateEntries.push({ id: existing.id, row });
    } else {
      insertRows.push(row);
    }
  }

  const results: Array<Record<string, unknown>> = [];

  // Batch insert new files
  if (insertRows.length > 0) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("files")
      .insert(insertRows)
      .select("id, path, name, content, metadata, current_version");
    if (insertError) return { ok: false, error: insertError.message, status: 500 };
    if (inserted) results.push(...inserted);
  }

  // Update existing files one by one (each needs its own .eq("id", ...))
  for (const { id, row } of updateEntries) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("files")
      .update(row)
      .eq("id", id)
      .select("id, path, name, content, metadata, current_version")
      .single();
    if (updateError) return { ok: false, error: updateError.message, status: 500 };
    if (updated) results.push(updated);
  }

  const upserted = results;

  // Batch-insert version rows
  if (upserted && upserted.length > 0) {
    const versionRows = upserted.map((f) => ({
      file_id: f.id,
      version: f.current_version,
      path: f.path,
      name: f.name,
      content: f.content,
      metadata: f.metadata ?? {},
      change_type: existingMap.has(f.path as string) ? "updated" : "created",
      changed_by: auth.userId,
    }));
    const { error: batchVersionError } = await supabaseAdmin.from("file_versions").insert(versionRows);
    if (batchVersionError) console.error("Failed to record file versions:", batchVersionError.message);
  }

  // Batch embed non-folder files
  const embeddableFiles = upserted.filter(shouldEmbedFile);
  if (embeddableFiles.length > 0) {
    upsertEmbeddings(
      FILE_TABLE,
      FILE_ID_COL,
      embeddableFiles.map((f) => ({
        id: f.id as string,
        searchText: buildFileSearchText(f),
        extraColumns: { path: f.path as string, name: f.name as string },
      })),
    ).catch((err) => console.warn("[files] bulk embedding failed:", err));
  }

  return { ok: true, data: { upserted: upserted.length, paths: upserted.map((r) => r.path as string) } };
}

// ── Semantic file search ──

export async function searchFilesWithEmbeddings(
  auth: FileAuth,
  opts: { query: string; path?: string; limit?: number },
): Promise<ServiceResult<FileListItem[]>> {
  const limit = opts.limit ?? 20;
  const { rpc, filterParam } = EMBEDDING_TABLES.files;

  // Fetch visible file metadata only (no content — avoids loading large blobs)
  let q = supabaseAdmin
    .from("files")
    .select("id, path, name, is_folder, mime_type, current_version, updated_at")
    .eq("user_id", auth.userId)
    .eq("is_folder", false);
  q = orgFilter(q, auth);

  if (opts.path) {
    const normalized = normalizePath(opts.path);
    q = q.like("path", normalized + "%");
  }

  q = q.limit(500);

  const { data: files, error } = await q;
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!files || files.length === 0) return { ok: true, data: [] };

  const fileIds = files.map((f) => f.id as string);

  // Semantic search via pgvector
  const queryEmbedding = await getQueryEmbedding(opts.query);
  const semanticScores = new Map<string, number>();
  if (queryEmbedding.length > 0) {
    const dbResults = await searchByEmbedding(rpc, queryEmbedding, fileIds, filterParam, limit * 3);
    for (const r of dbResults) semanticScores.set(r.id, r.similarity);
  }

  // Keyword search on name + path (lightweight, no content needed)
  const queryKeywords = extractKeywords(opts.query);
  const kwScores = new Map<string, number>();
  if (queryKeywords.length > 0) {
    for (const f of files) {
      const nameAndPath = `${f.name as string} ${f.path as string}`;
      const entryKeywords = extractKeywords(nameAndPath);
      const score = keywordScore(queryKeywords, entryKeywords);
      if (score > 0) kwScores.set(f.id as string, score);
    }
  }

  // Hybrid scoring
  const hasSemantic = semanticScores.size > 0;
  const scored = files.map((f) => {
    const id = f.id as string;
    const semantic = semanticScores.get(id) ?? 0;
    const kw = kwScores.get(id) ?? 0;
    const score = hybridScore(semantic, kw, 0, hasSemantic);
    return { file: f, score };
  });

  const threshold = hasSemantic ? 0.15 : 0.05;
  const filtered = scored
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Fetch content only for the final results (for formatListItem's size calc)
  const resultIds = filtered.map((r) => r.file.id as string);
  if (resultIds.length > 0) {
    const { data: contentRows } = await supabaseAdmin
      .from("files")
      .select("id, content")
      .in("id", resultIds);
    const contentMap = new Map<string, string | null>();
    for (const row of contentRows ?? []) {
      contentMap.set(row.id, row.content);
    }
    for (const r of filtered) {
      (r.file as Record<string, unknown>).content = contentMap.get(r.file.id as string) ?? null;
    }
  }

  return {
    ok: true,
    data: filtered.map((r) => formatListItem(r.file)),
  };
}

// ── Markdown Formatting (for /api/fs export) ──

export async function formatFilesAsMarkdown(
  auth: FileAuth,
): Promise<ServiceResult<{ markdown: string; files: FileEntry[]; updatedAt: string }>> {
  const result = await getAllFiles(auth);
  if (!result.ok) return result;

  const files = result.data.filter((f) => !f.isFolder);
  if (files.length === 0) {
    return {
      ok: true,
      data: { markdown: "# Files\n\nNo files yet.", files: [], updatedAt: new Date().toISOString() },
    };
  }

  const sections = files.map((f) => `## ${f.path}\n${f.content ?? ""}`);
  const markdown = `# Files\n\n${sections.join("\n\n")}`;
  const latestUpdate = files.reduce(
    (latest, f) => (f.updatedAt > latest ? f.updatedAt : latest),
    files[0].updatedAt,
  );

  return { ok: true, data: { markdown, files, updatedAt: latestUpdate } };
}

export function parseMarkdownToFiles(
  markdown: string,
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const sections = markdown.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    if (section.startsWith("# ")) continue;

    const newlineIdx = section.indexOf("\n");
    if (newlineIdx === -1) {
      const path = section.trim();
      if (path) files.push({ path, content: "" });
    } else {
      const path = section.slice(0, newlineIdx).trim();
      const content = section.slice(newlineIdx + 1).trim();
      if (path) files.push({ path, content });
    }
  }

  return files;
}

export async function parseAndUpsertFiles(
  auth: FileAuth,
  markdown: string,
): Promise<ServiceResult<{ upserted: number; paths: string[] }>> {
  if (markdown.length > 10_000_000) {
    return { ok: false, error: "Markdown input too large (max 10MB)", status: 413 };
  }
  const entries = parseMarkdownToFiles(markdown);
  return bulkWriteFiles(auth, entries);
}
