import { AnthropicNotesProvider } from "./anthropic.js";
import { HeuristicNotesProvider } from "./heuristic.js";
import { ProviderError, type FetchFn } from "./http.js";
import { OpenAINotesProvider } from "./openai.js";
import type { NotesProvider } from "./provider.js";

export const PROVIDER_NAMES = ["mock", "anthropic", "openai"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export interface ProviderContext {
  env: Record<string, string | undefined>;
  fetch?: FetchFn;
}

function requireKey(env: ProviderContext["env"], key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === "") {
    throw new ProviderError(`${key} is not set; export it or use --provider mock`);
  }
  return value;
}

export function createNotesProvider(name: string, { env, fetch }: ProviderContext): NotesProvider {
  switch (name) {
    case "mock":
      return new HeuristicNotesProvider();
    case "anthropic":
      return new AnthropicNotesProvider({
        apiKey: requireKey(env, "ANTHROPIC_API_KEY"),
        model: env.ANTHROPIC_MODEL,
        fetch,
      });
    case "openai":
      return new OpenAINotesProvider({
        apiKey: requireKey(env, "OPENAI_API_KEY"),
        model: env.OPENAI_MODEL,
        baseUrl: env.OPENAI_BASE_URL,
        fetch,
      });
    default:
      throw new ProviderError(`unknown provider "${name}" (expected ${PROVIDER_NAMES.join(", ")})`);
  }
}
