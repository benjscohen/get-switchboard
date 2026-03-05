import { supabaseAdmin } from "@/lib/supabase/admin";

export function submitFeedback(data: {
  organizationId?: string;
  userId: string;
  apiKeyId?: string;
  category: "bug" | "missing_capability" | "confusing" | "integration_request" | "other";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  toolName?: string;
  context?: string;
  metadata?: Record<string, unknown>;
}) {
  supabaseAdmin
    .from("agent_feedback")
    .insert({
      organization_id: data.organizationId ?? null,
      user_id: data.userId,
      api_key_id: data.apiKeyId ?? null,
      category: data.category,
      severity: data.severity,
      message: data.message,
      tool_name: data.toolName ?? null,
      context: data.context ?? null,
      metadata: data.metadata ?? null,
    })
    .then();
}
