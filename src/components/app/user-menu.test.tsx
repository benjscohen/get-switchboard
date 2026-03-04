// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserMenu } from "./user-menu";

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a data-testid="next-link" {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}));

describe("UserMenu", () => {
  it("renders Settings link when dropdown is open", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu
        displayName="Test User"
        avatarUrl={null}
        showSettings={true}
      />
    );

    await user.click(screen.getByRole("button"));

    const links = screen.getAllByTestId("next-link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/settings");
    expect(links[0]).toHaveTextContent("Settings");
  });

  it("hides Settings link when showSettings is false", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu
        displayName="Test User"
        avatarUrl={null}
        showSettings={false}
      />
    );

    await user.click(screen.getByRole("button"));

    const links = screen.queryAllByTestId("next-link");
    expect(links).toHaveLength(0);
  });
});
