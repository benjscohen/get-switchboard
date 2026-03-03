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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    connection: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/integrations/registry", () => ({
  integrationRegistry: new Map(),
}));

import { prisma } from "@/lib/prisma";
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

    (integrationRegistry as Map<string, any>).clear();
    (integrationRegistry as Map<string, any>).set(
      "google-calendar",
      mockIntegration
    );

    vi.stubEnv("AUTH_GOOGLE_ID", "test-client-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "test-client-secret");

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTokenResponse),
    } as Response);

    vi.mocked(prisma.connection.upsert).mockResolvedValue({} as any);
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
    } as Response);

    const res = await GET(
      makeRequest({ code: "auth-code", state: "test-state" })
    );

    expect(res.status).toBe(307);
    expect(getRedirectError(res)).toBe("token_exchange_failed");
  });

  it("upserts connection on successful flow", async () => {
    await GET(makeRequest({ code: "auth-code", state: "test-state" }));

    expect(prisma.connection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_integrationId: {
            userId: "user-1",
            integrationId: "google-calendar",
          },
        },
        create: expect.objectContaining({
          userId: "user-1",
          integrationId: "google-calendar",
          accessToken: "new-access",
          refreshToken: "new-refresh",
          tokenType: "Bearer",
          scope: "calendar",
        }),
        update: expect.objectContaining({
          accessToken: "new-access",
          refreshToken: "new-refresh",
          tokenType: "Bearer",
          scope: "calendar",
        }),
      })
    );
  });

  it("redirects with ?connected=google-calendar on success", async () => {
    const res = await GET(
      makeRequest({ code: "auth-code", state: "test-state" })
    );
    const location = new URL(res.headers.get("Location")!);

    expect(res.status).toBe(307);
    expect(location.pathname).toBe("/dashboard");
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
