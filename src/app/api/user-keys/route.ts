import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/api-auth";
import { encrypt } from "@/lib/encryption";
import { allProxyIntegrations } from "@/lib/integrations/proxy-registry";
import { validateIntegrationKey } from "@/lib/integrations/validate-key";

export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { type, targetId, apiKey, customHeaders } = (await req.json()) as {
    type: "custom-mcp" | "proxy";
    targetId: string;
    apiKey?: string;
    customHeaders?: Record<string, string>;
  };

  if (!type || !targetId || (!apiKey && !customHeaders)) {
    return NextResponse.json(
      { error: "type, targetId, and either apiKey or customHeaders are required" },
      { status: 400 }
    );
  }

  if (type === "custom-mcp") {
    // Verify server exists and is accessible (global or user's org)
    const { data: server } = await supabaseAdmin
      .from("custom_mcp_servers")
      .select("id, server_url, auth_type")
      .eq("id", targetId)
      .eq("status", "active")
      .or(`organization_id.is.null,organization_id.eq.${auth.organizationId}`)
      .single();

    if (!server) {
      return NextResponse.json(
        { error: "MCP server not found" },
        { status: 404 }
      );
    }

    // Validate credentials against the server before saving
    const validation = await validateIntegrationKey(targetId, apiKey ?? "", {
      type: "custom-mcp",
      serverUrl: server.server_url,
      customHeaders:
        customHeaders && Object.keys(customHeaders).length > 0
          ? customHeaders
          : undefined,
    });
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 422 });
    }

    // Build upsert payload: either apiKey or customHeaders
    const upsertData: Record<string, unknown> = {
      user_id: auth.userId,
      server_id: targetId,
    };

    if (customHeaders && Object.keys(customHeaders).length > 0) {
      const encryptedHeaders: Record<string, string> = {};
      for (const [hk, hv] of Object.entries(customHeaders)) {
        encryptedHeaders[hk] = encrypt(hv);
      }
      upsertData.custom_headers = encryptedHeaders;
      upsertData.api_key = null;
    } else if (apiKey) {
      upsertData.api_key = encrypt(apiKey);
      upsertData.custom_headers = null;
    }

    const { error } = await supabaseAdmin
      .from("custom_mcp_user_keys")
      .upsert(upsertData, { onConflict: "user_id,server_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If no tools discovered yet, use tools from validation (avoids a second discoverTools call)
    const { count } = await supabaseAdmin
      .from("custom_mcp_tools")
      .select("id", { count: "exact", head: true })
      .eq("server_id", targetId);

    const tools = validation.discoveredTools ?? [];
    if (count === 0 && tools.length > 0) {
      await supabaseAdmin.from("custom_mcp_tools").insert(
        tools.map((t) => ({
          server_id: targetId,
          tool_name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
          enabled: true,
        }))
      );

      await supabaseAdmin
        .from("custom_mcp_servers")
        .update({
          last_discovered_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", targetId);

      return NextResponse.json({ ok: true, discoveredTools: tools.length });
    }
  } else if (type === "proxy") {
    // Validate integration exists and is per_user
    const integration = allProxyIntegrations.find(
      (i) => i.id === targetId && i.keyMode === "per_user"
    );
    if (!integration) {
      return NextResponse.json(
        { error: "Unknown per-user integration" },
        { status: 400 }
      );
    }

    if (integration.headerKeys?.length && customHeaders) {
      // Multi-header auth (e.g. Datadog)
      const missingKeys = integration.headerKeys.filter((k) => !customHeaders[k]);
      if (missingKeys.length > 0) {
        return NextResponse.json(
          { error: `Missing required headers: ${missingKeys.join(", ")}` },
          { status: 400 }
        );
      }

      const encryptedHeaders: Record<string, string> = {};
      for (const [hk, hv] of Object.entries(customHeaders)) {
        encryptedHeaders[hk] = encrypt(hv);
      }

      const { error } = await supabaseAdmin
        .from("proxy_user_keys")
        .upsert(
          {
            user_id: auth.userId,
            integration_id: targetId,
            api_key: null,
            custom_headers: encryptedHeaders,
          },
          { onConflict: "user_id,integration_id" }
        );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Single API key flow
      const proxyValidation = await validateIntegrationKey(targetId, apiKey!.trim(), {
        type: "proxy",
        serverUrl: integration.serverUrl,
      });
      if (!proxyValidation.valid) {
        return NextResponse.json({ error: proxyValidation.error }, { status: 422 });
      }

      const { error } = await supabaseAdmin
        .from("proxy_user_keys")
        .upsert(
          {
            user_id: auth.userId,
            integration_id: targetId,
            api_key: encrypt(apiKey!.trim()),
            custom_headers: null,
          },
          { onConflict: "user_id,integration_id" }
        );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const targetId = searchParams.get("targetId");

  if (!type || !targetId) {
    return NextResponse.json(
      { error: "type and targetId are required" },
      { status: 400 }
    );
  }

  if (type === "custom-mcp") {
    await supabaseAdmin
      .from("custom_mcp_user_keys")
      .delete()
      .eq("user_id", auth.userId)
      .eq("server_id", targetId);
  } else if (type === "proxy") {
    await supabaseAdmin
      .from("proxy_user_keys")
      .delete()
      .eq("user_id", auth.userId)
      .eq("integration_id", targetId);
  } else {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
