# Dogfooding layout

This directory separates tracked dogfooding definitions from ephemeral local runs.

- `scenarios/` — tracked scenario definitions and input fixtures
- `snapshots/` — promoted tracked workspaces kept as auditable evidence
- `runs/` — ephemeral commit-aware workspaces materialized locally; ignored by git

For a fresh local run of the bundled self-hosted scenario:

```bash
npm run dogfood:run -- self-hosted
```

That creates `dogfooding/runs/self-hosted/<commit>/` containing the tracked input spec plus `dogfooding-run.json` metadata.
