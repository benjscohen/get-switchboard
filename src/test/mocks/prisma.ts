import { vi } from "vitest";

export const prismaMock = {
  waitlistEntry: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  apiKey: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  connection: {
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
