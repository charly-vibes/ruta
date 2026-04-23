# Change: Add mode-aware progressive command disclosure

## Why
Users can currently see many `/ruta-*` commands at once, even when only a subset is relevant in their current workflow state. This increases cognitive load and makes it harder to know the next correct action for the active mode.

## What Changes
- Add a mode-aware command disclosure model that maps ruta state (`pre-init`, `read`, `glossary`, `reimplement`) to stable command groups.
- Make `/ruta-status` include two new sections in scratch output: `Available now` and `Next unlock`.
- Extend `/ruta-help` so running it without a topic returns a mode-aware command map.
- Keep `/ruta-help <topic>` behavior intact for concept deep-dives.
- Keep disclosure semantics separate from authorization semantics: this proposal changes what is emphasized, not which commands are executable.

## Scope
### In scope
- `/ruta-status` scratch output
- `/ruta-help` default output (no topic)
- Shared command-disclosure source used by status/help/tutorial renderers

### Out of scope (deferred)
- Global pi `/help` behavior
- Slash-command registration visibility in the host shell
- Tab-completion ranking changes

## Impact
- Affected specs: `ruta`
- Affected code: `extensions/ruta.ts`, `extensions/help-topics.ts`, `extensions/tutorial.ts`, related tests under `test/`
- Non-goal: changing command gating/authorization policy
