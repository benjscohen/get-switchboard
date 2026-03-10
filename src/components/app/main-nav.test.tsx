// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MainNav } from "./main-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/agents",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const links = [
  {
    href: "/agents",
    label: "Agents",
    children: [
      { href: "/agents", label: "Agents" },
      { href: "/schedules", label: "Schedules" },
    ],
  },
  {
    href: "/workspace",
    label: "Workspace",
    children: [
      { href: "/files", label: "Files" },
      { href: "/vault", label: "Vault" },
      { href: "/skills", label: "Skills" },
    ],
  },
  { href: "/connections", label: "Connections" },
];

describe("MainNav", () => {
  it("renders top-level links", () => {
    render(<MainNav links={links} />);

    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Connections")).toBeInTheDocument();
  });

  it("does not show dropdown items initially", () => {
    render(<MainNav links={links} />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedules")).not.toBeInTheDocument();
  });

  it("shows dropdown on hover and hides on mouse leave", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    const agentsTrigger = screen.getByText("Agents");

    // Hover over trigger's parent wrapper div
    await user.hover(agentsTrigger.closest("div")!);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Schedules")).toBeInTheDocument();

    // Mouse away
    await user.unhover(agentsTrigger.closest("div")!);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedules")).not.toBeInTheDocument();
  });

  it("sets aria-expanded on trigger when dropdown is open", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    const agentsTrigger = screen.getByText("Agents");
    expect(agentsTrigger).toHaveAttribute("aria-expanded", "false");

    await user.hover(agentsTrigger.closest("div")!);
    expect(agentsTrigger).toHaveAttribute("aria-expanded", "true");

    await user.unhover(agentsTrigger.closest("div")!);
    expect(agentsTrigger).toHaveAttribute("aria-expanded", "false");
  });

  it("renders dropdown items with menuitem role", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    await user.hover(screen.getByText("Workspace").closest("div")!);

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems).toHaveLength(3);
    expect(menuItems.map((el) => el.textContent)).toEqual([
      "Files",
      "Vault",
      "Skills",
    ]);
  });

  it("uses conditional rendering (not CSS visibility) for dropdown", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    // Before hover: no menu element in DOM at all
    expect(screen.queryByRole("menu")).toBeNull();

    await user.hover(screen.getByText("Agents").closest("div")!);

    // After hover: menu element exists and is visible
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    // Verify no CSS visibility/opacity hiding — element should not have
    // invisible or opacity-0 classes (the old CSS hover approach)
    expect(menu.closest("[class*='invisible']")).toBeNull();
    expect(menu.closest("[class*='opacity-0']")).toBeNull();
  });

  it("does not use group-hover CSS classes", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    await user.hover(screen.getByText("Agents").closest("div")!);

    // The wrapper div should not have group/nav class
    const trigger = screen.getByRole("link", { name: "Agents", expanded: true });
    const wrapper = trigger.closest("div");
    expect(wrapper?.className).not.toContain("group/nav");
    expect(wrapper?.className).not.toContain("group-hover");
  });

  it("renders plain links without dropdown for items without children", () => {
    render(<MainNav links={links} />);

    const connectionsLink = screen.getByText("Connections");
    expect(connectionsLink).toHaveAttribute("href", "/connections");
    // No aria-haspopup on plain links
    expect(connectionsLink).not.toHaveAttribute("aria-haspopup");
  });
});
