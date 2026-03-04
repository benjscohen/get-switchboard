// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { AdminNav } from "./admin-nav";

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
  usePathname: () => "/admin/users",
}));

describe("AdminNav", () => {
  it("renders all admin tab links as Link components", () => {
    render(<AdminNav />);
    const links = screen.getAllByTestId("next-link");
    expect(links).toHaveLength(4);

    expect(links[0]).toHaveAttribute("href", "/admin");
    expect(links[0]).toHaveTextContent("Overview");

    expect(links[1]).toHaveAttribute("href", "/admin/users");
    expect(links[1]).toHaveTextContent("Users");

    expect(links[2]).toHaveAttribute("href", "/admin/usage");
    expect(links[2]).toHaveTextContent("Usage Logs");

    expect(links[3]).toHaveAttribute("href", "/admin/mcp-servers");
    expect(links[3]).toHaveTextContent("MCP Servers");
  });

  it("highlights the active tab", () => {
    render(<AdminNav />);
    const usersLink = screen.getByText("Users");
    expect(usersLink.className).toContain("bg-accent/10");

    const overviewLink = screen.getByText("Overview");
    expect(overviewLink.className).not.toContain("bg-accent/10");
  });
});
