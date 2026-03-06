export type McpAuthExtra = { authInfo?: { extra?: Record<string, unknown> } };

export function getMcpAuth(extra: McpAuthExtra): { userId: string; organizationId?: string } | null {
  const userId = extra.authInfo?.extra?.userId as string | undefined;
  if (!userId) return null;
  const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
  return { userId, organizationId };
}

export function getFullMcpAuth(extra: McpAuthExtra): {
  userId: string; organizationId: string; orgRole: string; teamIds?: string[];
} | null {
  const userId = extra.authInfo?.extra?.userId as string | undefined;
  const organizationId = extra.authInfo?.extra?.organizationId as string | undefined;
  if (!userId || !organizationId) return null;
  const orgRole = (extra.authInfo?.extra?.orgRole as string) ?? "member";
  const teamIds = extra.authInfo?.extra?.teamIds as string[] | undefined;
  return { userId, organizationId, orgRole, teamIds };
}

export function unauthorized() {
  return { content: [{ type: "text" as const, text: "Unauthorized" }], isError: true };
}
