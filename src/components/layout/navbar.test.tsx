// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { Navbar } from "./navbar";

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

describe("Navbar", () => {
  it("renders the logo as a Link to /", () => {
    render(<Navbar />);
    const links = screen.getAllByTestId("next-link");
    const logoLink = links.find((l) => l.getAttribute("href") === "/");
    expect(logoLink).toBeDefined();
    expect(logoLink).toHaveTextContent("Switchboard");
  });

  it("renders the Sign In button as a Link to /login", () => {
    render(<Navbar />);
    const links = screen.getAllByTestId("next-link");
    const loginLink = links.find((l) => l.getAttribute("href") === "/login");
    expect(loginLink).toBeDefined();
    expect(loginLink).toHaveTextContent("Sign In");
  });

  it("renders anchor-based nav items as plain <a> tags, not Links", () => {
    render(<Navbar />);
    // Hash links should NOT be next-link
    const howItWorks = screen.getByText("How It Works");
    expect(howItWorks.closest("[data-testid='next-link']")).toBeNull();
    expect(howItWorks.tagName).toBe("A");
    expect(howItWorks).toHaveAttribute("href", "#how-it-works");
  });
});
