import { NextRequest } from "next/server";

const { cookieSetMock } = vi.hoisted(() => ({
  cookieSetMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/integrations/registry", () => ({
  integrationRegistry: new Map(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: cookieSetMock,
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

import { auth } from "@/lib/auth";
import { integrationRegistry } from "@/lib/integrations/registry";
import { GET } from "./route";

const mockSession = { user: { id: "user-1" } };

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

function makeRequest(params?: string) {
  const url = params
    ? `http://localhost/api/integrations/connect?${params}`
    : "http://localhost/api/integrations/connect";
  return new NextRequest(url);
}

describe("GET /api/integrations/connect", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    (integrationRegistry as Map<string, any>).clear();
    (integrationRegistry as Map<string, any>).set(
      "google-calendar",
      mockIntegration
    );
    vi.stubEnv("AUTH_GOOGLE_ID", "test-client-id");
    cookieSetMock.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await GET(makeRequest("integration=google-calendar"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when missing integration param", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing integration parameter");
  });

  it("returns 400 when unknown integration", async () => {
    const res = await GET(makeRequest("integration=unknown-service"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Unknown integration");
  });

  it("returns 500 when env var is missing", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");

    const res = await GET(makeRequest("integration=google-calendar"));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Integration not configured");
  });

  it("sets httpOnly cookie with state, integrationId, userId", async () => {
    await GET(makeRequest("integration=google-calendar"));

    expect(cookieSetMock).toHaveBeenCalledWith(
      "oauth_state",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      })
    );

    const cookieValue = JSON.parse(cookieSetMock.mock.calls[0][1]);
    expect(cookieValue).toHaveProperty("state");
    expect(cookieValue.integrationId).toBe("google-calendar");
    expect(cookieValue.userId).toBe("user-1");
  });

  it("redirects (307) to correct OAuth URL", async () => {
    const res = await GET(makeRequest("integration=google-calendar"));

    expect(res.status).toBe(307);
    const location = res.headers.get("Location")!;
    expect(location).toContain(
      "https://accounts.google.com/o/oauth2/v2/auth?"
    );
  });

  it("redirect URL contains client_id param", async () => {
    const res = await GET(makeRequest("integration=google-calendar"));
    const location = new URL(res.headers.get("Location")!);

    expect(location.searchParams.get("client_id")).toBe("test-client-id");
  });

  it("redirect URL contains scope param", async () => {
    const res = await GET(makeRequest("integration=google-calendar"));
    const location = new URL(res.headers.get("Location")!);

    expect(location.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar"
    );
  });

  it("redirect URL contains access_type=offline", async () => {
    const res = await GET(makeRequest("integration=google-calendar"));
    const location = new URL(res.headers.get("Location")!);

    expect(location.searchParams.get("access_type")).toBe("offline");
  });
});
