"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

const ERROR_MESSAGES: Record<string, string> = {
  token_exchange_failed:
    "Failed to connect — Google rejected the request. Please try again.",
  save_failed: "Connected to Google but failed to save. Please try again.",
  missing_params: "OAuth callback was missing required parameters.",
  missing_state: "Session expired. Please try connecting again.",
  invalid_state: "Invalid session state. Please try connecting again.",
  state_mismatch: "Security check failed. Please try connecting again.",
  unknown_integration: "Unknown integration.",
  not_configured: "This integration is not configured yet.",
};

export function DashboardToasts() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addToast } = useToast();

  useEffect(() => {
    const errorCode = searchParams.get("error");
    const connected = searchParams.get("connected");

    if (errorCode) {
      addToast(
        ERROR_MESSAGES[errorCode] ?? "Something went wrong. Please try again.",
        "error"
      );
      router.replace("/mcp", { scroll: false });
    } else if (connected) {
      const name = connected
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      addToast(`Successfully connected ${name}!`, "success");
      router.replace("/mcp", { scroll: false });
    }
  }, [searchParams, router, addToast]);

  return null;
}
