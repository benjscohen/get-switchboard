import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { encrypt } from "@/lib/encryption";
import { discoverTools, type ProxyAuth } from "@/lib/mcp/proxy-client";
import { logAuditEvent, AuditEventType } from "@/lib/audit-log";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authenticated) return auth.response;

  const { data: servers, error } = await supabaseAdmin
    .from("custom_mcp_servers")
    .select("*, custom_mcp_tools(id, tool_name, description, enabled)")
    .is("organization_id", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    (servers ?? []).map((s) => {
      // Return custom header keys with hasValue flag (never expose decrypted values)
      const customHeaders = Array.isArray(s.custom_headers)
        ? (s.custom_headers as Array<{ key: string; value?: string }>).map((h) => ({
            key: h.key,
            hasValue: !!h.value,
          }))
        : null;

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        serverUrl: s.server_url,
        authType: s.auth_type,
        hasSharedKey: !!s.shared_api_key,
        keyMode: s.key_mode ?? "shared",
        userKeyInstructions: s.user_key_instructions ?? null,
        customHeaders,
        status: s.status,
        lastError: s.last_error,
        lastDiscoveredAt: s.last_discovered_at,
        createdAt: s.created_at,
        tools: (s.custom_mcp_tools ?? []).map(
          (t: { id: string; tool_name: string; description: string; enabled: boolean }) => ({
            id: t.id,
            toolName: t.tool_name,
            description: t.description,
            enabled: t.enabled,
          })
        ),
      };
    })
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authenticated) return auth.response;

  const body = await req.json();
  const { name, slug, description, serverUrl, authType, sharedApiKey, keyMode, userKeyInstructions, customHeaders } = body as {
    name: string;
    slug: string;
    description?: string;
    serverUrl: string;
    authType?: string;
    sharedApiKey?: string;
    keyMode?: "shared" | "per_user";
    userKeyInstructions?: string;
    customHeaders?: Array<{ key: string; value?: string }>;
  };

  if (!name || !slug || !serverUrl) {
    return NextResponse.json(
      { error: "name, slug, and serverUrl are required" },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json(
      { error: "slug must be lowercase alphanumeric with hyphens" },
      { status: 400 }
    );
  }

  const resolvedAuthType = authType ?? "bearer";
  const resolvedKeyMode = keyMode ?? "shared";

  // Build custom_headers JSONB for storage
  let storedCustomHeaders: Array<{ key: string; value?: string }> | null = null;
  if (resolvedAuthType === "custom_headers" && Array.isArray(customHeaders) && customHeaders.length > 0) {
    if (resolvedKeyMode === "per_user") {
      // Per-user: store only header keys (users provide values)
      storedCustomHeaders = customHeaders.map((h) => ({ key: h.key }));
    } else {
      // Shared: encrypt values
      storedCustomHeaders = customHeaders.map((h) => ({
        key: h.key,
        ...(h.value ? { value: encrypt(h.value) } : {}),
      }));
    }
  }

  const { data: server, error: insertError } = await supabaseAdmin
    .from("custom_mcp_servers")
    .insert({
      name,
      slug,
      description: description ?? "",
      server_url: serverUrl,
      auth_type: resolvedAuthType,
      shared_api_key: resolvedAuthType === "bearer" && resolvedKeyMode === "shared" && sharedApiKey ? encrypt(sharedApiKey) : null,
      key_mode: resolvedKeyMode,
      user_key_instructions: resolvedKeyMode === "per_user" ? (userKeyInstructions ?? null) : null,
      custom_headers: storedCustomHeaders,
    })
    .select()
    .single();

  if (insertError) {
    const msg = insertError.message.includes("duplicate")
      ? "A server with that slug or URL already exists"
      : insertError.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // Discover tools from the remote server
  // For per_user key mode, skip discovery — no key available yet
  let tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];
  if (resolvedKeyMode === "per_user") {
    await supabaseAdmin
      .from("custom_mcp_servers")
      .update({ status: "active" })
      .eq("id", server.id);
  } else {
    // Build auth for discovery
    let discoveryAuth: ProxyAuth;
    if (resolvedAuthType === "custom_headers" && Array.isArray(customHeaders) && customHeaders.length > 0) {
      const hdrs: Record<string, string> = {};
      for (const h of customHeaders) {
        if (h.key && h.value) hdrs[h.key] = h.value;
      }
      if (Object.keys(hdrs).length > 0) discoveryAuth = { headers: hdrs };
    } else if (sharedApiKey) {
      discoveryAuth = sharedApiKey;
    }

    try {
      tools = await discoverTools(serverUrl, discoveryAuth);

      if (tools.length > 0) {
        await supabaseAdmin.from("custom_mcp_tools").insert(
          tools.map((t) => ({
            server_id: server.id,
            tool_name: t.name,
            description: t.description,
            input_schema: t.inputSchema,
            enabled: false,
          }))
        );
      }

      await supabaseAdmin
        .from("custom_mcp_servers")
        .update({
          last_discovered_at: new Date().toISOString(),
          status: "active",
          last_error: null,
        })
        .eq("id", server.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Discovery failed";
      await supabaseAdmin
        .from("custom_mcp_servers")
        .update({ status: "error", last_error: message })
        .eq("id", server.id);
    }
  }

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.MCP_SERVER_CREATED,
    resourceType: "mcp_server",
    resourceId: server.id,
    description: `Created MCP server "${name}"`,
    metadata: { name, slug, serverUrl, authType: resolvedAuthType, keyMode: resolvedKeyMode },
  });

  return NextResponse.json({
    id: server.id,
    name: server.name,
    slug: server.slug,
    serverUrl: server.server_url,
    status: server.status,
    tools: tools.map((t) => ({
      toolName: t.name,
      description: t.description,
      enabled: false,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authenticated) return auth.response;

  const body = await req.json();
  const { id, name, description, serverUrl, authType, sharedApiKey, status, keyMode, userKeyInstructions, customHeaders } = body as {
    id: string;
    name?: string;
    description?: string;
    serverUrl?: string;
    authType?: string;
    sharedApiKey?: string | null;
    status?: string;
    keyMode?: "shared" | "per_user";
    userKeyInstructions?: string | null;
    customHeaders?: Array<{ key: string; value?: string }> | null;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (serverUrl !== undefined) updates.server_url = serverUrl;
  if (authType !== undefined) {
    updates.auth_type = authType;
    // When switching to custom_headers, clear shared_api_key; when switching away, clear custom_headers
    if (authType === "custom_headers") {
      updates.shared_api_key = null;
    } else if (authType !== "custom_headers") {
      updates.custom_headers = null;
    }
  }
  if (sharedApiKey !== undefined) {
    updates.shared_api_key = sharedApiKey ? encrypt(sharedApiKey) : null;
  }
  if (customHeaders !== undefined) {
    if (customHeaders === null) {
      updates.custom_headers = null;
    } else {
      const resolvedKM = keyMode ?? "shared";
      if (resolvedKM === "per_user") {
        updates.custom_headers = customHeaders.map((h) => ({ key: h.key }));
      } else {
        updates.custom_headers = customHeaders.map((h) => ({
          key: h.key,
          ...(h.value ? { value: encrypt(h.value) } : {}),
        }));
      }
    }
  }
  if (status !== undefined) updates.status = status;
  if (keyMode !== undefined) {
    updates.key_mode = keyMode;
    if (keyMode === "per_user") {
      updates.shared_api_key = null;
      if (userKeyInstructions !== undefined) {
        updates.user_key_instructions = userKeyInstructions;
      }
    } else {
      updates.user_key_instructions = null;
    }
  } else if (userKeyInstructions !== undefined) {
    updates.user_key_instructions = userKeyInstructions;
  }

  const { error } = await supabaseAdmin
    .from("custom_mcp_servers")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.MCP_SERVER_UPDATED,
    resourceType: "mcp_server",
    resourceId: id,
    description: "Updated MCP server",
    metadata: { updatedFields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("custom_mcp_servers")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  logAuditEvent({
    organizationId: auth.organizationId,
    actorId: auth.userId,
    eventType: AuditEventType.MCP_SERVER_DELETED,
    resourceType: "mcp_server",
    resourceId: id,
    description: "Deleted MCP server",
  });

  return NextResponse.json({ ok: true });
}
