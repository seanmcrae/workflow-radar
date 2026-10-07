/**
 * Turns free-text interview notes into a raw workflow object. The result is untrusted and is
 * always validated against the workflow schema before use.
 */
export interface NotesProvider {
  readonly name: string;
  draft(notes: string): Promise<ProviderDraft>;
}

export interface ProviderDraft {
  workflow: unknown;
  /** Assumptions or gaps the reviewer should check. */
  warnings: string[];
}
