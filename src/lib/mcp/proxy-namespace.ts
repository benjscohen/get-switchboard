/** Prefix a proxy tool name, but skip if the name already contains the integration ID as a word. */
export function namespaceTool(integrationId: string, toolName: string): string {
  const pattern = new RegExp(`(^|[_-])${integrationId}([_-]|$)`);
  if (pattern.test(toolName)) return toolName;
  return `${integrationId}__${toolName}`;
}

/** Strip prefix: "supabase__list_tables" → { integrationId: "supabase", toolName: "list_tables" } */
export function stripNamespace(name: string): { integrationId: string; toolName: string } | null {
  const idx = name.indexOf("__");
  if (idx <= 0) return null;
  return { integrationId: name.slice(0, idx), toolName: name.slice(idx + 2) };
}
