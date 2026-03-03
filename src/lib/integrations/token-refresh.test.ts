vi.mock("@/lib/prisma", () => ({
  prisma: {
    connection: {
      update: vi.fn(),
    },
  },
}));

vi.mock("./registry", () => ({
  integrationRegistry: new Map([
    [
      "google-calendar",
      {
        id: "google-calendar",
        oauth: {
          authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenUrl: "https://oauth2.googleapis.com/token",
          clientIdEnvVar: "AUTH_GOOGLE_ID",
          clientSecretEnvVar: "AUTH_GOOGLE_SECRET",
          scopes: ["https://www.googleapis.com/auth/calendar"],
        },
      },
    ],
  ]),
}));

import { prisma } from "@/lib/prisma";
import { getValidTokens } from "./token-refresh";

const mockPrismaUpdate = prisma.connection.update as ReturnType<typeof vi.fn>;

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    integrationId: "google-calendar",
    accessToken: "old-access-token",
    refreshToken: "old-refresh-token",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    ...overrides,
  };
}

function mockFetchOk(body: Record<string, unknown>) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function mockFetchFail(status: number, body: string) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.stubEnv("AUTH_GOOGLE_ID", "test-client-id");
  vi.stubEnv("AUTH_GOOGLE_SECRET", "test-secret");
  mockPrismaUpdate.mockReset();
});

describe("getValidTokens", () => {
  it("returns existing tokens when not expired", async () => {
    const connection = makeConnection({
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const result = await getValidTokens(connection);

    expect(result).toEqual({
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
    });
  });

  it("returns existing tokens when expiresAt is null", async () => {
    const connection = makeConnection({ expiresAt: null });

    const result = await getValidTokens(connection);

    expect(result).toEqual({
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
    });
  });

  it("returns refreshToken as undefined when connection has null refreshToken and not expired", async () => {
    const connection = makeConnection({
      refreshToken: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const result = await getValidTokens(connection);

    expect(result).toEqual({
      accessToken: "old-access-token",
      refreshToken: undefined,
    });
  });

  it("triggers refresh when within 5-min buffer", async () => {
    const connection = makeConnection({
      expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes from now
    });

    const fetchSpy = mockFetchOk({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
    });
    mockPrismaUpdate.mockResolvedValue({});

    const result = await getValidTokens(connection);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.accessToken).toBe("new-access-token");
  });

  it("throws when expired and no refresh token", async () => {
    const connection = makeConnection({
      refreshToken: null,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    await expect(getValidTokens(connection)).rejects.toThrow(
      "Token expired and no refresh token available"
    );
  });

  it("throws when integration not in registry", async () => {
    const connection = makeConnection({
      integrationId: "unknown-service",
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(getValidTokens(connection)).rejects.toThrow(
      "Unknown integration: unknown-service"
    );
  });

  it("throws when OAuth env vars are missing", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "");
    const connection = makeConnection({
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(getValidTokens(connection)).rejects.toThrow(
      "Missing OAuth credentials for google-calendar"
    );
  });

  it("calls fetch with correct token URL and form body", async () => {
    const connection = makeConnection({
      expiresAt: new Date(Date.now() - 1000),
    });

    const fetchSpy = mockFetchOk({
      access_token: "new-access-token",
      expires_in: 3600,
    });
    mockPrismaUpdate.mockResolvedValue({});

    await getValidTokens(connection);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "old-refresh-token",
          client_id: "test-client-id",
          client_secret: "test-secret",
        }),
      }
    );
  });

  it("throws on non-ok fetch response", async () => {
    const connection = makeConnection({
      expiresAt: new Date(Date.now() - 1000),
    });

    mockFetchFail(401, "invalid_grant");

    await expect(getValidTokens(connection)).rejects.toThrow(
      "Token refresh failed: invalid_grant"
    );
  });

  it("updates DB with new tokens after successful refresh", async () => {
    const connection = makeConnection({
      expiresAt: new Date(Date.now() - 1000),
    });

    mockFetchOk({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
    });
    mockPrismaUpdate.mockResolvedValue({});

    await getValidTokens(connection);

    expect(mockPrismaUpdate).toHaveBeenCalledWith({
      where: { id: "conn-1" },
      data: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresAt: expect.any(Date),
      },
    });
  });

  it("preserves original refresh token if response omits refresh_token", async () => {
    const connection = makeConnection({
      expiresAt: new Date(Date.now() - 1000),
    });

    mockFetchOk({
      access_token: "new-access-token",
      expires_in: 3600,
      // no refresh_token in response
    });
    mockPrismaUpdate.mockResolvedValue({});

    const result = await getValidTokens(connection);

    expect(result.refreshToken).toBe("old-refresh-token");
    expect(mockPrismaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refreshToken: "old-refresh-token",
        }),
      })
    );
  });

  it("uses new refresh_token from response when provided", async () => {
    const connection = makeConnection({
      expiresAt: new Date(Date.now() - 1000),
    });

    mockFetchOk({
      access_token: "new-access-token",
      refresh_token: "rotated-refresh-token",
      expires_in: 3600,
    });
    mockPrismaUpdate.mockResolvedValue({});

    const result = await getValidTokens(connection);

    expect(result.refreshToken).toBe("rotated-refresh-token");
    expect(mockPrismaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refreshToken: "rotated-refresh-token",
        }),
      })
    );
  });

  it("sets expiresAt to null when response has no expires_in", async () => {
    const connection = makeConnection({
      expiresAt: new Date(Date.now() - 1000),
    });

    mockFetchOk({
      access_token: "new-access-token",
      // no expires_in
    });
    mockPrismaUpdate.mockResolvedValue({});

    await getValidTokens(connection);

    expect(mockPrismaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: null,
        }),
      })
    );
  });
});
