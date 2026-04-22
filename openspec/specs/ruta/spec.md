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
The system SHALL store study state and artifacts as user-readable files in the workspace so they remain useful without ruta installed.

#### Scenario: Workspace scaffolding creates plain-text artifacts
- **WHEN** a user runs `/ruta-init <spec-path>`
- **THEN** ruta creates a workspace containing the copied source spec, `.ruta/ruta.json`, and markdown artifact files such as `notebook.md`, `glossary.md`, and `gaps.md`
- **AND** those files are usable in a plain text editor

#### Scenario: Forward progress is derived from files
- **WHEN** ruta evaluates whether a user can advance to a later mode
- **THEN** it derives gate satisfaction from workspace file content and persisted state
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
