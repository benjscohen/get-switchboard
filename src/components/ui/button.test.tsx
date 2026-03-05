// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

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

describe("Button", () => {
  it("renders a <Link> when href is provided", () => {
    render(<Button href="/mcp">Go</Button>);
    const link = screen.getByTestId("next-link");
    expect(link).toHaveAttribute("href", "/mcp");
    expect(link).toHaveTextContent("Go");
  });

  it("renders a <button> when no href is provided", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Click");
    expect(screen.queryByTestId("next-link")).not.toBeInTheDocument();
  });

  it("applies variant and size classes", () => {
    render(
      <Button href="/test" variant="secondary" size="sm">
        Link
      </Button>
    );
    const link = screen.getByTestId("next-link");
    expect(link.className).toContain("border");
    expect(link.className).toContain("text-sm");
  });
});
