---
date: 2026-04-21
project: ruta
phase: implement
---

# Session Handoff

## What Was Done

- Initialized `wai` in the repo and created the `ruta` project.
- Added initial `wai` artifacts for research, design, and plan; advanced the project phase to `implement`.
- Scaffolded the repo as a pi package with:
  - `package.json`
  - `extensions/ruta.ts`
  - `extensions/state.ts`
  - `extensions/prompts.ts`
  - bundled `skills/`, `prompts/`, `themes/`
  - tests under `test/`
- Added repo hygiene files recommended by `wai way`: `justfile`, `.editorconfig`, `_typos.toml`, `.vale.ini`, `.gitignore`, `llm.txt`.
- Added README instructions for local usage, including `pi -e .`.
- Fixed a packaging bug: pi was loading helper files in `extensions/` as extensions. The fix was changing `package.json` to point `pi.extensions` at the single entrypoint `./extensions/ruta.ts`.
- Manually tested `/ruta-init`; it successfully scaffolded a ruta project and entered `read` mode.
- Identified a major UX gap: the current scaffold does not provide an in-pi spec reading surface.
- Wrote a concrete implementation plan for a spec viewer plus cursor-anchored sidecar comments:
  - `plans/2026-04-21-spec-viewer-comments.org`
- Created GitHub issues from that plan:
  - `#1` Add sidecar model and persistence for ruta spec comments
  - `#2` Add a read-only ruta spec viewer with `/ruta-open-spec`
  - `#3` Support cursor-anchored spec comments and comment listing
  - `#4` Add VS Code-like comment chord and comment navigation polish

## Key Decisions

- Keep prompts in TypeScript source (`extensions/prompts.ts`) rather than markdown, matching the ruta spec’s prompt-integrity requirements.
- Treat `spec/` as read-only after init; future inline comments must be stored in a sidecar under `.ruta/`, not written into the spec.
- Use pi’s custom editor API (`ctx.ui.setEditorComponent(...)`) for the eventual viewer/comment UX instead of trying to bend the default editor into a cursor-aware spec reader.
- Phase the viewer/comment work:
  1. comment data model and persistence
  2. read-only `/ruta-open-spec` viewer
  3. inline comment creation with a temporary safe shortcut (`alt+c`)
  4. VS Code-like `ctrl+k ctrl+c` chord and navigation polish
- Prefer a temporary `alt+c` shortcut before a `ctrl+k` chord because pi already uses `ctrl+k` in the default editor.

## Gotchas & Surprises

- `pi -e .` initially failed because the package manifest used `"extensions": ["./extensions"]`, causing pi to try to load helper modules (`prompts.ts`, `state.ts`) as extension entrypoints.
- GitHub issue creation initially succeeded but some issue bodies were mangled by shell interpolation of backticks; issues `#2`–`#4` were then corrected and verified.
- `wai handoff create ruta` reports a path like `handoffs/...`, but the actual file lives under `.wai/projects/ruta/handoffs/...`.

## What Took Longer Than Expected

- Getting the package layout aligned with pi’s package loader behavior.
- Verifying the extension API and editor customization path in pi docs/examples before planning the spec viewer.
- Cleaning up the GitHub issue creation flow after the shell interpolation mistake.

## Open Questions

- Whether the first viewer should be purely read-only or allow some local non-spec editing affordances beyond comments.
- How robust comment anchors need to be in v1 when the spec changes: line number + excerpt + best-effort section ref is planned, but not yet validated in practice.
- Whether to eagerly create `.ruta/comments.json` during init or only on first comment.

## Next Steps

1. Implement issue `#1`: sidecar comment model and persistence in `extensions/state.ts` with tests in `test/state.test.ts`.
2. Implement issue `#2`: `/ruta-open-spec` and a read-only custom spec viewer in a new file, likely `extensions/spec-viewer.ts`.
3. Wire issue `#3`: add inline comments at cursor with `alt+c` plus `/ruta-comments`.
4. Only after the above, implement issue `#4` for `ctrl+k ctrl+c` chord behavior and comment navigation.
5. Commit the current scaffold, plan, handoff, and issue-driven next-step docs using the `commit` skill flow.

## Context

### git_status

```
 M README.md
?? .editorconfig
?? .gitignore
?? .ruta/
?? .vale.ini
?? .wai/projects/
?? .wai/resources/agent-config/skills/
?? AGENTS.md
?? CLAUDE.md
?? _typos.toml
?? contracts.md
?? extensions/
?? gaps.md
?? glossary.md
?? justfile
?? llm.txt
?? notebook.md
?? package-lock.json
?? package.json
?? perspectives/
?? plans/
?? premortem.md
?? prompts-version.txt
?? prompts/
?? properties.md
?? propositions.md
?? ruta-spec-v0.2.md
?? scripts/
?? skills/
?? spec/
?? synthesis.md
?? test/
?? themes/
```

