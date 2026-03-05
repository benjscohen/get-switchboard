import { supabaseAdmin } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/encryption";

// ── Types ──

export type ServiceResult<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: string; status: number };

export interface VaultAuth {
  userId: string;
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

interface SecretListItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  fieldNames: SecretFieldMeta[];
  createdAt: string;
  updatedAt: string;
}

interface SecretDetail extends SecretListItem {
  fields: Array<{ name: string; value: string; sensitive: boolean }>;
}

// ── Service Functions ──

export async function listSecrets(
  auth: VaultAuth
): Promise<ServiceResult<SecretListItem[]>> {
  const { data: secrets, error } = await supabaseAdmin
    .from("vault_secrets")
    .select("id, name, description, category, tags, created_at, updated_at")
    .eq("user_id", auth.userId)
    .order("name");

  if (error) return { ok: false, error: error.message, status: 500 };

  const secretIds = (secrets ?? []).map((s) => s.id);
  let fieldMeta: Array<{ secret_id: string; field_name: string; sensitive: boolean }> = [];

  if (secretIds.length > 0) {
    const { data: fields } = await supabaseAdmin
      .from("vault_secret_fields")
      .select("secret_id, field_name, sensitive, sort_order")
      .in("secret_id", secretIds)
      .order("sort_order");
    fieldMeta = fields ?? [];
  }

  const fieldsBySecret = new Map<string, SecretFieldMeta[]>();
  for (const f of fieldMeta) {
    const arr = fieldsBySecret.get(f.secret_id) ?? [];
    arr.push({ name: f.field_name, sensitive: f.sensitive });
    fieldsBySecret.set(f.secret_id, arr);
  }

  const result: SecretListItem[] = (secrets ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    tags: s.tags,
    fieldNames: fieldsBySecret.get(s.id) ?? [],
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));

  return { ok: true, data: result };
}

export async function getSecret(
  auth: VaultAuth,
  id: string
): Promise<ServiceResult<SecretDetail>> {
  const { data: secret, error } = await supabaseAdmin
    .from("vault_secrets")
    .select("*")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();

  if (error || !secret) return { ok: false, error: "Secret not found", status: 404 };

  const { data: fields } = await supabaseAdmin
    .from("vault_secret_fields")
    .select("field_name, encrypted_value, sensitive, sort_order")
    .eq("secret_id", id)
    .order("sort_order");

  return {
    ok: true,
    data: {
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
    },
  };
}

export async function getSecretByName(
  auth: VaultAuth,
  name: string
): Promise<ServiceResult<SecretDetail>> {
  const { data: secret, error } = await supabaseAdmin
    .from("vault_secrets")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("name", name)
    .single();

  if (error || !secret) return { ok: false, error: "Secret not found", status: 404 };
  return getSecret(auth, secret.id);
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
    field_name: f.name,
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
        field_name: f.name,
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
  opts: { query?: string; category?: string; tags?: string[] }
): Promise<ServiceResult<SecretListItem[]>> {
  let q = supabaseAdmin
    .from("vault_secrets")
    .select("id, name, description, category, tags, created_at, updated_at")
    .eq("user_id", auth.userId);

  if (opts.query) {
    q = q.ilike("name", `%${opts.query}%`);
  }
  if (opts.category) {
    q = q.eq("category", opts.category);
  }
  if (opts.tags && opts.tags.length > 0) {
    q = q.overlaps("tags", opts.tags);
  }

  const { data: secrets, error } = await q.order("name");
  if (error) return { ok: false, error: error.message, status: 500 };

  const secretIds = (secrets ?? []).map((s) => s.id);
  let fieldMeta: Array<{ secret_id: string; field_name: string; sensitive: boolean }> = [];

  if (secretIds.length > 0) {
    const { data: fields } = await supabaseAdmin
      .from("vault_secret_fields")
      .select("secret_id, field_name, sensitive, sort_order")
      .in("secret_id", secretIds)
      .order("sort_order");
    fieldMeta = fields ?? [];
  }

  const fieldsBySecret = new Map<string, SecretFieldMeta[]>();
  for (const f of fieldMeta) {
    const arr = fieldsBySecret.get(f.secret_id) ?? [];
    arr.push({ name: f.field_name, sensitive: f.sensitive });
    fieldsBySecret.set(f.secret_id, arr);
  }

  const result: SecretListItem[] = (secrets ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    tags: s.tags,
    fieldNames: fieldsBySecret.get(s.id) ?? [],
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));

  return { ok: true, data: result };
}
