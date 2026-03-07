import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_AGENT_TEMPLATES, type AgentTemplate } from "@/lib/agents/templates";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("agent_templates")
    .select("*")
    .eq("enabled", true)
    .order("sort_order");

  if (error || !data || data.length === 0) {
    return NextResponse.json(DEFAULT_AGENT_TEMPLATES);
  }

  const templates: AgentTemplate[] = data.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description ?? "",
    instructions: t.instructions,
    toolAccess: t.tool_access as string[],
    model: t.model ?? undefined,
    category: t.category as "general" | "integration",
    defaultScope: t.default_scope as "organization" | "user",
  }));

  return NextResponse.json(templates);
}
