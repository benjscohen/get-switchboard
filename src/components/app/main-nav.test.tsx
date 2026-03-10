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

  it("opens dropdown on click and closes on second click", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    const agentsTrigger = screen.getByRole("button", { name: "Agents" });

    // Click to open
    await user.click(agentsTrigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Schedules")).toBeInTheDocument();

    // Click again to close
    await user.click(agentsTrigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedules")).not.toBeInTheDocument();
  });

  it("sets aria-expanded on trigger when dropdown is open", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    const agentsTrigger = screen.getByRole("button", { name: "Agents" });
    expect(agentsTrigger).toHaveAttribute("aria-expanded", "false");

    await user.click(agentsTrigger);
    expect(agentsTrigger).toHaveAttribute("aria-expanded", "true");

    await user.click(agentsTrigger);
    expect(agentsTrigger).toHaveAttribute("aria-expanded", "false");
  });

  it("renders dropdown items with menuitem role", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    await user.click(screen.getByRole("button", { name: "Workspace" }));

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

    // Before click: no menu element in DOM at all
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Agents" }));

    // After click: menu element exists and is visible
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(menu.closest("[class*='invisible']")).toBeNull();
    expect(menu.closest("[class*='opacity-0']")).toBeNull();
  });

  it("closes dropdown on click outside", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    await user.click(screen.getByRole("button", { name: "Agents" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Click outside
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes dropdown on Escape key", async () => {
    const user = userEvent.setup();
    render(<MainNav links={links} />);

    await user.click(screen.getByRole("button", { name: "Agents" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders plain links without dropdown for items without children", () => {
    render(<MainNav links={links} />);

    const connectionsLink = screen.getByText("Connections");
    expect(connectionsLink).toHaveAttribute("href", "/connections");
    expect(connectionsLink).not.toHaveAttribute("aria-haspopup");
  });
});
