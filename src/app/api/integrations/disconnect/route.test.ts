import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    connection: {
      deleteMany: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

const mockSession = { user: { id: "user-1" } };

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/integrations/disconnect", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/integrations/disconnect", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(prisma.connection.deleteMany).mockResolvedValue({
      count: 1,
    } as any);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const res = await POST(makeRequest({ integrationId: "google-calendar" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when missing integrationId", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Missing integrationId");
  });

  it("deletes with correct userId and integrationId scope", async () => {
    await POST(makeRequest({ integrationId: "google-calendar" }));

    expect(prisma.connection.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        integrationId: "google-calendar",
      },
    });
  });

  it("returns success", async () => {
    const res = await POST(makeRequest({ integrationId: "google-calendar" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true });
  });
});
