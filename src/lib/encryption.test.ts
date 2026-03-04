import { randomBytes } from "crypto";
import { encrypt, decrypt } from "./encryption";

const TEST_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_KEY);
});

describe("encryption", () => {
  it("round-trips a string through encrypt/decrypt", () => {
    const plaintext = "ya29.a0AfH6SMB_test_token_value";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const plaintext = "same-token-value";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("handles empty strings", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles unicode content", () => {
    const plaintext = "token-with-émojis-🔑";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("passes through plaintext values without v1: prefix", () => {
    const plaintext = "ya29.some-old-unencrypted-token";
    expect(decrypt(plaintext)).toBe(plaintext);
  });

  it("throws on missing TOKEN_ENCRYPTION_KEY", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    expect(() => encrypt("test")).toThrow(
      "TOKEN_ENCRYPTION_KEY environment variable is not set"
    );
  });

  it("throws on wrong-length key", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    expect(() => encrypt("test")).toThrow(
      "TOKEN_ENCRYPTION_KEY must be exactly 32 bytes"
    );
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("secret-token");
    const parts = encrypted.split(":");
    // Tamper with the ciphertext portion
    parts[3] = "AAAA" + parts[3].slice(4);
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const encrypted = encrypt("secret-token");
    const parts = encrypted.split(":");
    // Tamper with the tag portion
    parts[2] = "AAAA" + parts[2].slice(4);
    const tampered = parts.join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("decryption fails with a different key", () => {
    const encrypted = encrypt("secret-token");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => decrypt(encrypted)).toThrow();
  });
});
