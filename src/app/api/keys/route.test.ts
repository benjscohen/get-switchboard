vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/crypto", () => ({
  generateApiKey: vi.fn().mockReturnValue({
    raw: "sk_live_testkey123",
    hash: "abc123hash",
    prefix: "sk_live_test",
  }),
  hashApiKey: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/crypto";
import { GET, POST, DELETE } from "./route";

const mockSession = { user: { id: "user-1" } };

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/keys", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest(id?: string) {
  const url = id
    ? `http://localhost/api/keys?id=${id}`
    : "http://localhost/api/keys";
  return new Request(url, { method: "DELETE" });
}

describe("GET /api/keys", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns keys array", async () => {
    const mockKeys = [
      {
        id: "key-1",
        name: "My Key",
        keyPrefix: "sk_live_abc",
        lastUsedAt: null,
        createdAt: new Date(),
      },
    ];
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue(mockKeys as any);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe("key-1");
  });
});

describe("POST /api/keys", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({} as any);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await POST(makePostRequest({ name: "Test" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("creates key with provided name", async () => {
    await POST(makePostRequest({ name: "My API Key" }));

    expect(prisma.apiKey.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "My API Key",
        keyHash: "abc123hash",
        keyPrefix: "sk_live_test",
      },
    });
  });

  it('uses "Default" name when name is empty', async () => {
    await POST(makePostRequest({ name: "" }));

    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Default" }),
      })
    );
  });

  it('uses "Default" name when name is missing', async () => {
    await POST(makePostRequest({}));

    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Default" }),
      })
    );
  });

  it("returns key, prefix, and name", async () => {
    const res = await POST(makePostRequest({ name: "Test" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      key: "sk_live_testkey123",
      prefix: "sk_live_test",
      name: "Test",
    });
  });
});

describe("DELETE /api/keys", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.apiKey.deleteMany).mockResolvedValue({ count: 1 } as any);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await DELETE(makeDeleteRequest("key-1"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when missing id param", async () => {
    const res = await DELETE(makeDeleteRequest());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing key id");
  });

  it("deletes with correct userId scope", async () => {
    await DELETE(makeDeleteRequest("key-1"));

    expect(prisma.apiKey.deleteMany).toHaveBeenCalledWith({
      where: { id: "key-1", userId: "user-1" },
    });
  });

  it("returns success", async () => {
    const res = await DELETE(makeDeleteRequest("key-1"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
  });
});
