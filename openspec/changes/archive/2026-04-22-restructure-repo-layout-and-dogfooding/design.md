## Context
The current repository layout reflects both package development and an initialized ruta workspace in the same root directory. That was useful for fast prototyping, but it now obscures boundaries between:
- package source that ships on npm
- canonical specs and examples used as input
- dogfooding evidence kept for auditability
- transient generated artifacts from local runs

The spec already requires auditable dogfooding, but a single static `dogfooding/v<release>/` pattern is too rigid for testing across different commits. We need a model that preserves auditability while allowing reproducible per-commit runs.

## Goals / Non-Goals
- Goals:
  - Separate source, examples, canonical specs, and generated workspaces.
  - Support configurable dogfooding scenarios.
  - Support commit-aware ephemeral runs.
  - Preserve auditable promoted snapshots for releases or milestones.
- Non-Goals:
  - Defining every future dogfooding scenario.
  - Building a full orchestration system in this proposal.
  - Changing ruta's reading methodology.

## Decisions
- Decision: Treat dogfooding as scenario-driven rather than as a single committed workspace.
  - Alternatives considered:
    - Keep one static committed workspace under `dogfooding/v<release>/`: easy to inspect, but poor for cross-commit runs and easy to mutate accidentally.
    - Keep all runs committed: auditable, but too noisy and not suitable for everyday development.
- Decision: Split dogfooding into tracked scenario definitions, ignored ephemeral runs, and selectively tracked promoted snapshots.
  - Alternatives considered:
    - Ignore all dogfooding outputs: clean repo, but loses release auditability.
    - Commit all outputs by default: maximal evidence, but excessive churn.
- Decision: Move runtime/generated artifacts out of the repository root.
  - Alternatives considered:
    - Keep root artifacts and document them better: lowest migration cost, but does not solve the ownership problem.

## Risks / Trade-offs
- Introducing a scenario config format adds one more concept for maintainers to learn.
  - Mitigation: keep the format minimal and document it in README/specs.
- Moving fixtures and examples changes paths referenced in docs/tests.
  - Mitigation: update docs and validate path references as part of implementation.
- Release auditability could regress if snapshot promotion is underspecified.
  - Mitigation: require explicit promoted snapshots under a tracked directory.

## Migration Plan
1. Define the target repository layout and artifact policy.
2. Move root-level ruta workspace artifacts into the dogfooding structure.
3. Move source/example specs into explicit example or canonical-spec locations.
4. Add ignore rules for transient runs.
5. Update docs and any helper scripts/tests to use the new paths.

## Open Questions
- What should the initial scenario config filename/format be (`scenario.toml`, `scenario.json`, or YAML)?
- Should ruta itself eventually provide a command to materialize dogfooding scenarios, or should this remain a repo-local script?
- How many promoted snapshots should be kept per release or milestone?
