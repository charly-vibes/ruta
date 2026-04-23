## 0. Beads tracking
- Epic: `ruta-3ia` — Implement OpenSpec change: add-mode-aware-command-disclosure
- [x] `ruta-3ia.1` Prepare disclosure fixtures and edge-state test data
- [x] `ruta-3ia.2` RED: failing tests for `/ruta-status` command disclosure
- [x] `ruta-3ia.3` RED: failing tests for `/ruta-help` disclosure and invariants
- [x] `ruta-3ia.4` GREEN: shared disclosure model + `/ruta-status` output
- [x] `ruta-3ia.5` GREEN: `/ruta-help` mode-aware default + unknown-topic fallback
- [x] `ruta-3ia.6` REFACTOR: deduplicate tutorial/help/status rendering
- [ ] `ruta-3ia.7` VERIFY: snapshot coverage + quality gates

## 1. Fixture foundation (pre-TDD setup)
- [x] 1.1 Add/update fixtures for `pre-init`, `read`, `glossary`, and `reimplement` states. (`ruta-3ia.1`)
- [x] 1.2 Add degraded-state fixtures (missing/corrupt state) and invalid help topic fixtures. (`ruta-3ia.1`)

## 2. RED cycle — status disclosure tests
- [x] 2.1 Add failing test for `/ruta-status` `Available now` section per mode. (`ruta-3ia.2`)
- [x] 2.2 Add failing test for `/ruta-status` `Next unlock` section with gate + transition command. (`ruta-3ia.2`)

## 3. RED cycle — help disclosure and invariant tests
- [x] 3.1 Add failing test for `/ruta-help` (no topic) returning mode-aware command map. (`ruta-3ia.3`)
- [x] 3.2 Add failing test confirming `/ruta-help <topic>` remains topic-specific. (`ruta-3ia.3`)
- [x] 3.3 Add failing test for unknown-topic fallback (suggest valid topics + mode-aware map). (`ruta-3ia.3`)
- [x] 3.4 Add failing test for disclosure-vs-authorization invariant. (`ruta-3ia.3`)

## 4. GREEN cycle — status behavior
- [x] 4.1 Implement `getModeCommandDisclosure(state)` as single source of truth. (`ruta-3ia.4`)
- [x] 4.2 Implement stable groups: `always`, `bootstrap`, `mode-specific`, `transition`. (`ruta-3ia.4`)
- [x] 4.3 Update `/ruta-status` scratch output with `Available now` and `Next unlock`. (`ruta-3ia.4`)
- [x] 4.4 Implement degraded-state recovery hint in status/help disclosure surfaces. (`ruta-3ia.4`)

## 5. GREEN cycle — help behavior
- [x] 5.1 Update `/ruta-help` default output to use shared disclosure model. (`ruta-3ia.5`)
- [x] 5.2 Preserve `/ruta-help <topic>` behavior unchanged. (`ruta-3ia.5`)
- [x] 5.3 Implement unknown-topic fallback with valid topic suggestions. (`ruta-3ia.5`)
- [x] 5.4 Ensure pre-init shows only `always` + `bootstrap` as actionable. (`ruta-3ia.5`)

## 6. REFACTOR cycle — tidy first
- [x] 6.1 Remove duplication across tutorial/help/status command listings using shared helper. (`ruta-3ia.6`)
- [x] 6.2 Apply copy style pass (verb-first command labels, one-line purpose, low cognitive load). (`ruta-3ia.6`)

## 7. Verification and closeout
- [x] 7.1 Add snapshot/fixture assertions for disclosure text shape across states. (`ruta-3ia.7`)
- [x] 7.2 Run `npm test`. (`ruta-3ia.7`)
- [x] 7.3 Run `npm run check`. (`ruta-3ia.7`)
- [x] 7.4 Keep this checklist and bead statuses in sync as work progresses. (`ruta-3ia.7`)
