import { z } from "zod";
import { postJson, ProviderError, type FetchFn } from "./http.js";
import { NOTES_SYSTEM_PROMPT, draftEnvelopeSchema, extractJsonObject } from "./prompt.js";
import type { NotesProvider, ProviderDraft } from "./provider.js";

export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5";

const responseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  fetch?: FetchFn;
}

export class AnthropicNotesProvider implements NotesProvider {
  readonly name = "anthropic";
  private readonly fetchFn: FetchFn;
  private readonly model: string;

  constructor(private readonly options: AnthropicOptions) {
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.model = options.model ?? ANTHROPIC_DEFAULT_MODEL;
  }

  async draft(notes: string): Promise<ProviderDraft> {
    const raw = await postJson(
      this.fetchFn,
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": this.options.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: 8192,
        temperature: 0,
        system: NOTES_SYSTEM_PROMPT,
        messages: [{ role: "user", content: notes }],
      },
      this.name,
    );
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) throw new ProviderError("anthropic response had an unexpected shape");
    const text = parsed.data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    return draftEnvelopeSchema.parse(extractJsonObject(text));
  }
}
