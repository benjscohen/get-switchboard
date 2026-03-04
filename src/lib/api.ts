export async function revokeApiKey(id: string): Promise<boolean> {
  const res = await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
  return res.ok;
}
