/** Check if a model ID belongs to OpenAI (vs Anthropic default). */
export function isOpenAIModel(model: string): boolean {
  return model.startsWith("codex") || model.startsWith("gpt-");
}