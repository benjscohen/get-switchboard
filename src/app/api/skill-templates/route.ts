import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_TEMPLATES, type SkillTemplate } from "@/lib/skills/templates";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("skill_templates")
    .select("*")
    .eq("enabled", true)
    .order("sort_order");

  if (error || !data || data.length === 0) {
    // Fallback to hardcoded templates if DB table missing or empty
    return NextResponse.json(DEFAULT_TEMPLATES);
  }

  const templates: SkillTemplate[] = data.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description ?? "",
    content: t.content,
    arguments: t.arguments as SkillTemplate["arguments"],
    category: t.category as "general" | "integration",
    requiredIntegration: t.required_integration ?? undefined,
    defaultScope: t.default_scope as "organization" | "user",
  }));

  return NextResponse.json(templates);
}
