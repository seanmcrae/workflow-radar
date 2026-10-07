# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Static documentation site (`npm run site`) with the generated sample report embedded, deployed to GitHub Pages from `main`.
- Contributing guide, security policy, citation metadata, issue and pull request templates, and Dependabot configuration.

### Fixed

- `.prettierignore` patterns are anchored to the repository root, so `src/report/` is format-checked.

## [0.1.0] - 2026-10-07

### Added

- zod-validated workflow and step model with three-point estimates, loaded from YAML or JSON.
- Explainable friction and AI-suitability scores with configurable weights, and a keyword task-type classifier.
- Pattern recommendation (copilot, automation with review, agent, not recommended) with ordered hard rules and guardrail notes.
- ROI model with rework-adjusted hours, run cost, and payback; seeded Monte Carlo P10/P50/P90; tornado sensitivity.
- Value-versus-effort quadrants, a payback gate, and a ranked Now / Next / Later / Park roadmap.
- Interview-notes parser with an offline heuristic default and Anthropic and OpenAI adapters.
- `score`, `report`, and `parse` CLI commands; Markdown, self-contained HTML, SVG, and JSON reports.
- Synthetic example workflows, CI on Node 20 and 22, Makefile, and Dockerfile.

[Unreleased]: https://github.com/seanmcrae/workflow-radar/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/seanmcrae/workflow-radar/releases/tag/v0.1.0
