## ADDED Requirements

### Requirement: Dogfooding is scenario-configurable
The project MUST support tracked dogfooding scenarios that define the inputs and workspace configuration needed to materialize a ruta dogfooding workspace.

#### Scenario: Scenario definition is tracked in git
- **WHEN** a maintainer adds or reviews a dogfooding case
- **THEN** the scenario definition is stored in a tracked directory alongside its input fixtures
- **AND** the scenario can be understood without relying on chat history or local shell state

#### Scenario: Scenario can be materialized repeatedly
- **WHEN** a maintainer runs the dogfooding workflow for a scenario on different commits
- **THEN** the scenario definition remains stable
- **AND** each run materializes a fresh workspace from the tracked inputs for that commit

### Requirement: Dogfooding runs are commit-aware and ephemeral by default
Dogfooding runs MUST be materialized into a path that distinguishes runs by commit or equivalent revision identity, and those runs MUST be ephemeral unless explicitly promoted.

#### Scenario: Different commits produce distinct run directories
- **WHEN** a maintainer materializes the same dogfooding scenario from two different commits
- **THEN** the resulting workspaces land in distinct run directories keyed by scenario and commit identity
- **AND** one run does not silently overwrite the other

#### Scenario: Ad hoc runs are not treated as release evidence
- **WHEN** a maintainer materializes a dogfooding workspace for ordinary development or debugging
- **THEN** the run is stored in the ephemeral runs area
- **AND** it is not considered release evidence until explicitly promoted into the tracked snapshots area

### Requirement: Release evidence uses promoted snapshots
The project MUST support promoting selected dogfooding runs into tracked snapshots for auditability.

#### Scenario: Release snapshot is reviewable
- **WHEN** a maintainer prepares a release or milestone that requires dogfooding evidence
- **THEN** they can promote a selected run into a tracked snapshot location
- **AND** reviewers can inspect the promoted snapshot independently of transient local runs
