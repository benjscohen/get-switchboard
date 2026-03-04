// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "./footer";

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

describe("Footer", () => {
  it("renders the logo as a Link to /", () => {
    render(<Footer />);
    const link = screen.getByTestId("next-link");
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveTextContent("Switchboard");
  });

  it("keeps the external proton.ai link as a plain <a>", () => {
    render(<Footer />);
    const externalLink = screen.getByText("Proton AI");
    expect(externalLink.closest("[data-testid='next-link']")).toBeNull();
    expect(externalLink.tagName).toBe("A");
    expect(externalLink).toHaveAttribute("href", "https://www.proton.ai");
    expect(externalLink).toHaveAttribute("target", "_blank");
  });
});
