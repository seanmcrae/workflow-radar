export type FetchFn = typeof fetch;

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function postJson(
  fetchFn: FetchFn,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: string,
): Promise<unknown> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ProviderError(
      `${provider} request failed with HTTP ${response.status}: ${text.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError(`${provider} returned a non-JSON response`);
  }
}
