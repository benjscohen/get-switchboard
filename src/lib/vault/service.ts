import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/encryption";

// ── Types ──

export type ServiceResult<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: string; status: number };

export interface VaultAuth {
  userId: string;
  organizationId?: string;
  orgRole?: string;
}

export interface SecretField {
  name: string;
  value: string;
  sensitive?: boolean;
}

export interface SecretFieldMeta {
  name: string;
  sensitive: boolean;
}

type VaultCategory = "api_key" | "credential" | "payment" | "note" | "other";

interface CreateSecretInput {
  name: string;
  description?: string;
  category?: VaultCategory;
  tags?: string[];
  fields: SecretField[];
}

interface UpdateSecretInput {
  name?: string;
  description?: string;
  category?: VaultCategory;
  tags?: string[];
  fields?: SecretField[];
}

export interface ShareSummary {
  users: number;
  teams: number;
  organizations: number;
}

interface SecretListItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  fieldNames: SecretFieldMeta[];
  createdAt: string;
  updatedAt: string;
  ownership?: "owned" | "shared";
  sharedBy?: string;
  shareSummary?: ShareSummary;
}

interface SecretDetail extends SecretListItem {
  fields: Array<{ name: string; value: string; sensitive: boolean }>;
}

export type ShareTarget =
  | { user_id: string }
  | { team_id: string }
  | { organization_id: string };

export interface VaultShare {
  id: string;
  secretId: string;
  targetType: "user" | "team" | "organization";
  targetId: string;
  targetLabel: string;
  createdBy: string;
  createdAt: string;
}

// ── Helpers ──

type SecretRow = { id: string; name: string; description: string | null; category: string; tags: string[]; created_at: string; updated_at: string };
type SecretRowWithOwner = SecretRow & { user_id: string };

function buildFieldMap(
  fieldMeta: Array<{ secret_id: string; field_name: string; sensitive: boolean }>
): Map<string, SecretFieldMeta[]> {
  const map = new Map<string, SecretFieldMeta[]>();
  for (const f of fieldMeta) {
    const arr = map.get(f.secret_id) ?? [];
    arr.push({ name: f.field_name, sensitive: f.sensitive });
    map.set(f.secret_id, arr);
  }
  return map;
}

async function fetchFieldMeta(
  secretIds: string[]
): Promise<Array<{ secret_id: string; field_name: string; sensitive: boolean }>> {
  if (secretIds.length === 0) return [];
  const { data: fields } = await supabaseAdmin
    .from("vault_secret_fields")
    .select("secret_id, field_name, sensitive, sort_order")
    .in("secret_id", secretIds)
    .order("sort_order");
  return fields ?? [];
}

async function fetchShareSummaries(
  secretIds: string[]
): Promise<Map<string, ShareSummary>> {
  const map = new Map<string, ShareSummary>();
  if (secretIds.length === 0) return map;

  const { data: shares } = await supabaseAdmin
    .from("vault_shares")
    .select("secret_id, user_id, team_id, organization_id")
    .in("secret_id", secretIds);

  if (!shares) return map;

  for (const s of shares) {
    const summary = map.get(s.secret_id) ?? { users: 0, teams: 0, organizations: 0 };
    if (s.user_id) summary.users++;
    else if (s.team_id) summary.teams++;
    else if (s.organization_id) summary.organizations++;
    map.set(s.secret_id, summary);
  }

  return map;
}

function toSecretListItem(
  s: SecretRow,
  fieldsBySecret: Map<string, SecretFieldMeta[]>,
  ownership?: "owned" | "shared",
  sharedBy?: string
): SecretListItem {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    tags: s.tags,
    fieldNames: fieldsBySecret.get(s.id) ?? [],
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    ...(ownership ? { ownership } : {}),
    ...(sharedBy ? { sharedBy } : {}),
  };
}

function canManageShares(auth: VaultAuth, ownerUserId: string): boolean {
  return auth.userId === ownerUserId || auth.orgRole === "owner" || auth.orgRole === "admin";
}

/**
 * Check whether a user can access a secret (owner or via share).
 * Returns "owned" | "shared" | null.
 */
export async function canAccessSecret(
  auth: VaultAuth,
  secretId: string
): Promise<"owned" | "shared" | null> {
  // Check ownership
  const { data: owned } = await supabaseAdmin
    .from("vault_secrets")
    .select("id")
    .eq("id", secretId)
    .eq("user_id", auth.userId)
    .single();
  if (owned) return "owned";

  // Check all share types in parallel
  const teamIdsPromise = supabaseAdmin
    .from("team_members")
    .select("team_id")
    .eq("user_id", auth.userId);

  const [{ data: userShare }, { data: teamIds }, orgShareResult] = await Promise.all([
    supabaseAdmin
      .from("vault_shares")
      .select("id")
      .eq("secret_id", secretId)
      .eq("user_id", auth.userId)
      .limit(1)
      .maybeSingle(),
    teamIdsPromise,
    auth.organizationId
      ? supabaseAdmin
          .from("vault_shares")
          .select("id")
          .eq("secret_id", secretId)
          .eq("organization_id", auth.organizationId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (userShare) return "shared";
  if (orgShareResult.data) return "shared";

  // Team share check (depends on teamIds result)
  if (teamIds && teamIds.length > 0) {
    const { data: teamShare } = await supabaseAdmin
      .from("vault_shares")
      .select("id")
      .eq("secret_id", secretId)
      .in("team_id", teamIds.map((t) => t.team_id))
      .limit(1)
      .maybeSingle();
    if (teamShare) return "shared";
  }

  return null;
}

/**
 * Get the IDs of all secrets shared with a user (direct, team, org).
 */
async function getSharedSecretIds(auth: VaultAuth): Promise<string[]> {
  const sharedIds = new Set<string>();

  // Fetch user shares, team memberships, and org shares in parallel
  const [{ data: userShares }, { data: teamIds }, orgShares] = await Promise.all([
    supabaseAdmin
      .from("vault_shares")
      .select("secret_id")
      .eq("user_id", auth.userId),
    supabaseAdmin
      .from("team_members")
      .select("team_id")
      .eq("user_id", auth.userId),
    auth.organizationId
      ? supabaseAdmin
          .from("vault_shares")
          .select("secret_id")
          .eq("organization_id", auth.organizationId)
      : Promise.resolve({ data: null }),
  ]);

  for (const s of userShares ?? []) sharedIds.add(s.secret_id);
  for (const s of orgShares.data ?? []) sharedIds.add(s.secret_id);

  // Team shares (depends on teamIds)
  if (teamIds && teamIds.length > 0) {
    const { data: teamShares } = await supabaseAdmin
      .from("vault_shares")
      .select("secret_id")
      .in("team_id", teamIds.map((t) => t.team_id));
    for (const s of teamShares ?? []) sharedIds.add(s.secret_id);
  }

  return Array.from(sharedIds);
}

// ── Shared listing logic ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryFilter = (q: any) => any;

async function fetchOwnedAndSharedSecrets(
  auth: VaultAuth,
  include: "owned" | "shared" | "all",
  filter?: QueryFilter
): Promise<ServiceResult<SecretListItem[]>> {
  const result: SecretListItem[] = [];
  const allSecretIds: string[] = [];
  const applyFilter = filter ?? ((q) => q);

  // Owned secrets
  let ownedSecrets: SecretRow[] = [];
  if (include === "owned" || include === "all") {
    const { data: secrets, error } = await applyFilter(
      supabaseAdmin
        .from("vault_secrets")
        .select("id, name, description, category, tags, created_at, updated_at")
        .eq("user_id", auth.userId)
    ).order("name");
    if (error) return { ok: false, error: error.message, status: 500 };
    ownedSecrets = secrets ?? [];
    for (const s of ownedSecrets) allSecretIds.push(s.id);
  }

  // Shared secrets
  let sharedSecrets: SecretRowWithOwner[] = [];
  const sharedOwnerNames = new Map<string, string>();
  if (include === "shared" || include === "all") {
    const sharedIds = await getSharedSecretIds(auth);
    const ownedIds = new Set(ownedSecrets.map((s) => s.id));
    const filteredIds = sharedIds.filter((id) => !ownedIds.has(id));

    if (filteredIds.length > 0) {
      const { data: secrets } = await applyFilter(
        supabaseAdmin
          .from("vault_secrets")
          .select("id, name, description, category, tags, created_at, updated_at, user_id")
          .in("id", filteredIds)
      ).order("name");
      sharedSecrets = secrets ?? [];
      for (const s of sharedSecrets) allSecretIds.push(s.id);

      const ownerIds = [...new Set(sharedSecrets.map((s) => s.user_id))];
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, display_name, email")
          .in("id", ownerIds);
        for (const p of profiles ?? []) {
          sharedOwnerNames.set(p.id, p.display_name || p.email || "Unknown");
        }
      }
    }
  }

  const ownedIds = ownedSecrets.map((s) => s.id);
  const [fieldMeta, shareSummaries] = await Promise.all([
    fetchFieldMeta(allSecretIds),
    fetchShareSummaries(ownedIds),
  ]);
  const fieldsBySecret = buildFieldMap(fieldMeta);

  for (const s of ownedSecrets) {
    const item = toSecretListItem(s, fieldsBySecret, include === "all" ? "owned" : undefined);
    const summary = shareSummaries.get(s.id);
    if (summary) item.shareSummary = summary;
    result.push(item);
  }
  for (const s of sharedSecrets) {
    result.push(toSecretListItem(s, fieldsBySecret, "shared", sharedOwnerNames.get(s.user_id)));
  }

  return { ok: true, data: result };
}

// ── Service Functions ──

export async function listSecrets(
  auth: VaultAuth,
  include: "owned" | "shared" | "all" = "all"
): Promise<ServiceResult<SecretListItem[]>> {
  return fetchOwnedAndSharedSecrets(auth, include);
}

export async function getSecret(
  auth: VaultAuth,
  id: string
): Promise<ServiceResult<SecretDetail>> {
  const access = await canAccessSecret(auth, id);
  if (!access) return { ok: false, error: "Secret not found", status: 404 };

  const { data: secret, error } = await supabaseAdmin
    .from("vault_secrets")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !secret) return { ok: false, error: "Secret not found", status: 404 };

  const { data: fields } = await supabaseAdmin
    .from("vault_secret_fields")
    .select("field_name, encrypted_value, sensitive, sort_order")
    .eq("secret_id", id)
    .order("sort_order");

  const detail: SecretDetail = {
    id: secret.id,
    name: secret.name,
    description: secret.description,
    category: secret.category,
    tags: secret.tags,
    fieldNames: (fields ?? []).map((f) => ({ name: f.field_name, sensitive: f.sensitive })),
    fields: (fields ?? []).map((f) => ({
      name: f.field_name,
      value: decrypt(f.encrypted_value),
      sensitive: f.sensitive,
    })),
    createdAt: secret.created_at,
    updatedAt: secret.updated_at,
    ownership: access,
  };

  // Add sharedBy for shared secrets
  if (access === "shared") {
    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("display_name, email")
      .eq("id", secret.user_id)
      .single();
    if (owner) detail.sharedBy = owner.display_name || owner.email || undefined;
  }

  return { ok: true, data: detail };
}

export async function getSecretByName(
  auth: VaultAuth,
  name: string
): Promise<ServiceResult<SecretDetail>> {
  // First check owned secrets
  const { data: secret } = await supabaseAdmin
    .from("vault_secrets")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("name", name)
    .single();

  if (secret) return getSecret(auth, secret.id);

  // Then check shared secrets by name
  const sharedIds = await getSharedSecretIds(auth);
  if (sharedIds.length > 0) {
    const { data: sharedSecret } = await supabaseAdmin
      .from("vault_secrets")
      .select("id")
      .in("id", sharedIds)
      .eq("name", name)
      .single();
    if (sharedSecret) return getSecret(auth, sharedSecret.id);
  }

  return { ok: false, error: "Secret not found", status: 404 };
}

export async function createSecret(
  auth: VaultAuth,
  input: CreateSecretInput
): Promise<ServiceResult<SecretDetail>> {
  if (!input.name?.trim()) {
    return { ok: false, error: "name is required", status: 400 };
  }
  if (!input.fields || input.fields.length === 0) {
    return { ok: false, error: "At least one field is required", status: 400 };
  }

  // Validate field names
  const fieldNamesSeen = new Set<string>();
  for (const f of input.fields) {
    if (!f.name?.trim()) {
      return { ok: false, error: "All fields must have a non-empty name", status: 400 };
    }
    const lower = f.name.trim().toLowerCase();
    if (fieldNamesSeen.has(lower)) {
      return { ok: false, error: `Duplicate field name: "${f.name.trim()}"`, status: 400 };
    }
    fieldNamesSeen.add(lower);
  }

  const { data: secret, error } = await supabaseAdmin
    .from("vault_secrets")
    .insert({
      user_id: auth.userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category ?? "other",
      tags: input.tags ?? [],
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A secret with this name already exists", status: 409 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  const fieldRows = input.fields.map((f, i) => ({
    secret_id: secret.id,
    field_name: f.name.trim(),
    encrypted_value: encrypt(f.value),
    sensitive: f.sensitive ?? true,
    sort_order: i,
  }));

  const { error: fieldError } = await supabaseAdmin
    .from("vault_secret_fields")
    .insert(fieldRows);

  if (fieldError) {
    await supabaseAdmin.from("vault_secrets").delete().eq("id", secret.id);
    return { ok: false, error: fieldError.message, status: 500 };
  }

  return getSecret(auth, secret.id);
}

export async function updateSecret(
  auth: VaultAuth,
  id: string,
  input: UpdateSecretInput
): Promise<ServiceResult<SecretDetail>> {
  const { data: existing } = await supabaseAdmin
    .from("vault_secrets")
    .select("id")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();

  if (!existing) return { ok: false, error: "Secret not found", status: 404 };

  if (input.fields !== undefined && input.fields.length === 0) {
    return { ok: false, error: "At least one field is required", status: 400 };
  }

  // Validate field names
  if (input.fields) {
    const fieldNamesSeen = new Set<string>();
    for (const f of input.fields) {
      if (!f.name?.trim()) {
        return { ok: false, error: "All fields must have a non-empty name", status: 400 };
      }
      const lower = f.name.trim().toLowerCase();
      if (fieldNamesSeen.has(lower)) {
        return { ok: false, error: `Duplicate field name: "${f.name.trim()}"`, status: 400 };
      }
      fieldNamesSeen.add(lower);
    }
  }

  // Update metadata
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.category !== undefined) updates.category = input.category;
  if (input.tags !== undefined) updates.tags = input.tags;

  const { error: updateError } = await supabaseAdmin
    .from("vault_secrets")
    .update(updates)
    .eq("id", id);

  if (updateError) {
    if (updateError.code === "23505") {
      return { ok: false, error: "A secret with this name already exists", status: 409 };
    }
    return { ok: false, error: updateError.message, status: 500 };
  }

  // Replace fields if provided
  if (input.fields) {
    await supabaseAdmin
      .from("vault_secret_fields")
      .delete()
      .eq("secret_id", id);

    if (input.fields.length > 0) {
      const fieldRows = input.fields.map((f, i) => ({
        secret_id: id,
        field_name: f.name.trim(),
        encrypted_value: encrypt(f.value),
        sensitive: f.sensitive ?? true,
        sort_order: i,
      }));

      const { error: fieldError } = await supabaseAdmin
        .from("vault_secret_fields")
        .insert(fieldRows);

      if (fieldError) return { ok: false, error: fieldError.message, status: 500 };
    }
  }

  return getSecret(auth, id);
}

export async function deleteSecret(
  auth: VaultAuth,
  id: string
): Promise<ServiceResult<{ deleted: true }>> {
  const { data: existing } = await supabaseAdmin
    .from("vault_secrets")
    .select("id")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();

  if (!existing) return { ok: false, error: "Secret not found", status: 404 };

  const { error } = await supabaseAdmin.from("vault_secrets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message, status: 500 };

  return { ok: true, data: { deleted: true } };
}

export async function searchSecrets(
  auth: VaultAuth,
  opts: { query?: string; category?: string; tags?: string[]; include?: "owned" | "shared" | "all" }
): Promise<ServiceResult<SecretListItem[]>> {
  const filter: QueryFilter = (q) => {
    let filtered = q;
    if (opts.query) filtered = filtered.ilike("name", `%${opts.query}%`);
    if (opts.category) filtered = filtered.eq("category", opts.category);
    if (opts.tags && opts.tags.length > 0) filtered = filtered.overlaps("tags", opts.tags);
    return filtered;
  };
  return fetchOwnedAndSharedSecrets(auth, opts.include ?? "all", filter);
}

// ── Sharing Functions ──

export async function shareSecret(
  auth: VaultAuth,
  secretId: string,
  target: ShareTarget
): Promise<ServiceResult<VaultShare>> {
  // Only the owner can share
  const { data: secret } = await supabaseAdmin
    .from("vault_secrets")
    .select("id, user_id")
    .eq("id", secretId)
    .eq("user_id", auth.userId)
    .single();

  if (!secret) return { ok: false, error: "Secret not found", status: 404 };

  // Prevent sharing with yourself
  if ("user_id" in target && target.user_id === auth.userId) {
    return { ok: false, error: "Cannot share a secret with yourself", status: 400 };
  }

  const { data: share, error } = await supabaseAdmin
    .from("vault_shares")
    .insert({
      secret_id: secretId,
      ...target,
      created_by: auth.userId,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "This secret is already shared with this target", status: 409 };
    }
    return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true, data: await resolveShare(share) };
}

export async function unshareSecret(
  auth: VaultAuth,
  secretId: string,
  shareId: string
): Promise<ServiceResult<{ deleted: true }>> {
  const { data: secret } = await supabaseAdmin
    .from("vault_secrets")
    .select("id, user_id")
    .eq("id", secretId)
    .single();

  if (!secret) return { ok: false, error: "Secret not found", status: 404 };

  const isOwner = auth.userId === secret.user_id;
  const isOrgAdmin = auth.orgRole === "owner" || auth.orgRole === "admin";

  if (!isOwner && !isOrgAdmin) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  // Org admins (non-owners) can only remove org-level shares
  if (!isOwner && isOrgAdmin) {
    const { data: share } = await supabaseAdmin
      .from("vault_shares")
      .select("organization_id")
      .eq("id", shareId)
      .eq("secret_id", secretId)
      .single();

    if (!share) return { ok: false, error: "Share not found", status: 404 };
    if (!share.organization_id) {
      return { ok: false, error: "Org admins can only manage organization-level shares", status: 403 };
    }
  }

  const { error } = await supabaseAdmin
    .from("vault_shares")
    .delete()
    .eq("id", shareId)
    .eq("secret_id", secretId);

  if (error) return { ok: false, error: error.message, status: 500 };

  return { ok: true, data: { deleted: true } };
}

export async function listShares(
  auth: VaultAuth,
  secretId: string
): Promise<ServiceResult<VaultShare[]>> {
  // Owner or org admin can list shares
  const { data: secret } = await supabaseAdmin
    .from("vault_secrets")
    .select("id, user_id")
    .eq("id", secretId)
    .single();

  if (!secret) return { ok: false, error: "Secret not found", status: 404 };
  if (!canManageShares(auth, secret.user_id)) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  const { data: shares, error } = await supabaseAdmin
    .from("vault_shares")
    .select("*")
    .eq("secret_id", secretId)
    .order("created_at");

  if (error) return { ok: false, error: error.message, status: 500 };

  const resolved = await resolveShares(shares ?? []);
  return { ok: true, data: resolved };
}

type RawShare = {
  id: string;
  secret_id: string;
  user_id: string | null;
  team_id: string | null;
  organization_id: string | null;
  created_by: string;
  created_at: string;
};

/**
 * Batch-resolve raw vault_shares rows into VaultShares with human-readable labels.
 */
async function resolveShares(shares: RawShare[]): Promise<VaultShare[]> {
  if (shares.length === 0) return [];

  const userIds = [...new Set(shares.filter((s) => s.user_id).map((s) => s.user_id!))];
  const teamIds = [...new Set(shares.filter((s) => s.team_id).map((s) => s.team_id!))];
  const orgIds = [...new Set(shares.filter((s) => s.organization_id).map((s) => s.organization_id!))];

  // Batch fetch all labels in parallel
  const [profiles, teams, orgs] = await Promise.all([
    userIds.length > 0
      ? supabaseAdmin.from("profiles").select("id, display_name, email").in("id", userIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
    teamIds.length > 0
      ? supabaseAdmin.from("teams").select("id, name").in("id", teamIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
    orgIds.length > 0
      ? supabaseAdmin.from("organizations").select("id, name").in("id", orgIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.id, p.display_name || p.email || "Unknown"]));
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  return shares.map((share) => {
    let targetType: "user" | "team" | "organization";
    let targetId: string;
    let targetLabel = "Unknown";

    if (share.user_id) {
      targetType = "user";
      targetId = share.user_id;
      targetLabel = profileMap.get(share.user_id) ?? "Unknown";
    } else if (share.team_id) {
      targetType = "team";
      targetId = share.team_id;
      targetLabel = teamMap.get(share.team_id) ?? "Unknown";
    } else {
      targetType = "organization";
      targetId = share.organization_id!;
      targetLabel = orgMap.get(share.organization_id!) ?? "Unknown";
    }

    return {
      id: share.id,
      secretId: share.secret_id,
      targetType,
      targetId,
      targetLabel,
      createdBy: share.created_by,
      createdAt: share.created_at,
    };
  });
}

/**
 * Resolve a single share (used by shareSecret for the newly created row).
 */
async function resolveShare(share: RawShare): Promise<VaultShare> {
  const [resolved] = await resolveShares([share]);
  return resolved;
}
