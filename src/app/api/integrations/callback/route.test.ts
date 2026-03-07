import { NextRequest } from "next/server";

const { cookieDeleteMock, cookieGetMock } = vi.hoisted(() => ({
  cookieDeleteMock: vi.fn(),
  cookieGetMock: vi.fn(),
}));

const defaultCookieState = {
  state: "test-state",
  integrationId: "google-calendar",
  userId: "user-1",
};

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: cookieGetMock,
    delete: cookieDeleteMock,
  }),
}));

const mockUpsert = vi.fn();
const mockProfileSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockProfileSingle,
            })),
          })),
        };
      }
      // Default: connections table
      return { upsert: mockUpsert };
    }),
  },
}));

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((v: string) => v),
  decrypt: vi.fn((v: string) => v),
}));

vi.mock("@/lib/integrations/registry", () => ({
  integrationRegistry: new Map(),
}));

vi.mock("@/lib/integration-scopes", () => ({
  loadIntegrationScopes: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/permissions", () => ({
  isUserInScope: vi.fn().mockReturnValue(true),
}));

import { integrationRegistry } from "@/lib/integrations/registry";
import { GET } from "./route";

const mockIntegration = {
  id: "google-calendar",
  oauth: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnvVar: "AUTH_GOOGLE_ID",
    clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
    scopes: ["https://www.googleapis.com/auth/calendar"],
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
};

const mockTokenResponse = {
  access_token: "new-access",
  refresh_token: "new-refresh",
  expires_in: 3600,
  token_type: "Bearer",
  scope: "calendar",
};

function makeRequest(params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params);
  return new NextRequest(
    `http://localhost/api/integrations/callback?${searchParams.toString()}`
  );
}

function getRedirectError(res: Response): string | null {
  const location = new URL(res.headers.get("Location")!);
  return location.searchParams.get("error");
}

describe("GET /api/integrations/callback", () => {
  beforeEach(() => {
    cookieGetMock.mockReturnValue({
      value: JSON.stringify(defaultCookieState),
    });
    cookieDeleteMock.mockClear();
    mockUpsert.mockClear().mockResolvedValue({ data: null, error: null });
    mockProfileSingle.mockClear().mockResolvedValue({
      data: { organization_id: "org-1", org_role: "member" },
      error: null,
    });

    (integrationRegistry as Map<string, unknown>).clear();
    (integrationRegistry as Map<string, unknown>).set(
      "google-calendar",
      mockIntegration
    );

    vi.stubEnv("AUTH_GOOGLE_ID", "test-client-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "test-client-secret");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTokenResponse),
    } as Response);
  });

  it("redirects with error=missing_params when code is missing", async () => {
    const res = await GET(makeRequest({ state: "test-state" }));

    expect(res.status).toBe(307);
    expect(getRedirectError(res)).toBe("missing_params");
  });

  it("redirects with error=missing_params when state is missing", async () => {
    const res = await GET(makeRequest({ code: "auth-code" }));

    expect(res.status).toBe(307);
    expect(getRedirectError(res)).toBe("missing_params");
  });

  it("redirects with error=missing_state when cookie is missing", async () => {
    cookieGetMock.mockReturnValue(undefined);

    const res = await GET(
      makeRequest({ code: "auth-code", state: "test-state" })
    );

    expect(res.status).toBe(307);
    expect(getRedirectError(res)).toBe("missing_state");
  });

  it("redirects with error=invalid_state when cookie JSON is invalid", async () => {
    cookieGetMock.mockReturnValue({ value: "not-valid-json{{{" });

    const res = await GET(
      makeRequest({ code: "auth-code", state: "test-state" })
    );

    expect(res.status).toBe(307);
    expect(getRedirectError(res)).toBe("invalid_state");
  });

  it("redirects with error=state_mismatch when state does not match", async () => {
    const res = await GET(
      makeRequest({ code: "auth-code", state: "wrong-state" })
    );

    expect(res.status).toBe(307);
    expect(getRedirectError(res)).toBe("state_mismatch");
  });

  it("redirects with error=unknown_integration when integration not in registry", async () => {
    cookieGetMock.mockReturnValue({
      value: JSON.stringify({
        state: "test-state",
        integrationId: "unknown-service",
        userId: "user-1",
      }),
    });

    const res = await GET(
      makeRequest({ code: "auth-code", state: "test-state" })
    );

    expect(res.status).toBe(307);
    expect(getRedirectError(res)).toBe("unknown_integration");
  });

  it("redirects with error=not_configured when env vars are missing", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "");

    const res = await GET(
      makeRequest({ code: "auth-code", state: "test-state" })
    );

    expect(res.status).toBe(307);
    expect(getRedirectError(res)).toBe("not_configured");
  });

  it("redirects with error=token_exchange_failed when fetch fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "invalid_grant" }),
      text: () => Promise.resolve('{"error":"invalid_grant"}'),
    } as Response);

    const res = await GET(
      makeRequest({ code: "auth-code", state: "test-state" })
    );

    expect(res.status).toBe(307);
    expect(getRedirectError(res)).toBe("token_exchange_failed");
  });

  it("upserts connection on successful flow", async () => {
    await GET(makeRequest({ code: "auth-code", state: "test-state" }));

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        integration_id: "google-calendar",
        access_token: "new-access",
        refresh_token: "new-refresh",
        token_type: "Bearer",
        scope: "calendar",
      }),
      { onConflict: "user_id,integration_id" }
    );
  });

  it("redirects with ?connected=google-calendar on success", async () => {
    const res = await GET(
      makeRequest({ code: "auth-code", state: "test-state" })
    );
    const location = new URL(res.headers.get("Location")!);

    expect(res.status).toBe(307);
    expect(location.pathname).toBe("/mcp");
    expect(location.searchParams.get("connected")).toBe("google-calendar");
  });

  it("deletes oauth_state cookie after reading", async () => {
    await GET(makeRequest({ code: "auth-code", state: "test-state" }));

    expect(cookieDeleteMock).toHaveBeenCalledWith("oauth_state");
  });

  it("calls fetch with correct token exchange params", async () => {
    await GET(makeRequest({ code: "auth-code", state: "test-state" }));

    expect(global.fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const body = fetchCall[1]!.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
  });
});
