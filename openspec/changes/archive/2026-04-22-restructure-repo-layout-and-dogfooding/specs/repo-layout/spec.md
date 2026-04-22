## ADDED Requirements

### Requirement: Repository layout separates source from generated artifacts
The repository MUST distinguish package source, canonical specifications, example inputs, dogfooding scenario definitions, promoted dogfooding snapshots, and transient generated workspaces by directory layout rather than by convention alone.

#### Scenario: Source directories remain package-focused
- **WHEN** a developer inspects the repository root
- **THEN** package source directories are separate from generated ruta workspace artifacts
- **AND** runtime-generated study files do not live at the repository root by default

#### Scenario: Dogfooding assets have explicit homes
- **WHEN** a developer needs to find dogfooding inputs or outputs
- **THEN** tracked scenario definitions live under a dedicated dogfooding scenarios directory
- **AND** promoted auditable outputs live under a dedicated dogfooding snapshots directory
- **AND** transient workspaces live under a dedicated dogfooding runs directory

### Requirement: Runtime artifacts have an ownership policy
The repository MUST define which ruta-generated artifacts are committed fixtures and which are ephemeral runtime outputs.

#### Scenario: Ephemeral runtime output is ignored
- **WHEN** a dogfooding run or local ruta workspace generates `.ruta/`, `glossary.md`, `gaps.md`, or related study artifacts
- **THEN** the repository policy identifies whether those files belong in an ignored transient workspace or in a promoted tracked snapshot
- **AND** ad hoc local runs are not expected to create tracked files at the repository root

#### Scenario: Tracked fixtures are intentionally promoted
- **WHEN** maintainers want auditable evidence for a release or milestone
- **THEN** they promote a selected dogfooding workspace into the tracked snapshots area
- **AND** that promoted snapshot is distinguished from transient runs by its path and documentation
