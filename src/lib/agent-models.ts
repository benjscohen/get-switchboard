export type ModelProvider = "anthropic" | "openai";

export const AGENT_MODELS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "anthropic" as ModelProvider },
  { value: "claude-opus-4-6", label: "Opus 4.6", provider: "anthropic" as ModelProvider },
  { value: "claude-haiku-4-5", label: "Haiku 4.5", provider: "anthropic" as ModelProvider },
  { value: "codex-mini-latest", label: "Codex Mini", provider: "openai" as ModelProvider },
] as const;

export type AgentModelId = (typeof AGENT_MODELS)[number]["value"];

export const ALLOWED_MODEL_IDS = AGENT_MODELS.map((m) => m.value) as unknown as string[];

export const DEFAULT_MODEL: AgentModelId = "claude-sonnet-4-6";

export function modelLabel(value: string): string {
  return AGENT_MODELS.find((m) => m.value === value)?.label ?? value;
}

export function modelProvider(value: string): ModelProvider {
  return AGENT_MODELS.find((m) => m.value === value)?.provider ?? "anthropic";
}
