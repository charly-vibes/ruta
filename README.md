# ruta

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
/ruta-init ruta-spec-v0.2.md
/ruta-note ...
/ruta-unity ...
/ruta-done-reading
/ruta-add-term Connection
/ruta-test Connection
/ruta-done-glossary
/ruta-probe "Mode contract: reimplement"
/ruta-add-gap
```

## Notes

The implementation is strongest on scaffolding, state, gate enforcement, and prompt integrity. Some richer TUI affordances from the spec are approximated with scratch editors rather than bespoke multi-pane interfaces.
