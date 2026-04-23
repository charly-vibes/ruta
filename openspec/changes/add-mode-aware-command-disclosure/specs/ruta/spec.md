## ADDED Requirements

### Requirement: Mode-aware command disclosure
The system SHALL progressively disclose ruta commands according to the current ruta state so only contextually actionable commands are emphasized.

The disclosure model SHALL use these groups:
- `always`: commands available regardless of mode
- `bootstrap`: commands for establishing a ruta session before initialization
- `mode-specific`: commands for the active mode's artifact work
- `transition`: commands for moving between workflow stages

At minimum, disclosure SHALL include these commands in the following states:
- `pre-init`: `/ruta-init`, `/ruta-tutorial`, `/ruta-help`, `/ruta-why`
- `read`: `/ruta-note`, `/ruta-unity`, `/ruta-done-reading`
- `glossary`: `/ruta-add-term`, `/ruta-probe-term`, `/ruta-done-glossary`
- `reimplement`: `/ruta-probe`, `/ruta-add-gap`, `/ruta-done-reimplement`

#### Scenario: Pre-init state shows bootstrap commands
- **WHEN** the user has not initialized ruta in the current workspace
- **THEN** ruta help surfaces `always` and `bootstrap` command groups
- **AND** it does not present `mode-specific` workflow commands as currently actionable

#### Scenario: Status shows actionable commands for current mode
- **WHEN** the user runs `/ruta-status` in an initialized workspace
- **THEN** the scratch output includes an `Available now` section listing commands valid in the current mode
- **AND** each listed command is labeled with a one-line purpose statement

#### Scenario: Status explains next unlock path
- **WHEN** the next forward mode is locked
- **THEN** `/ruta-status` includes a `Next unlock` section naming the unsatisfied gate and transition command
- **AND** the section references commands that satisfy that gate

#### Scenario: Help without topic is mode-aware
- **WHEN** the user runs `/ruta-help` without a topic
- **THEN** ruta returns a mode-aware command map for the current state
- **AND** it highlights `transition` commands separately from `always` commands

#### Scenario: Topic help remains available
- **WHEN** the user runs `/ruta-help <topic>`
- **THEN** ruta returns topic-specific guidance
- **AND** mode-aware command disclosure does not remove topic-level explanations

#### Scenario: Disclosure does not alter authorization
- **WHEN** a command is not highlighted by disclosure for the current mode
- **THEN** ruta preserves its existing command gating and execution behavior
- **AND** disclosure only changes guidance and emphasis

### Requirement: Disclosure remains resilient under missing or invalid inputs
The system SHALL provide useful command guidance when help/status requests encounter missing state or invalid topics.

#### Scenario: Corrupt or missing state falls back to recovery guidance
- **WHEN** ruta cannot load valid project state for command disclosure
- **THEN** `/ruta-help` and `/ruta-status` show bootstrap commands
- **AND** they include a recovery hint to reinitialize or resume the session

#### Scenario: Unknown help topic falls back to guided topic discovery
- **WHEN** the user runs `/ruta-help <topic>` with an unknown topic key
- **THEN** ruta reports the topic is unknown
- **AND** it returns the mode-aware command map plus valid topic suggestions
