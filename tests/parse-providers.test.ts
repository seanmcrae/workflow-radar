import { describe, expect, it } from "vitest";
import { AnthropicNotesProvider } from "../src/parse/anthropic.js";
import { draftWorkflowFromNotes } from "../src/parse/draft.js";
import { HeuristicNotesProvider } from "../src/parse/heuristic.js";
import { ProviderError, type FetchFn } from "../src/parse/http.js";
import { OpenAINotesProvider } from "../src/parse/openai.js";
import { NOTES_SYSTEM_PROMPT, extractJsonObject } from "../src/parse/prompt.js";
import { createNotesProvider } from "../src/parse/registry.js";
import { makeWorkflow } from "./helpers.js";

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** A fetch stand-in that records the request and returns a canned body; no network. */
function fakeFetch(responseBody: unknown, status = 200): { fetch: FetchFn; calls: Captured[] } {
  const calls: Captured[] = [];
  const fn = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: input instanceof Request ? input.url : input.toString(),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(init?.body as string) as Record<string, unknown>,
    });
    return Promise.resolve(new Response(JSON.stringify(responseBody), { status }));
  };
  return { fetch: fn, calls };
}

const envelope = { workflow: makeWorkflow(), warnings: ["volume was estimated"] };

describe("extractJsonObject", () => {
  it("handles code fences and surrounding prose", () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('prefix {"a": {"b": 2}} suffix')).toEqual({ a: { b: 2 } });
  });

  it("throws on missing or malformed JSON", () => {
    expect(() => extractJsonObject("no json here")).toThrow(/did not contain/);
    expect(() => extractJsonObject("{not json}")).toThrow(/not valid JSON/);
  });
});

describe("system prompt", () => {
  it("embeds the workflow JSON schema", () => {
    expect(NOTES_SYSTEM_PROMPT).toContain('"volumePerMonth"');
    expect(NOTES_SYSTEM_PROMPT).toContain('"regulatorySensitivity"');
  });
});

describe("AnthropicNotesProvider", () => {
  it("sends the notes to the Messages API and validates the draft", async () => {
    const { fetch, calls } = fakeFetch({
      content: [{ type: "text", text: "```json\n" + JSON.stringify(envelope) + "\n```" }],
    });
    const provider = new AnthropicNotesProvider({ apiKey: "test-key", fetch });
    const result = await draftWorkflowFromNotes("Process: test", provider);

    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]?.headers["x-api-key"]).toBe("test-key");
    expect(calls[0]?.body.system).toBe(NOTES_SYSTEM_PROMPT);
    expect(result.workflow.id).toBe("test-workflow");
    expect(result.warnings).toEqual(["volume was estimated"]);
  });

  it("surfaces HTTP errors", async () => {
    const { fetch } = fakeFetch({ error: "rate limited" }, 429);
    const provider = new AnthropicNotesProvider({ apiKey: "k", fetch });
    await expect(provider.draft("notes")).rejects.toThrow(/HTTP 429/);
  });
});

describe("OpenAINotesProvider", () => {
  it("requests JSON mode and parses the message content", async () => {
    const { fetch, calls } = fakeFetch({
      choices: [{ message: { content: JSON.stringify(envelope) } }],
    });
    const provider = new OpenAINotesProvider({ apiKey: "sk-test", model: "test-model", fetch });
    const draft = await provider.draft("Process: test");

    expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0]?.headers.authorization).toBe("Bearer sk-test");
    expect(calls[0]?.body).toMatchObject({
      model: "test-model",
      response_format: { type: "json_object" },
    });
    expect(draft.warnings).toEqual(["volume was estimated"]);
  });

  it("rejects responses without content", async () => {
    const { fetch } = fakeFetch({ choices: [] });
    const provider = new OpenAINotesProvider({ apiKey: "k", fetch });
    await expect(provider.draft("notes")).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("createNotesProvider", () => {
  it("defaults to the offline mock without any keys", () => {
    expect(createNotesProvider("mock", { env: {} })).toBeInstanceOf(HeuristicNotesProvider);
  });

  it("requires API keys for hosted providers", () => {
    expect(() => createNotesProvider("anthropic", { env: {} })).toThrow(
      /ANTHROPIC_API_KEY is not set/,
    );
    expect(() => createNotesProvider("openai", { env: { OPENAI_API_KEY: " " } })).toThrow(
      /OPENAI_API_KEY is not set/,
    );
    expect(createNotesProvider("openai", { env: { OPENAI_API_KEY: "sk" } }).name).toBe("openai");
  });

  it("rejects unknown providers", () => {
    expect(() => createNotesProvider("llama", { env: {} })).toThrow(/unknown provider "llama"/);
  });
});
