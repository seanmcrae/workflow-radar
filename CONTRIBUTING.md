# Contributing

Issues and pull requests are welcome. For anything larger than a small fix, open an issue first so we can agree on the approach before you write code.

## Setup

Requires Node.js 20 or later (`.nvmrc` pins 20).

```bash
npm ci
make check      # lint, format check, type check, tests
npm run demo    # build and audit the synthetic examples into report/
npm run site    # build the GitHub Pages site into site/
```

Nothing needs network access or API keys after `npm ci`. Tests never call the hosted LLM providers; adapters are tested with an injected `fetch`.

## Making a change

- Keep pull requests focused on one change, with tests for new behavior.
- Run `make check` and `npm run site` before pushing; CI runs the same commands on Node 20 and 22.
- Scoring, ROI, or pattern-rule changes alter report numbers. Regenerate the committed sample with `npm run sample`, and update any figures quoted in `README.md` or `docs/PRODUCT.md` from the new output rather than by hand.
- Default weights, cost bands, and automation fractions live in `src/config.ts` and are mirrored in `config/default.yaml`; change both together (a test checks they agree).
- Example workflows must stay synthetic and labelled `synthetic: true`. Do not commit real interview notes or company data.
- Write commit messages in the imperative mood ("Add bundling of adjacent steps").

## Reporting bugs

Use the bug report template and include the smallest workflow YAML that reproduces the problem, the command you ran, and the full output. See [SECURITY.md](SECURITY.md) for vulnerabilities.
