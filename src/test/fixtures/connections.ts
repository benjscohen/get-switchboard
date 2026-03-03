export const validConnection = {
  id: "conn-1",
  integrationId: "google-calendar",
  accessToken: "valid-access-token",
  refreshToken: "valid-refresh-token",
  expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
};

export const expiredConnection = {
  id: "conn-2",
  integrationId: "google-calendar",
  accessToken: "expired-access-token",
  refreshToken: "valid-refresh-token",
  expiresAt: new Date(Date.now() - 60000), // 1 minute ago
};

export const noRefreshTokenConnection = {
  id: "conn-3",
  integrationId: "google-calendar",
  accessToken: "expired-access-token",
  refreshToken: null,
  expiresAt: new Date(Date.now() - 60000), // 1 minute ago
};

export const noExpiryConnection = {
  id: "conn-4",
  integrationId: "google-calendar",
  accessToken: "no-expiry-token",
  refreshToken: "valid-refresh-token",
  expiresAt: null,
};
