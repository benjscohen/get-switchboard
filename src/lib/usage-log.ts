import { supabaseAdmin } from "@/lib/supabase/admin";

export function logUsage(data: {
  userId: string;
  apiKeyId?: string;
  toolName?: string;
  integrationId?: string;
  status: "success" | "error" | "unauthorized";
  errorMessage?: string;
  durationMs?: number;
  organizationId?: string;
}) {
  supabaseAdmin
    .from("usage_logs")
    .insert({
      user_id: data.userId,
      api_key_id: data.apiKeyId ?? null,
      tool_name: data.toolName ?? null,
      integration_id: data.integrationId ?? null,
      status: data.status,
      error_message: data.errorMessage ?? null,
      duration_ms: data.durationMs ?? null,
      organization_id: data.organizationId ?? null,
    })
    .then();
}
