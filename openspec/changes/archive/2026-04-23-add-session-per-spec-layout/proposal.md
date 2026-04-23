# Change: Add session-per-spec layout under `.ruta/`

## Why

`/ruta-init` currently clobbers global state (`ruta.json`, `notebook.md`, `glossary.md`, `gaps.md` at the repo root) whenever the user switches specs. Each new init wipes the previous session, artifacts carry no provenance (which spec were they for?), and two terminal windows looking at different specs silently conflict.

## What Changes

- **New `.ruta/` directory structure**: artifacts live under `.ruta/<spec-uuid>/<session-id>/` instead of the repo root
- **`spec-uuid`**: `sha256(absSpecPath).slice(0, 16)` — deterministic per spec file location, never collides in practice
- **`session-id`**: incremental `session-1`, `session-2`, … — `/ruta-init` on an existing spec prompts to resume latest or start fresh; "fresh" creates the next numbered session
- **`active.json`**: PID-keyed map at `.ruta/active.json` tracks which terminal owns which session; stale (dead-process) entries are pruned on every read
- **Parallel detection**: warn (not block) when two live PIDs reference the same spec-uuid + session-id
- **New `/ruta-resume`**: resume the last session for a spec path (no "start fresh" prompt); with no args, shows picker of all existing sessions
- **New `/ruta-switch`**: list all spec sessions across the repo, let user switch the current terminal's active session
- **Remove root-level artifacts**: `notebook.md`, `glossary.md`, `gaps.md`, `propositions.md`, `properties.md`, `contracts.md`, `premortem.md`, `synthesis.md`, `spec/`, `ach/`, `perspectives/`, `chavruta/`, `.ruta/ruta.json`, `.ruta/prompts-version.txt`, `.ruta/chavruta/` from the repo root (these are testing leftovers)

## Impact

- Affected specs: `ruta` (workspace scaffolding requirement, new requirements for UUID, PID-keyed active map, `/ruta-resume`, `/ruta-switch`)
- Affected code: `extensions/state.ts`, `extensions/ruta.ts`, `extensions/tutorial.ts`, `extensions/text-viewer.ts`
- **BREAKING**: `.ruta/ruta.json` → `.ruta/<uuid>/<session-id>/state.json`; artifact paths move under session directory
- No changes to artifact file schemas (notebook.md, glossary.md, etc. format is unchanged)
