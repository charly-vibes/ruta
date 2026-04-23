# Design: Session-per-spec layout

## Context

ruta currently writes all artifacts to the repo root and a single `.ruta/ruta.json`. Users who read multiple specs sequentially or in parallel need isolated workspaces. The design must not break the rule that artifact files are plain markdown usable without ruta.

## Directory layout

```
.ruta/
  active.json                   # PID-keyed map of live sessions
  a3f7b2c1d4e5f6a7/             # sha256(absSpecPath).slice(0, 16)
    meta.json                   # { source_spec_path, sessions: ["session-1", ...] }
    session-1/
      state.json                # was ruta.json (schema unchanged except path field rename)
      <spec-filename>.md        # spec snapshot (original basename preserved)
      notebook.md
      glossary.md
      gaps.md
      comments.json
      propositions.md
      properties.md
      contracts.md
      premortem.md
      synthesis.md
      chavruta/
      perspectives/
      ach/
    session-2/                  # created when user picks "start fresh"
      ...
  b5c6d7e8f9a0b1c2/             # second spec
    ...
```

## `active.json` schema

```json
{
  "12345": {
    "spec_uuid": "a3f7b2c1d4e5f6a7",
    "session_id": "session-1",
    "source_spec_path": "openspec/AGENTS.md",
    "started_at": "2026-04-22T14:00:00Z"
  },
  "67890": {
    "spec_uuid": "b5c6d7e8f9a0b1c2",
    "session_id": "session-1",
    "source_spec_path": "openspec/specs/ruta/design.md",
    "started_at": "2026-04-22T14:05:00Z"
  }
}
```

Key is `process.pid.toString()`. Stale PIDs (process no longer alive) are pruned on every read.

## `meta.json` schema

```json
{
  "source_spec_path": "openspec/AGENTS.md",
  "sessions": ["session-1", "session-2"]
}
```

## UUID computation

```typescript
import { createHash } from "node:crypto";
import { resolve } from "node:path";

// cwd is used only to resolve relative paths — it is NOT part of the hash.
// UUID is keyed solely on the absolute path of the spec file.
function computeSpecUUID(cwd: string, specPath: string): string {
  const abs = resolve(cwd, specPath);
  return createHash("sha256").update(abs).digest("hex").slice(0, 16);
}
```

16 hex chars = 64 bits. P(collision | 1M files) ≈ 2.7 × 10⁻⁸. Acceptable for local dev.

## `/ruta-init <path>` flow

1. Resolve absolute path → `computeSpecUUID` → `uuid`
2. Check `.ruta/<uuid>/meta.json`:
   - If absent → new spec, skip to step 5 (no resume prompt)
   - If present → filter `sessions` array to only those with existing session directories, then:
     - If no valid sessions remain → treat as new spec (step 5)
     - If valid sessions exist → prompt: `Resume session-N (latest) or start fresh? [r/n]`
3. If resuming (step 4 path): check `active.json` for any live PID with same `spec_uuid + session_id` → warn if found (not blocked). Skip this check for new sessions — a brand-new session can never have a collision.
4. Resume path: load `session-N/state.json`, write PID entry to `active.json`, notify user
5. New session path:
   - `session_id = session-${validSessions.length + 1}`
   - Scaffold session directory: copy spec snapshot, create empty artifact files (`notebook.md`, `glossary.md`, `gaps.md` — see note on `comments.json` below)
   - Write `state.json`, update `meta.json`, write PID entry to `active.json`
   - Notify user

## `/ruta-resume [path]` flow

- With `path`: compute UUID; filter `meta.json` sessions to existing directories; if valid sessions exist, resume latest without asking; if no sessions exist, fall back to `/ruta-init` behavior (scaffold `session-1`) and notify: "No previous session found — starting session-1."
- No args: read all `meta.json` files across `.ruta/*/`, filter to existing session directories, show numbered list via `ctx.ui.notify` + `ctx.ui.input("Pick a session: ")`, resume selected

## `/ruta-switch` flow

- Read all `.ruta/*/meta.json`, filter to existing session directories
- If no sessions found: display "No sessions yet. Run `/ruta-init <path>` to start." and return
- Show numbered list via `ctx.ui.notify`: `[N] source_spec_path  session-N  (mode: read)`
- Prompt with `ctx.ui.input("Pick a session: ")`; parse number → update `active.json[process.pid]`
- Note: orphaned sessions (spec file moved/renamed) appear in the list under their old `source_spec_path` — user may still switch to them

## State API changes

| Before | After |
|--------|-------|
| `loadProjectState(cwd)` | `loadActiveSession(cwd)` → `{ state, sessionDir, active: ActiveEntry } \| null` |
| `artifactPaths(cwd)` | `artifactPaths(sessionDir)` |
| `saveProjectState(cwd, state)` | `saveProjectState(sessionDir, state)` |
| `scaffoldProject(cwd, specPath, ack)` | `scaffoldSession(cwd, specPath, sessionDir)` |

New exports: `computeSpecUUID`, `loadActiveSession`, `listAllSessions`, `writeActiveEntry`, `pruneDeadPIDs`.

## Decisions

- **Decision: warn-not-block on parallel access.** File-locking would require OS-level `flock(2)` wrappers. The risk surface is small (ruta writes are user-triggered, not background). Warn is sufficient for v0 — matches R-15.3.1 intent.
- **Decision: `active.json` at `.ruta/active.json` (not per-uuid).** A single file makes it easy to enumerate all live sessions from any command. UUID dirs hold spec-local data; `active.json` is process-local state.
- **Decision: `meta.json` separate from `state.json`.** `state.json` is per-session; `meta.json` is per-spec. Keeping them separate avoids loading every session's state just to list sessions.
- **Decision: preserve original spec basename in session dir.** Keeps artifacts legible without ruta installed.

## `comments.json` note

`comments.json` is now scaffolded in each session directory as an empty JSON array (`[]`). This keeps comment persistence session-local and aligns the implementation with the layout diagram.

## Risks / Trade-offs

- **Stale `active.json` entries** if PI crashes without cleanup → mitigated by pruning on every read (check `process.kill(pid, 0)`)
- **`active.json` concurrent write race** — two terminals running `/ruta-init` simultaneously could overwrite each other's PID entry (read-modify-write with no lock). Impact is a missed parallel-access warning, not data corruption. Race window is < 1ms in practice. Acceptable for v0 — document as known limitation.
- **Absolute path UUID** means moving the spec file (or the repo) invalidates the UUID → existing sessions become orphaned but not broken; `/ruta-resume` won't find them by new path. Orphaned sessions remain visible in `/ruta-switch`. Acceptable — same as `.git` behavior.
- **Session proliferation** if user hits "start fresh" repeatedly → directories accumulate. No auto-cleanup in v0; `/ruta-switch` makes them visible.
- **`.gitignore` opt-out** — `.ruta/` is gitignored by default. Teams that want shared sessions (e.g., collaborative spec review) should remove `.ruta/` from `.gitignore` and coordinate via git, accepting merge conflicts on `active.json`.
- **`state.json` corruption** — a crash mid-write leaves a partial `state.json`. If `loadActiveSession` encounters a JSON parse error, display an error with the session directory path and suggest manual inspection or re-running `/ruta-init` for that spec to scaffold a fresh session.

## Open Questions

- (none blocking v0)
