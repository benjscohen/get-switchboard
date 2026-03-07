export function scopePrefix(scope: string): string {
  if (scope === "organization") return "org";
  if (scope === "team") return "team";
  return "user";
}

export function scopeBadgeLabel(
  scope: string,
  teamId: string | undefined,
  teamNames: Record<string, string>,
): string {
  if (scope === "organization") return "Organization";
  if (scope === "team") return teamNames[teamId ?? ""] ?? "Team";
  return "Personal";
}
