import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges multiple class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("resolves Tailwind conflicts by keeping the last value", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles falsy values (undefined, null, false)", () => {
    expect(cn("foo", undefined, null, false, "bar")).toBe("foo bar");
  });
});
