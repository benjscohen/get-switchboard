import { NextRequest } from "next/server";

/**
 * Get the public-facing origin (protocol + host) for the app.
 * Prefers APP_URL env var, then X-Forwarded-Host header, then req.nextUrl.origin.
 * This avoids returning internal addresses like https://localhost:8080 on production.
 */
export function getAppOrigin(req: NextRequest): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }

  const forwardedHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${proto}://${forwardedHost}`;
  }

  return req.nextUrl.origin;
}
