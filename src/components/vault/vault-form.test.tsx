// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultForm } from "./vault-form";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const secret = {
  id: "1",
  name: "Test Secret",
  description: "desc",
  category: "api_key",
  tags: [],
  fields: [
    { name: "token", value: "super-secret-long-value-42", sensitive: true },
    { name: "host", value: "example.com", sensitive: false },
  ],
};

function renderForm(props?: { secret?: typeof secret }) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const result = render(
    <VaultForm secret={props?.secret ?? secret} onSave={onSave} onClose={onClose} />
  );
  return { onSave, onClose, ...result };
}

describe("VaultForm — masked field security", () => {
  it("shows fixed-length placeholder for sensitive masked fields", () => {
    renderForm();
    const inputs = screen.getAllByPlaceholderText("Value");
    // Sensitive field should show 8 bullets, NOT the real value
    expect(inputs[0]).toHaveValue("••••••••");
    expect(inputs[0]).not.toHaveValue(secret.fields[0].value);
  });

  it("masked placeholder length does not vary with secret length", () => {
    const short = {
      ...secret,
      fields: [{ name: "a", value: "ab", sensitive: true }],
    };
    const long = {
      ...secret,
      fields: [{ name: "b", value: "a".repeat(100), sensitive: true }],
    };

    const { unmount } = render(
      <VaultForm secret={short} onSave={vi.fn()} onClose={vi.fn()} />
    );
    const shortInput = screen.getByPlaceholderText("Value");
    const shortVal = shortInput.getAttribute("value");
    unmount();

    render(<VaultForm secret={long} onSave={vi.fn()} onClose={vi.fn()} />);
    const longInput = screen.getByPlaceholderText("Value");
    const longVal = longInput.getAttribute("value");

    expect(shortVal).toBe(longVal);
    expect(shortVal).toBe("••••••••");
  });

  it("non-sensitive fields show real value", () => {
    renderForm();
    const inputs = screen.getAllByPlaceholderText("Value");
    expect(inputs[1]).toHaveValue("example.com");
  });

  it("masked field is readOnly", () => {
    renderForm();
    const inputs = screen.getAllByPlaceholderText("Value");
    expect(inputs[0]).toHaveAttribute("readonly");
    expect(inputs[1]).not.toHaveAttribute("readonly");
  });

  it("clicking eye icon reveals the real value", async () => {
    const user = userEvent.setup();
    renderForm();

    const revealBtn = screen.getByTitle("Reveal");
    await user.click(revealBtn);

    const inputs = screen.getAllByPlaceholderText("Value");
    expect(inputs[0]).toHaveValue("super-secret-long-value-42");
    expect(inputs[0]).not.toHaveAttribute("readonly");
  });

  it("focusing a masked field auto-reveals for editing", async () => {
    const user = userEvent.setup();
    renderForm();

    const inputs = screen.getAllByPlaceholderText("Value");
    await user.click(inputs[0]); // triggers focus

    // After focus, field should reveal real value
    const updatedInputs = screen.getAllByPlaceholderText("Value");
    expect(updatedInputs[0]).toHaveValue("super-secret-long-value-42");
    expect(updatedInputs[0]).not.toHaveAttribute("readonly");
  });

  it("all inputs use type=text (never type=password)", () => {
    renderForm();
    const inputs = screen.getAllByPlaceholderText("Value");
    for (const input of inputs) {
      expect(input).toHaveAttribute("type", "text");
    }
  });
});
