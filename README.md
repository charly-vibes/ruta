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

## Spec files in this repo

This repo intentionally keeps two copies of the sample spec:

- `ruta-spec-v0.2.md` is the source sample spec you point `/ruta-init` at in examples.
- `spec/ruta-spec-v0.2.md` is the initialized workspace copy that ruta reads in-project after setup.

That duplication is expected in this repo because `/ruta-init ruta-spec-v0.2.md` copies the source spec into `spec/` and ruta treats files under `spec/` as read-only after initialization.

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
/ruta-open-spec
/ruta-open-spec Goals
/ruta-comments
/ruta-note ...
/ruta-unity ...
/ruta-done-reading
/ruta-add-term Connection
/ruta-test Connection
/ruta-done-glossary
/ruta-probe "Mode contract: reimplement"
/ruta-add-gap
```

## Viewer smoke test

```text
/ruta-init ruta-spec-v0.2.md
/ruta-open-spec
# use ↑↓, pgup/pgdn, home/end
# press alt+c or ctrl+k ctrl+c to add a comment at the current line
# use ] and [ to jump to next/previous commented lines
# press enter, esc, or q to close
/ruta-comments
/ruta-open-spec Goals
```

The viewer is read-only in v1 and never writes into `spec/`. Comments are stored separately in `.ruta/comments.json`. Comment edit/delete flows are intentionally deferred for now.

## Notes

The implementation is strongest on scaffolding, state, gate enforcement, and prompt integrity. Some richer TUI affordances from the spec are approximated with scratch editors rather than bespoke multi-pane interfaces.
