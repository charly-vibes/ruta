# Change: add `/ruta-tutorial` and tighten mode skill scoping

## Why
New users can see several `/ruta-*` commands and packaged skills, but it is not obvious what they should do next in the current mode. The existing mode skills enforce restrictions, yet they do not provide a strong enough "next step" affordance, and there is no single onboarding command that explains the workflow.

## What Changes
- Add a new global command, `/ruta-tutorial`, that explains the workflow in a mode-aware, action-oriented way.
- Make `/ruta-tutorial` show the current mode, its purpose, the commands that are valid right now, what success looks like, and the next likely step.
- Tighten the packaged mode skills so each skill gives narrower guidance about what help is allowed, what to redirect to commands, and how to answer "what should I do now?" questions.
- Update documentation so the tutorial command becomes the default starting point after `/ruta-init`.

## Impact
- Affected specs: `openspec/specs/ruta/spec.md`
- Affected code: `extensions/ruta.ts`, `skills/read/SKILL.md`, `skills/glossary/SKILL.md`, `skills/reimplement/SKILL.md`, `README.md`, and related tests
