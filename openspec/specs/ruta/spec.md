# ruta

## Purpose

`ruta` is a pi package for disciplined multi-pass specification reading. It constrains AI assistance so the user performs the comprehension work themselves while still receiving narrow support for testing paraphrases, surfacing implementation gaps, and maintaining durable reading artifacts.
## Requirements
### Requirement: Mode-restricted reading workflow
The system SHALL provide a staged reading workflow with explicit modes that enforce different AI access policies.

#### Scenario: Read mode disables AI conversation
- **WHEN** a user is in `read` mode and sends non-command input
- **THEN** ruta blocks the LLM interaction
- **AND** ruta explains that the restriction is intentional

#### Scenario: Glossary mode allows only narrow AI assistance
- **WHEN** a user is in `glossary` mode
- **THEN** ruta allows glossary-specific probing operations
- **AND** ruta blocks free-form chat

#### Scenario: Reimplement mode permits gap probing without auto-resolution
- **WHEN** a user is in `reimplement` mode
- **THEN** ruta allows tools that surface implementation decisions, silences, ambiguities, and assumptions
- **AND** ruta does not directly write model output into `gaps.md`

### Requirement: User-authored artifacts remain durable and file-backed
The system SHALL store study state and artifacts as user-readable files under a session directory so that each spec study is isolated and artifacts survive across sessions.

#### Scenario: Workspace scaffolding creates a session directory
- **WHEN** a user runs `/ruta-init <spec-path>` for the first time for that spec
- **THEN** ruta creates a session directory at `.ruta/<spec-uuid>/session-1/`
- **AND** the directory contains a spec snapshot, `state.json`, and empty artifact files (`notebook.md`, `glossary.md`, `gaps.md`, etc.)
- **AND** those files are usable in a plain text editor without ruta installed

#### Scenario: Re-initializing an existing spec prompts for resume or new session
- **WHEN** a user runs `/ruta-init <spec-path>` and a session already exists for that spec
- **THEN** ruta prompts the user to resume the latest session or start a fresh one
- **AND** choosing resume loads the existing `state.json` without changing artifact files
- **AND** choosing fresh creates the next incremental session directory (`session-2`, `session-3`, …)

#### Scenario: Forward progress is derived from files
- **WHEN** ruta evaluates whether a user can advance to a later mode
- **THEN** it derives gate satisfaction from session artifact file content and persisted state
- **AND** it does not rely only on in-memory session state

### Requirement: Guardrails are source-owned and enforced
The system SHALL keep its anti-sycophancy and anti-outsourcing guardrails in extension source and enforce them during prompt composition and tool access.

#### Scenario: Base prompt is included for every AI-enabled mode
- **WHEN** ruta composes a system prompt for an agent turn
- **THEN** it prepends its base prompt fragment
- **AND** that fragment forbids agreement language, unsupported claims, and writing the user's artifacts for them

#### Scenario: Prompt integrity drift is surfaced
- **WHEN** ruta detects that the active prompt bundle differs from the one recorded for a project or sees a known external override pattern
- **THEN** ruta warns the user that guardrails may have changed or been compromised

### Requirement: Dogfooding is scenario-driven and auditable
The repository SHALL manage dogfooding through tracked scenarios, ephemeral revision-scoped runs, and promoted snapshots.

#### Scenario: Scenario definitions are tracked
- **WHEN** a maintainer defines a dogfooding case
- **THEN** its configuration and input fixtures live under `dogfooding/scenarios/<scenario>/`
- **AND** the scenario can be materialized without relying on chat history

#### Scenario: Local runs are commit-aware and ephemeral
- **WHEN** a maintainer materializes a dogfooding run for a scenario
- **THEN** the workspace is created under `dogfooding/runs/<scenario>/<commit>/` or an equivalent revision-keyed path
- **AND** the run does not silently overwrite another revision's run

#### Scenario: Release evidence is promoted separately
- **WHEN** a maintainer wants auditable dogfooding evidence for a release or milestone
- **THEN** they promote a selected run into `dogfooding/snapshots/<scenario>/<release-or-milestone>/`
- **AND** the promoted snapshot is tracked separately from ephemeral runs

### Requirement: Spec UUID provides stable per-spec isolation
The system SHALL compute a deterministic UUID for each spec file so that session directories can be organized without naming conflicts.

#### Scenario: UUID is derived from the absolute path
- **WHEN** a user runs `/ruta-init <spec-path>`
- **THEN** ruta resolves the path to an absolute filesystem path
- **AND** computes `sha256(absPath).slice(0, 16)` as the spec UUID
- **AND** uses that UUID as the directory name under `.ruta/`

#### Scenario: Same spec from different working directories uses the same UUID
- **WHEN** the same spec file is referenced from the same absolute path in two different ruta invocations
- **THEN** both resolve to the same UUID directory
- **AND** sessions are shared across those invocations

### Requirement: Active session tracking uses a PID-keyed map
The system SHALL maintain a single `.ruta/active.json` file that maps process PIDs to their current session, supporting multiple parallel terminals each working on different specs.

#### Scenario: Each terminal registers its session on init or resume
- **WHEN** a user runs `/ruta-init` or `/ruta-resume` in a terminal
- **THEN** ruta writes an entry keyed by `process.pid` to `.ruta/active.json`
- **AND** the entry records `spec_uuid`, `session_id`, `source_spec_path`, and `started_at`

#### Scenario: Stale PID entries are pruned automatically
- **WHEN** ruta reads `.ruta/active.json`
- **THEN** it checks each PID for liveness using `process.kill(pid, 0)`
- **AND** removes entries for dead processes before writing back

#### Scenario: Parallel access to the same session triggers a warning
- **WHEN** a second live terminal attempts to activate the same `spec_uuid + session_id` already held by another live PID
- **THEN** ruta warns the user that concurrent writes to the same session may conflict
- **AND** ruta proceeds (does not block)

### Requirement: `/ruta-resume` restores a previous session without prompting
The system SHALL provide a `/ruta-resume` command that resumes the latest session for a spec without asking "start fresh?".

#### Scenario: Resume with a spec path
- **WHEN** a user runs `/ruta-resume <spec-path>`
- **THEN** ruta loads the latest session for that spec
- **AND** registers the current PID in `active.json`
- **AND** does not prompt for new vs resume

#### Scenario: Resume with no argument shows a session picker
- **WHEN** a user runs `/ruta-resume` with no argument
- **THEN** ruta lists all existing sessions across all spec UUIDs
- **AND** the user selects one to activate

### Requirement: `/ruta-switch` changes the active session for the current terminal
The system SHALL provide a `/ruta-switch` command that lists all known sessions and lets the user change which one the current terminal is working on.

#### Scenario: Switch shows sessions from all specs
- **WHEN** a user runs `/ruta-switch`
- **THEN** ruta displays a list of all sessions under `.ruta/`, including `source_spec_path`, `session_id`, and current mode
- **AND** the user selects one to make active for the current terminal
- **AND** `active.json` is updated for the current PID

