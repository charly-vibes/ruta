## 1. Specification
- [x] 1.1 Add OpenSpec requirements for repository layout and artifact ownership.
- [x] 1.2 Add OpenSpec requirements for configurable dogfooding scenarios, ephemeral runs, and promoted snapshots.
- [x] 1.3 Validate the proposal with `openspec validate --strict`.

## 2. Repository restructuring
- [x] 2.1 Create the target directory structure for examples, dogfooding scenarios, runs, and snapshots.
- [x] 2.2 Move root-level ruta workspace artifacts into the new structure.
- [x] 2.3 Move or rename source spec fixtures to reflect their role clearly.
- [x] 2.4 Update `.gitignore` so transient runtime workspaces stay out of the root and out of git.

## 3. Documentation and tooling
- [x] 3.1 Update `README.md` to explain the new repository layout and artifact policy.
- [x] 3.2 Add a minimal scenario configuration format and at least one tracked dogfooding scenario.
- [x] 3.3 Add or update helper tooling so a dogfooding workspace can be materialized for the current commit in a commit-aware run directory.
- [x] 3.4 Run `npm run check` and confirm the updated paths still work.
