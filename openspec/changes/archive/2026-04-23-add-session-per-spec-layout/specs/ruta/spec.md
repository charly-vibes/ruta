## MODIFIED Requirements

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

## ADDED Requirements

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

