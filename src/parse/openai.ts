import { z } from "zod";
import { postJson, ProviderError, type FetchFn } from "./http.js";
import { NOTES_SYSTEM_PROMPT, draftEnvelopeSchema, extractJsonObject } from "./prompt.js";
import type { NotesProvider, ProviderDraft } from "./provider.js";

export const OPENAI_DEFAULT_MODEL = "gpt-4.1-mini";

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

export interface OpenAIOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: FetchFn;
}

export class OpenAINotesProvider implements NotesProvider {
  readonly name = "openai";
  private readonly fetchFn: FetchFn;
  private readonly model: string;

  constructor(private readonly options: OpenAIOptions) {
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.model = options.model ?? OPENAI_DEFAULT_MODEL;
  }

  async draft(notes: string): Promise<ProviderDraft> {
    const baseUrl = this.options.baseUrl ?? "https://api.openai.com/v1";
    const raw = await postJson(
      this.fetchFn,
      `${baseUrl}/chat/completions`,
      { authorization: `Bearer ${this.options.apiKey}` },
      {
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: NOTES_SYSTEM_PROMPT },
          { role: "user", content: notes },
        ],
      },
      this.name,
    );
    const parsed = responseSchema.safeParse(raw);
    const content = parsed.success ? parsed.data.choices[0]?.message.content : undefined;
    if (content === undefined || content === null) {
      throw new ProviderError("openai response had no message content");
    }
    return draftEnvelopeSchema.parse(extractJsonObject(content));
  }
}
