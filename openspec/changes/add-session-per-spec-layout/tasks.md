## 1. State layer (`extensions/state.ts`)

- [ ] 1.1 Add `computeSpecUUID(cwd, specPath)` — sha256 of absolute path, 16-char hex
- [ ] 1.2 Add `readActiveJson(cwd)` / `writeActiveJson(cwd, map)` helpers with dead-PID pruning
- [ ] 1.3 Add `writeActiveEntry(cwd, uuid, sessionId, sourcePath)` — writes current PID entry
- [ ] 1.4 Add `loadActiveSession(cwd)` → `{ state, sessionDir, active } | null`
- [ ] 1.5 Add `listAllSessions(cwd)` → array of `{ uuid, sessionId, sourcePath, mode, sessionDir }`
- [ ] 1.6 Refactor `artifactPaths(cwd)` → `artifactPaths(sessionDir)` (cwd removed from signature)
- [ ] 1.7 Refactor `saveProjectState(cwd, state)` → `saveProjectState(sessionDir, state)`
- [ ] 1.8 Add `scaffoldSession(cwd, sourcePath, sessionDir)` replacing `scaffoldProject`
- [ ] 1.9 Update `source_spec_path` field handling (already in state; ensure it is still stored)

## 2. Command layer (`extensions/ruta.ts`)

- [ ] 2.1 Rewrite `/ruta-init` handler: compute UUID, check for existing sessions, prompt resume/fresh, scaffold or resume, write `active.json` entry, check parallel-access warning
- [ ] 2.2 Replace all `loadStateOrNotify(ctx.cwd, ctx)` → `loadActiveSessionOrNotify(ctx.cwd, ctx)` across all handlers; destructure `{ state, sessionDir }`
- [ ] 2.3 Replace all `artifactPaths(ctx.cwd)` → `artifactPaths(sessionDir)`
- [ ] 2.4 Replace all `saveState(ctx.cwd, ...)` → `saveState(sessionDir, ...)`
- [ ] 2.5 Register `/ruta-resume` command with `getArgumentCompletions` (path completion)
- [ ] 2.6 Register `/ruta-switch` command (no args; display numbered session list via `ctx.ui.notify`, then prompt with `ctx.ui.input("Pick a session: ")` to select; no-sessions case shows "No sessions yet. Run `/ruta-init <path>` to start.")
- [ ] 2.7 Update `refreshUi` / `setStatus` to still show `source_spec_path` (no change in UX)

## 3. Tutorial / help (`extensions/tutorial.ts`)

- [ ] 3.1 Update `buildTutorialText` — no changes needed to text, but verify `source_spec_path` still flows through correctly after state API change

## 4. Tests

- [ ] 4.1 Unit tests for `computeSpecUUID` (deterministic, different paths → different UUIDs)
- [ ] 4.2 Unit tests for `readActiveJson` dead-PID pruning
- [ ] 4.3 Unit tests for `loadActiveSession` — returns null when no `active.json`, returns correct session when present
- [ ] 4.4 Update existing state tests that use `artifactPaths(cwd)` → `artifactPaths(sessionDir)`
- [ ] 4.5 `npm run check` passes

## 5. Cleanup

- [ ] 5.1 Delete root-level testing artifacts: `notebook.md`, `glossary.md`, `gaps.md`, `propositions.md`, `properties.md`, `contracts.md`, `premortem.md`, `synthesis.md`, `spec/`, `ach/`, `perspectives/`, `chavruta/`, `.ruta/ruta.json`, `.ruta/prompts-version.txt`, `.ruta/chavruta/`
- [ ] 5.2 Add `.ruta/` to `.gitignore`, creating the file if it does not already exist (session artifacts should not be committed)

## 6. Spec / documentation

- [ ] 6.1 Update `openspec/specs/ruta/spec.md` project structure section after archiving this change
