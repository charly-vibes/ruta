# ruta

[![tracked with wai](https://img.shields.io/badge/tracked%20with-wai-blue)](https://github.com/charly-vibes/wai)

`ruta` is a pi package that turns pi into an opinionated harness for a seven-day spec-immersion workflow.

## Status

This repo is now initialized with `wai` and scaffolded as a pi package.

Implemented here:
- `wai` workspace + project setup
- `pi` package manifest
- v0 extension scaffold for `read`, `glossary`, and `reimplement`
- source-owned prompt constants
- bundled skills, prompt reference, and theme
- state helpers, hashing, project scaffolding, and basic gate checks
- unit tests for prompt composition and core gate helpers

## Local development

```bash
npm install
just check
```

## Run in pi locally

Fastest way, without installing globally:

```bash
pi -e .
```

That loads this package for the current `pi` run only.
The package manifest points pi at `extensions/ruta.ts` as the single extension entrypoint.

## Repository layout

The repo now separates package source from generated ruta workspaces:

- `extensions/`, `skills/`, `prompts/`, `themes/`, `scripts/`, `test/` — package source
- `openspec/specs/` — canonical OpenSpec-tracked product specs
- `examples/specs/` — source spec inputs used in examples and local initialization
- `dogfooding/scenarios/` — tracked dogfooding scenario definitions and their input fixtures
- `dogfooding/snapshots/` — tracked promoted dogfooding workspaces kept as auditable evidence
- `dogfooding/runs/` — ephemeral commit-aware workspaces materialized locally; gitignored

Root-level ruta workspace artifacts such as `.ruta/`, `glossary.md`, or `gaps.md` are no longer part of the committed repo layout.

## Spec files in this repo

- `openspec/specs/ruta/spec.md` is the canonical OpenSpec product spec.
- `openspec/specs/ruta/design.md` preserves the migrated narrative v0.2 specification text.
- `examples/specs/ruta-spec-v0.2.md` is the sample input spec used in examples.
- `dogfooding/snapshots/self-hosted/v0.2/` is a promoted initialized workspace snapshot for auditability.

Other useful options:

```bash
# Install this package into pi's package list
pi install .

# Then run pi normally in this repo
pi
```

```bash
# Or install only for this project
pi install -l .
```

If you are iterating on the extension, start with `pi -e .` and use `/reload` after edits.

Then inside pi:

```text
/ruta-init examples/specs/ruta-spec-v0.2.md
/ruta-tutorial
/ruta-open-spec
/ruta-open-spec Goals
/ruta-comments
/ruta-note ...
/ruta-unity ...
/ruta-done-reading
/ruta-tutorial
/ruta-add-term Connection
/ruta-probe-term Connection
/ruta-done-glossary
/ruta-tutorial
/ruta-probe "Mode contract: reimplement"
/ruta-add-gap
/ruta-exit
```

ruta guardrails do **not** auto-activate on session start. Use `/ruta-start` to enable them for an existing project, and `/ruta-exit` to pause them for the current session.

## Dogfooding

Tracked dogfooding is scenario-based.

- Scenario definitions live under `dogfooding/scenarios/<scenario>/`
- Promoted snapshots live under `dogfooding/snapshots/<scenario>/...`
- Ephemeral local runs live under `dogfooding/runs/<scenario>/<commit>/`

Materialize a fresh run for the current commit:

```bash
npm run dogfood:run -- self-hosted
```

Materialize a run for a specific revision label:

```bash
npm run dogfood:run -- self-hosted --commit demo-sha
```

The script copies the tracked scenario inputs into a fresh commit-scoped run directory and writes `dogfooding-run.json` metadata into that workspace. For the bundled self-hosted scenario, open the run directory in pi and initialize with:

```text
/ruta-init ruta-spec-v0.2.md
```

## Viewer smoke test

```text
/ruta-init examples/specs/ruta-spec-v0.2.md
/ruta-open-spec
# use ↑↓, pgup/pgdn, home/end
# press alt+c or ctrl+k ctrl+c to add a comment at the current line
# use ] and [ to jump to next/previous commented lines
# press enter, esc, or q to close
/ruta-comments
/ruta-open-spec Goals
```

The viewer is read-only in v1 and never writes into `spec/`. Comments are stored separately in `.ruta/comments.json`. Comment edit/delete flows are intentionally deferred for now.

## Onboarding

If you are unsure what to do next, run `/ruta-tutorial`.
It works both before and after `/ruta-init`:
- before init, it explains the workflow and how to start
- after init, it becomes mode-aware and lists only the commands that make sense right now

## Notes

The implementation is strongest on scaffolding, state, gate enforcement, and prompt integrity. Some richer TUI affordances from the spec are approximated with scratch editors rather than bespoke multi-pane interfaces.
