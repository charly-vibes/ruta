# Project Context

## Purpose
`ruta` is a pi package that turns pi into an opinionated harness for a seven-day spec-immersion workflow. The project emphasizes disciplined reading over output generation: the extension should reduce mechanical friction while preserving cognitive effort.

## Tech Stack
- TypeScript running as a pi extension package
- Node.js module tooling
- pi extension APIs from `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai` for model dispatch
- TypeBox for tool parameter schemas
- Node built-in test runner via `tsx --test`
- Markdown for user-facing skills, prompts, specs, and artifacts

## Project Conventions

### Code Style
- Use TypeScript ES modules.
- Keep package source under top-level package directories such as `extensions/`, `skills/`, `prompts/`, `themes/`, `scripts/`, and `test/`.
- Prefer small helper functions in `extensions/state.ts` and focused extension modules rather than one large file.
- Keep user-facing notes and plans in Markdown or org-mode as already established in the repo.

### Architecture Patterns
- The package is a pure pi add-on and MUST NOT require patched pi internals.
- Prompt guardrails are source-owned in TypeScript, not user-editable markdown templates.
- Runtime project state is file-backed and derived from workspace artifacts rather than long-lived in-memory caches.
- Generated reading artifacts should be treated differently from package source and documentation.

### Testing Strategy
- Run `npm test` for unit tests.
- Run `npm run check` before concluding implementation work.
- Prefer tests around state transitions, prompt integrity, and tool gating.
- Changes that alter repo structure or artifact conventions should include documentation and, where appropriate, fixture or helper coverage.

### Git Workflow
- Keep changes atomic and reviewable.
- Follow TDD and Tidy First where code changes are involved.
- Use OpenSpec for feature, architectural, and workflow changes before implementation.
- Use wai/beads project workflow alongside git commits.

## Domain Context
The project domain combines:
- pi extension development
- spec-reading methodology and anti-sycophancy guardrails
- artifact management for initialized study workspaces
- dogfooding of the extension against real specs, including ruta's own spec

## Important Constraints
- ruta-generated study artifacts currently clutter the repository root and need a clearer ownership model.
- Dogfooding evidence should remain auditable, but ad hoc local runs should not pollute the repo.
- Dogfooding must be configurable so scenarios can be exercised from different commits.
- The repo should distinguish package source, canonical specs, examples, and generated workspaces.

## External Dependencies
- pi and its extension/runtime APIs
- User-configured LLM providers accessed through pi
- npm for packaging/distribution
- OpenSpec for change/spec workflow
- wai and beads for project reasoning and task tracking
