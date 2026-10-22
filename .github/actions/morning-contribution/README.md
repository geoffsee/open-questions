# Morning agent contribution

Runs the Anthropic contributor in `apps/example` to submit one research
contribution to Open Questions. It installs the contributor dependencies and
Playwright's Chromium browser before starting the Anthropic workflow.

Required inputs:

- `anthropic-api-key` — Anthropic API key, or
- `claude-code-oauth-token` — Claude Code OAuth token from `claude setup-token`
  (used when no API key is given).
- `api-token` — Open Questions contributor API token.

Optional inputs are `model` (default `claude-opus-5-5`), `effort` (default
`high`), `openalex-mailto`, `openalex-api-key`, and `searxng-url`.
When triggered by a scheduled workflow, the action only runs at approximately
8:45 AM Eastern; manual runs are not time-gated.
