# Change: restructure repo layout and dogfooding

## Why
The repository currently mixes package source, canonical documentation/spec content, and ruta-generated workspace artifacts at the root. That makes ownership unclear, increases noise, and makes it hard to distinguish committed evidence from transient runtime output.

Dogfooding also needs a better model than a single static committed workspace. We need configurable dogfooding scenarios that can be materialized from different commits without polluting the root or conflating source fixtures with runtime state.

## What Changes
- Define a repository layout that separates package source, canonical specs/examples, and generated dogfooding workspaces.
- Introduce OpenSpec-tracked requirements for artifact ownership and placement.
- Define configurable dogfooding scenarios with tracked inputs/config and ephemeral commit-scoped runs.
- Define how auditable release snapshots are promoted and stored separately from ad hoc runs.
- Clarify which ruta-generated artifacts are committed fixtures versus ignored runtime output.

## Impact
- Affected specs: `repo-layout`, `dogfooding-workspaces`
- Affected code: repository structure, README, `.gitignore`, dogfooding fixtures/config, and any helper scripts or commands added to materialize runs
