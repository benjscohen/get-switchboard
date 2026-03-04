import { integrationRegistry, allIntegrations } from "@/lib/integrations/registry";

describe("integrationRegistry", () => {
  it("returns a config object for google-calendar", () => {
    const config = integrationRegistry.get("google-calendar");
    expect(config).toBeDefined();
  });

  it("returned config has expected id, name, and oauth URLs", () => {
    const config = integrationRegistry.get("google-calendar")!;
    expect(config.id).toBe("google-calendar");
    expect(config.name).toBe("Google Calendar");
    expect(config.oauth.authUrl).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(config.oauth.tokenUrl).toBe(
      "https://oauth2.googleapis.com/token"
    );
  });

  it("returns undefined for a nonexistent integration", () => {
    expect(integrationRegistry.get("nonexistent")).toBeUndefined();
  });
});

describe("allIntegrations", () => {
  it("is an array containing google-calendar", () => {
    expect(Array.isArray(allIntegrations)).toBe(true);
    expect(allIntegrations.some((i) => i.id === "google-calendar")).toBe(true);
  });

  it("has length 4", () => {
    expect(allIntegrations).toHaveLength(4);
  });

  it("is an array containing google-docs", () => {
    expect(allIntegrations.some((i) => i.id === "google-docs")).toBe(true);
  });

  it("is an array containing google-gmail", () => {
    expect(allIntegrations.some((i) => i.id === "google-gmail")).toBe(true);
  });

  it("is an array containing google-sheets", () => {
    expect(allIntegrations.some((i) => i.id === "google-sheets")).toBe(true);
  });
});
