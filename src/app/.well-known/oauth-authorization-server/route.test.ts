import { describe, it, expect } from "vitest";
import { GET, OPTIONS } from "./route";

describe("GET /.well-known/oauth-authorization-server", () => {
  it("returns valid OAuth metadata with all required fields", async () => {
    const response = GET();
    const body = await response.json();

    expect(body.issuer).toBe("https://www.get-switchboard.com");
    expect(body.authorization_endpoint).toBe("https://www.get-switchboard.com/tools");
    expect(body.token_endpoint).toBe("https://www.get-switchboard.com/tools");
    expect(body.code_challenge_methods_supported).toContain("S256");
  });

  it("returns JSON content type with CORS header", () => {
    const response = GET();
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("OPTIONS /.well-known/oauth-authorization-server", () => {
  it("returns CORS preflight headers", () => {
    const response = OPTIONS();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});
