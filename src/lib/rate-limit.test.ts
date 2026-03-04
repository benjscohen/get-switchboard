import { checkRateLimit, _resetStore } from "./rate-limit";

beforeEach(() => {
  _resetStore();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const result = checkRateLimit("user:1", 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfter).toBeUndefined();
  });

  it("allows up to maxRequests within the window", () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit("user:2", 5, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests exceeding the limit", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("user:3", 3, 60_000);
    }
    const result = checkRateLimit("user:3", 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("provides retryAfter in seconds", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("user:4", 3, 60_000);
    }
    const result = checkRateLimit("user:4", 3, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("allows requests after the window expires", () => {
    vi.useFakeTimers();

    for (let i = 0; i < 3; i++) {
      checkRateLimit("user:5", 3, 60_000);
    }

    expect(checkRateLimit("user:5", 3, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(checkRateLimit("user:5", 3, 60_000).allowed).toBe(true);

    vi.useRealTimers();
  });

  it("tracks different keys independently", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("user:A", 3, 60_000);
    }
    expect(checkRateLimit("user:A", 3, 60_000).allowed).toBe(false);
    expect(checkRateLimit("user:B", 3, 60_000).allowed).toBe(true);
  });

  it("handles sliding window correctly", () => {
    vi.useFakeTimers();

    checkRateLimit("user:6", 2, 10_000);
    vi.advanceTimersByTime(5_000);
    checkRateLimit("user:6", 2, 10_000);

    // At t=5s, both requests are in window → should block
    expect(checkRateLimit("user:6", 2, 10_000).allowed).toBe(false);

    // At t=10.001s, first request expired → should allow
    vi.advanceTimersByTime(5_001);
    expect(checkRateLimit("user:6", 2, 10_000).allowed).toBe(true);

    vi.useRealTimers();
  });
});
