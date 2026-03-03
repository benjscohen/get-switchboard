import { generateApiKey, hashApiKey } from "@/lib/crypto";

describe("generateApiKey", () => {
  it("returns an object with raw, hash, and prefix keys", () => {
    const key = generateApiKey();
    expect(key).toHaveProperty("raw");
    expect(key).toHaveProperty("hash");
    expect(key).toHaveProperty("prefix");
  });

  it("raw starts with sk_live_", () => {
    const { raw } = generateApiKey();
    expect(raw.startsWith("sk_live_")).toBe(true);
  });

  it("raw is sk_live_ followed by base64url characters", () => {
    const { raw } = generateApiKey();
    expect(raw).toMatch(/^sk_live_[A-Za-z0-9_-]+$/);
  });

  it("prefix is the first 12 characters of raw", () => {
    const { raw, prefix } = generateApiKey();
    expect(prefix).toBe(raw.slice(0, 12));
  });

  it("hash is a 64-character hex string", () => {
    const { hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash matches hashApiKey(raw)", () => {
    const { raw, hash } = generateApiKey();
    expect(hash).toBe(hashApiKey(raw));
  });

  it("produces different keys on successive calls", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashApiKey", () => {
  it("is deterministic — same input produces the same hash", () => {
    const input = "sk_live_test123";
    expect(hashApiKey(input)).toBe(hashApiKey(input));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashApiKey("sk_live_aaa")).not.toBe(hashApiKey("sk_live_bbb"));
  });
});
