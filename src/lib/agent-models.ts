export const AGENT_MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
] as const;

export const ALLOWED_MODEL_IDS = AGENT_MODELS.map((m) => m.value) as unknown as string[];

export function modelLabel(value: string): string {
  return AGENT_MODELS.find((m) => m.value === value)?.label ?? value;
}
