// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserMenu } from "./user-menu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}));

describe("UserMenu", () => {
  it("shows Sign out when dropdown is open", async () => {
    const user = userEvent.setup();
    render(<UserMenu displayName="Test User" avatarUrl={null} />);

    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });
});
