import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProfileFromAuth } from "./sync-profile";

function makeSupabase({
  user,
  profile,
}: {
  user: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: "not authenticated" },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: profile, error: null }),
        }),
      }),
      update: updateMock,
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, updateMock };
}

describe("syncProfileFromAuth", () => {
  it("does nothing when there is no authenticated user", async () => {
    const { client } = makeSupabase({ user: null, profile: null });
    await syncProfileFromAuth(client);
    expect(client.from).not.toHaveBeenCalled();  // no profile lookup when unauthenticated
  });

  it("does nothing when profile is not found", async () => {
    const { client, updateMock } = makeSupabase({
      user: { id: "u1", user_metadata: { full_name: "Alice", avatar_url: "https://pic.test/a.jpg" } },
      profile: null,
    });
    await syncProfileFromAuth(client);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does nothing when profile is already up to date", async () => {
    const { client, updateMock } = makeSupabase({
      user: { id: "u1", user_metadata: { full_name: "Alice", avatar_url: "https://pic.test/a.jpg" } },
      profile: { name: "Alice", image: "https://pic.test/a.jpg", status: "active" },
    });
    await syncProfileFromAuth(client);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("syncs name and avatar from Google metadata", async () => {
    const { client, updateMock } = makeSupabase({
      user: { id: "u1", user_metadata: { full_name: "Alice Smith", avatar_url: "https://pic.test/new.jpg" } },
      profile: { name: "Alice", image: "https://pic.test/old.jpg", status: "active" },
    });
    await syncProfileFromAuth(client);
    expect(updateMock).toHaveBeenCalledWith({
      name: "Alice Smith",
      image: "https://pic.test/new.jpg",
    });
  });

  it("activates invited users on first sign-in", async () => {
    const { client, updateMock } = makeSupabase({
      user: { id: "u1", user_metadata: { full_name: "Bob", avatar_url: "https://pic.test/b.jpg" } },
      profile: { name: null, image: null, status: "invited" },
    });
    await syncProfileFromAuth(client);
    expect(updateMock).toHaveBeenCalledWith({
      name: "Bob",
      image: "https://pic.test/b.jpg",
      status: "active",
    });
  });

  it("activates invited user even when no metadata changes", async () => {
    const { client, updateMock } = makeSupabase({
      user: { id: "u1", user_metadata: { full_name: "Bob", avatar_url: "https://pic.test/b.jpg" } },
      profile: { name: "Bob", image: "https://pic.test/b.jpg", status: "invited" },
    });
    await syncProfileFromAuth(client);
    expect(updateMock).toHaveBeenCalledWith({ status: "active" });
  });

  it("falls back to 'name' metadata field when full_name is absent", async () => {
    const { client, updateMock } = makeSupabase({
      user: { id: "u1", user_metadata: { name: "Charlie", avatar_url: "https://pic.test/c.jpg" } },
      profile: { name: null, image: null, status: "active" },
    });
    await syncProfileFromAuth(client);
    expect(updateMock).toHaveBeenCalledWith({
      name: "Charlie",
      image: "https://pic.test/c.jpg",
    });
  });

  it("only updates changed fields", async () => {
    const { client, updateMock } = makeSupabase({
      user: { id: "u1", user_metadata: { full_name: "Same Name", avatar_url: "https://pic.test/new.jpg" } },
      profile: { name: "Same Name", image: "https://pic.test/old.jpg", status: "active" },
    });
    await syncProfileFromAuth(client);
    expect(updateMock).toHaveBeenCalledWith({
      image: "https://pic.test/new.jpg",
    });
  });

  it("skips sync when OAuth metadata has no name or avatar", async () => {
    const { client, updateMock } = makeSupabase({
      user: { id: "u1", user_metadata: {} },
      profile: { name: "Existing", image: "https://pic.test/x.jpg", status: "active" },
    });
    await syncProfileFromAuth(client);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
