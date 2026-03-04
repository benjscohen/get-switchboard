export const OAUTH_STATE_COOKIE = "oauth_state";

export const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 600, // 10 minutes
  path: "/",
};
