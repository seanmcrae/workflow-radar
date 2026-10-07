# Security policy

## Supported versions

Only the latest release on `main` receives fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's [private vulnerability reporting](https://github.com/seanmcrae/workflow-radar/security/advisories/new) rather than in a public issue. Include the affected version or commit, reproduction steps, and the impact you expect. You should get an acknowledgement within a week.

## Data handling

workflow-radar runs locally and makes no network requests by default. The `parse` command sends interview notes to Anthropic or OpenAI only when you select `--provider anthropic` or `--provider openai` and the matching API key is set in the environment. Keys are read from the environment and are never written to drafts, reports, or logs. Review your organization's data-handling rules before sending interview content to a hosted model.
