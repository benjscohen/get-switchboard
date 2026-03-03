import { vi } from "vitest";

export const mockSession = {
  user: { id: "user-1", name: "Test User", email: "test@example.com" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const authMock = vi.fn().mockResolvedValue(mockSession);

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

export { authMock };
