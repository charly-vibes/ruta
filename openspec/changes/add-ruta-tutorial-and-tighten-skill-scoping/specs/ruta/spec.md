## ADDED Requirements

### Requirement: Mode-aware tutorial guidance
The system SHALL provide a `/ruta-tutorial` command that explains the current workflow in a concise, action-oriented form without weakening mode restrictions.

#### Scenario: Tutorial explains the current mode
- **WHEN** a user runs `/ruta-tutorial` inside an initialized ruta project
- **THEN** ruta shows the current mode and that mode's purpose
- **AND** ruta lists the commands that are appropriate in that mode
- **AND** ruta explains what artifact or gate the user is trying to complete next

#### Scenario: Tutorial provides a next action
- **WHEN** a user runs `/ruta-tutorial` and the current mode has an obvious next step
- **THEN** ruta includes a recommended next action
- **AND** that action is expressed as a concrete ruta command or artifact update
- **AND** the tutorial does not provide prohibited substantive help for the spec itself

#### Scenario: Tutorial works before initialization
- **WHEN** a user runs `/ruta-tutorial` outside an initialized ruta project
- **THEN** ruta explains what ruta is for
- **AND** it shows how to begin with `/ruta-init <spec-path>`

### Requirement: Mode skills are action-scoped
The system SHALL scope its packaged mode skills so that each skill clearly limits allowed help and redirects the user toward the commands and artifacts that are valid in that mode.

#### Scenario: Read skill redirects to workflow actions only
- **WHEN** the user asks for help while ruta is in read mode
- **THEN** the read-mode skill limits help to workflow guidance
- **AND** it redirects the user to commands such as `/ruta-note`, `/ruta-unity`, `/ruta-done-reading`, `/ruta-why`, and `/ruta-tutorial`
- **AND** it does not summarize or explain the spec

#### Scenario: Glossary skill scopes help to paraphrase testing
- **WHEN** the user asks for help while ruta is in glossary mode
- **THEN** the glossary-mode skill limits help to command-level workflow guidance and paraphrase adequacy testing
- **AND** it redirects the user to commands such as `/ruta-add-term`, `/ruta-test`, `/ruta-done-glossary`, and `/ruta-tutorial`
- **AND** it does not draft glossary content for the user

#### Scenario: Reimplement skill scopes help to gap discovery
- **WHEN** the user asks for help while ruta is in reimplement mode
- **THEN** the reimplement-mode skill limits help to command-level workflow guidance and ambiguity surfacing
- **AND** it redirects the user to commands such as `/ruta-probe`, `/ruta-add-gap`, `/ruta-done-reimplement`, and `/ruta-tutorial`
- **AND** it does not resolve ambiguities or draft the final artifact for the user
