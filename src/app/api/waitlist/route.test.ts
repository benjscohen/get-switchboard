import { NextResponse } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    waitlistEntry: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    vi.mocked(prisma.waitlistEntry.findUnique).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.waitlistEntry.create).mockReset().mockResolvedValue({} as any);
  });

  it("returns 200 and adds valid email to waitlist", async () => {
    const res = await POST(makeRequest({ email: "user@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toBe("Added to waitlist");
    expect(prisma.waitlistEntry.create).toHaveBeenCalled();
  });

  it("normalizes email to lowercase and trimmed", async () => {
    await POST(makeRequest({ email: "  USER@Example.COM  " }));

    expect(prisma.waitlistEntry.findUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
      data: { email: "user@example.com" },
    });
  });

  it("returns 200 'Already on waitlist' for existing email", async () => {
    vi.mocked(prisma.waitlistEntry.findUnique).mockResolvedValue({
      id: "1",
      email: "user@example.com",
      createdAt: new Date(),
    });

    const res = await POST(makeRequest({ email: "user@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toBe("Already on waitlist");
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Valid email required");
  });

  it("returns 400 when email is not a string", async () => {
    const res = await POST(makeRequest({ email: 123 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Valid email required");
  });

  it("returns 400 when email has no @", async () => {
    const res = await POST(makeRequest({ email: "invalid-email" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Valid email required");
  });

  it("returns 500 when prisma throws", async () => {
    vi.mocked(prisma.waitlistEntry.findUnique).mockRejectedValue(
      new Error("DB down")
    );

    const res = await POST(makeRequest({ email: "user@example.com" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("Internal server error");
  });
});
