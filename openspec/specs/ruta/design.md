# ruta — Specification v0.2

**A pi extension that turns pi into an opinionated harness for the seven-day spec-immersion protocol, by inverting pi's default philosophy of extensibility-as-freedom into extensibility-as-discipline.**

---

## 1. Preamble

### 1.1 Unity statement

ruta is a pi package (extension + skills + prompt commands + theme) that makes it *easier to practice a slow, multi-pass spec-reading discipline than to skip it*. Its value is measured not by how quickly it produces artifacts but by whether, after using it, a user can restate a spec's architecture in their own words without quoting (**Adler's test** — Mortimer Adler's rule that you must be able to state an author's argument in your own words before you have earned the right to criticize it) and predict where an implementing agent will get stuck (the **theory-in-your-head test** — Peter Naur's criterion that genuine understanding of a system means being able to predict how it will behave under conditions the documentation does not cover).

### 1.2 Audience

- A solo developer who has decided to adopt the seven-day spec-immersion protocol from *Reading Specs Like Scripture* and wants friction-reduction for the mechanical parts without friction-reduction for the cognitive parts.
- Not a user who wants AI to read a spec for them. The core value proposition refuses that transaction.

### 1.3 Name

`ruta` is a trimmed form of *chavruta* (חַבְרוּתָא, "partnership"), the Talmudic pair-study practice that is the tool's single best precedent for AI-assisted close reading.

### 1.4 Reading conventions for this document

Requirements use RFC 2119 vocabulary (MUST / MUST NOT / SHOULD / SHOULD NOT / MAY). Each normative requirement is numbered `R-<section>.<counter>` (e.g. R-4.2.1 is the first requirement in §4.2). Known gaps are flagged `GAP-<section>.<counter>`; gaps collected in §13 use the form `GAP-13.<counter>`. Rationale paragraphs explain *why* a requirement exists and are not themselves normative. This spec is itself intended to be legible to the methodology it encodes.

### 1.5 The seven-day spec-immersion protocol (summary)

This summary exists so the spec is legible without prior exposure to *Reading Specs Like Scripture*. It is descriptive, not normative.

- **Day 0 — Silent reading.** Inspectional pass. No AI. Produce a unity sentence and an honest list of "things I don't know."
- **Day 1 — Terms.** Extract load-bearing terms; for each, write the spec's definition, then your own paraphrase, then source passages. Separately: extract numbered normative propositions.
- **Day 2 — Properties and contracts.** Classify the spec's implicit safety/liveness/environmental properties. List interface contracts (who promises what to whom).
- **Day 3 — Virtual reimplementation.** Walk each major section as if writing code; log every decision the spec forces and every silence, ambiguity, or implicit assumption it contains. Do not resolve them.
- **Day 4 — Chavruta.** Paired reading: alternating paraphrase and objection with an AI partner. Unresolved questions (*kushyot*) are preserved, not smoothed over.
- **Day 5 — Perspectives.** Re-read the spec from five fixed stances (security reviewer, operator, downstream consumer, skeptic, junior engineer). Each produces an independent defect log.
- **Day 6 — ACH and premortem.** For each major design decision, run Heuer's Analysis of Competing Hypotheses (ACH) — list plausible hypotheses and the evidence bearing on each. Separately, imagine the system has failed in production and write backward from the failure.
- **Day 7 — Synthesis.** Write the one document you would hand a successor: unity, propositions, contracts, unresolved questions, and the predicted failure modes. Every claim cites the spec.

The protocol's core wager is that comprehension of a spec is *slow* and that speeding it up with fluent AI output produces confident non-understanding (the Rozenblit-Keil illusion of explanatory depth). ruta's modes mirror the days and enforce this wager structurally.

---

## 2. Non-goals

These are things ruta explicitly refuses to do. They are listed first because pi's default philosophy points in the opposite direction and the divergence is load-bearing.

- **R-2.1** ruta MUST NOT summarize spec sections on behalf of the user.
- **R-2.2** ruta MUST NOT draft glossary paraphrases, one-sentence unity statements, proposition lists, contracts tables, gap resolutions, chavruta paraphrases, or the Day 7 synthesis document.
- **R-2.3** ruta MUST NOT expose the load-bearing anti-sycophancy prompts as user-editable markdown templates. Those prompts live in extension source.
- **R-2.4** ruta MUST NOT present progress metrics, streaks, completion percentages, or any gamified surface. The only progress indicator is whether the gate for the next mode is satisfied; this is derived from file content, not from time.
- **R-2.5a** ruta SHOULD NOT be silent about its restrictions.
- **R-2.5b** When a mode disables AI input or blocks a tool, ruta MUST explain why in a one-line notification that links to `/ruta-why`.
- **R-2.6** ruta is not a PDF reader, a code editor, or a project manager. Files live in the user's working directory as plain markdown; ruta reads and structures them, it does not own them.

**Rationale.** Both source documents converge on a single failure mode: fluent AI output that feels like comprehension but isn't. An application built to remove friction from spec-reading will, by default, remove the wrong friction. Non-goals are the structural defense against that drift. If a future contributor proposes adding a "summarize this section" command, this list is the place that argument loses.

---

## 3. Architecture

### 3.1 Substrate

ruta is distributed as a single pi package, published on npm as `@<ns>/pi-ruta`, installable via `pi install npm:@<ns>/pi-ruta`. It is a pure add-on; it MUST NOT fork pi or require patched pi internals.

### 3.2 Package contents

The package bundles four pi primitives:

- **One extension** (`extension/ruta.ts`) containing the mode state machine, commands, shortcuts, tools, event handlers, prompt constants, and UI components. This is the core.
- **A set of skills** (`skills/*.md`) that the extension loads on-demand per mode. Skills provide per-mode tool-facing instructions (e.g. "you are currently in Glossary mode; the only action you may take is the paraphrase-adequacy test").
- **A small number of prompt templates** (`prompts/*.md`) that are *user-facing reference material only* (e.g. a Day 7 synthesis checklist the user reads themselves). These MUST NOT contain the anti-sycophancy system prompts — those live in TypeScript.
- **An optional theme** (`themes/ruta.json`) with muted colors and a fixed-width feel; the methodology benefits from a subdued visual environment.

### 3.3 Project structure in the user's workspace

When a user runs `/ruta-init <spec-file>` in a working directory, ruta scaffolds a project:

```
my-spec-study/
├── spec/                       # the source spec, read-only after init
│   └── <spec-filename>
├── .ruta/
│   ├── ruta.json               # project state (schema §4.2)
│   ├── prompts-version.txt     # pinned hash of the prompts bundle used
│   └── chavruta/*.md           # persistent chavruta logs per session
├── glossary.md                 # Day 1 artifact
├── propositions.md             # Day 1 artifact
├── properties.md               # Day 2 artifact (safety/liveness/env)
├── contracts.md                # Day 2 artifact
├── gaps.md                     # Day 3 artifact (running)
├── perspectives/               # Day 5 artifacts
│   ├── security.md
│   ├── operator.md
│   ├── downstream.md
│   ├── skeptic.md
│   └── junior.md
├── ach/                        # Day 6 artifacts
│   └── <decision-id>.md
├── premortem.md                # Day 6
├── notebook.md                 # ongoing "things I don't know"
└── synthesis.md                # Day 7 deliverable
```

- **R-3.3.1** ruta MUST NOT write to the `spec/` directory after initialization.
- **R-3.3.2** ruta MUST treat all files outside `.ruta/` as co-authored with the user. It reads them freely, edits them only via explicit user commands, and never silently overwrites.
- **R-3.3.3** ruta MUST operate correctly when the user edits any artifact file directly in another editor while ruta is running. State is derived from files, not cached.

### 3.4 State model

Project state is a small JSON document persisted at `.ruta/ruta.json`. In-memory state is a deterministic function of this file plus the contents of the artifact files. See §4.2 for the schema.

---

## 4. File system contracts

### 4.1 General invariants

- **R-4.1.1** Every ruta-owned artifact MUST be plain UTF-8 markdown.
- **R-4.1.2** Every ruta-owned artifact MUST render sensibly when opened in a plain text editor with no ruta-specific tooling.
- **R-4.1.3** Artifact files MUST survive uninstall of the ruta extension: the user retains full value of their reading even if they stop using the tool.

### 4.2 `ruta.json` schema (v0.2)

```json
{
  "schema_version": "0.2",
  "spec_path": "spec/my-spec.md",
  "spec_hash": "sha256:...",
  "spec_hash_canonicalization": "nfc-lf-trim-v1",
  "current_mode": "glossary",
  "unity_sentence": "This spec defines a request-response protocol over bounded frames.",
  "mode_history": [
    { "mode": "read", "entered_at": "2026-04-21T10:00:00Z", "exited_at": "2026-04-21T11:30:00Z" }
  ],
  "gates": {
    "read_unlocked": true,
    "glossary_unlocked": true,
    "reimplement_unlocked": false
  },
  "prompt_bundle_hash": "sha256:..."
}
```

**Field semantics.**

- `unity_sentence` is the user-authored one-sentence restatement produced in `read` mode. `null` until written. Required non-null for the `read` gate to pass.
- `gates` is an open map keyed by `<mode_name>_unlocked`. Missing keys default to `false`. Only gates relevant to currently-known modes are listed; v1/v2 additions extend the map.
- `spec_hash_canonicalization` names the normalization applied before hashing. See R-4.2.2.

**R-4.2.1** `spec_hash` MUST be recomputed every time ruta starts. If it mismatches, ruta MUST warn the user and offer to *reset mode state*, defined as: set `current_mode` to `read`, clear every `gates.*_unlocked` entry to `false`, preserve `unity_sentence` and all artifact files unchanged, and append a `mode_history` entry with `reason: "spec_hash_mismatch"`. The user MAY decline the reset; in that case ruta MUST update `spec_hash` in place and continue, recording the decline in `mode_history`.

**R-4.2.2** Before hashing the spec, ruta MUST apply a documented canonicalization. For v0.2 this is `nfc-lf-trim-v1`: Unicode NFC normalization, CRLF → LF line endings, strip trailing whitespace on every line, remove trailing empty lines at end of file. The canonicalization name is recorded in `spec_hash_canonicalization` so a future ruta version can detect hashes produced under older rules.

*Rationale.* Raw SHA-256 over the file would false-alarm on cosmetic edits (editor trim-on-save, line-ending changes). A normalized hash stays stable across benign changes while still catching semantic ones.

**R-4.2.3** When `.ruta/ruta.json` is absent, malformed, or unreadable but artifact files exist, ruta MUST treat the project as recoverable: on the next `/ruta-status` or session start, ruta offers a reconstruction flow that re-derives `current_mode` and `gates` from artifact presence and shape, prompts the user for a new `unity_sentence` if missing, and recomputes both hashes. ruta MUST NOT silently reconstruct state; the user confirms.

### 4.3 `glossary.md` schema

Each term is a level-2 heading; under it, three labeled blocks (spec definition, user paraphrase, source passages):

```markdown
## Connection

**Spec definition** (§3.1):
> An ordered pair of endpoints, one of which is designated the initiator,
> over which frames are exchanged.

**Your paraphrase:**
A one-way conversation channel between two endpoints where one side starts
and both sides can send messages.

**Source passages:**
- §3.1 para 2 — definition
- §3.4 para 1 — reference
- §6.2 para 3 — example
```

Each source-passage line uses the form `§<ref> — <role>`, where `<role>` is one of the controlled vocabulary `{definition, reference, example, counter-example}`. Free-form annotation after the role is permitted.

- **R-4.3.1** The "Your paraphrase" block MUST NOT be empty before the `glossary_unlocked` gate can be satisfied. *Empty* is defined as zero non-whitespace characters after stripping markdown formatting (bold, italic, code fences, list markers). Placeholder strings with non-whitespace content (e.g., `TODO`, `.`) are technically non-empty and will pass the v0 gate; v1 strengthens this with semantic checks.
- **R-4.3.2** ruta MUST NOT write to the "Your paraphrase" block on behalf of the user. It MAY offer a paraphrase-adequacy test against it (see §6.3).
- **R-4.3.3** When `glossary.md` cannot be parsed into the schema above (missing labeled block, wrong heading level, truncated markdown), ruta MUST display the parse error with file:line context and MUST block forward gate transitions until the file parses. ruta MUST NOT attempt silent repair.

### 4.4 `propositions.md` schema

Numbered list of normative requirements extracted from the spec. Each entry:

```markdown
### P-014

**Text** (§5.2): The initiator MUST send a HELLO frame before any other frame.

**Normative level:** MUST

**Your gloss:** Handshake initiation is mandatory and sequenced.

**Cross-refs:** P-013 (frame definition), P-021 (error on violation)
```

### 4.5 `gaps.md` schema

Running list produced during Virtual Reimplementation mode. Each entry:

```markdown
### G-007

**Citation:** §4.3 para 4
**Decision forced:** What frame size applies to fragmented messages?
**Spec's guidance:** None (the spec discusses frame size only for unfragmented).
**Your proposed resolution:** Treat each fragment as an independent frame subject
  to the 1500-byte limit; aggregate payload across fragments is unlimited.
**Confidence:** low
**Gap type:** likely spec silence (not my ignorance)
**Raised in session:** 2026-04-22-reimpl-section-4
```

### 4.6 Other artifacts

Schemas for `properties.md`, `contracts.md`, `perspectives/*.md`, `ach/*.md`, `premortem.md`, `synthesis.md`, `notebook.md` follow the same pattern: human-first markdown, each entry stamped with source citations, each field nameable. Full schemas deferred to v0.3 (after v1 modes are specified). **GAP-4.6.1.**

---

## 5. Modes

Modes are the central abstraction. Each mode is a state of the extension with:

- A **system prompt** composed at `before_agent_start` time.
- An **enabled tool set** set via `pi.setActiveTools()`.
- A **set of registered mode-scoped commands** (shown in `/help` only while the mode is active).
- A **set of active shortcuts**.
- A **UI configuration** (widgets, status line, editor behavior).
- **Entry preconditions** (gates) and **exit postconditions**.
- An **AI access policy** — one of `disabled`, `narrow`, or `dialog`.

### 5.1 Mode catalog

| Mode | Day | AI access | Primary artifact | v0 scope |
|---|---|---|---|---|
| `read` | 0 | disabled | none | ✓ |
| `glossary` | 1 | narrow | glossary.md | ✓ |
| `propositions` | 1 | narrow | propositions.md | v1 |
| `properties` | 2 | narrow | properties.md | v1 |
| `contracts` | 2 | narrow | contracts.md | v1 |
| `reimplement` | 3 | dialog | gaps.md | ✓ |
| `chavruta` | 4 | dialog | chavruta/*.md | v1 |
| `perspectives` | 5 | dialog | perspectives/*.md | v2 |
| `ach` | 6 | narrow | ach/*.md | v2 |
| `premortem` | 6 | dialog | premortem.md | v2 |
| `synthesize` | 7 | verification-only | synthesis.md | v2 |

- **AI access: disabled** — the editor accepts input but the `input` event handler returns `{ action: "handled" }` and shows a message explaining why no LLM call happened.
- **AI access: narrow** — only mode-specific commands/tools may invoke the LLM; free-form chat is blocked.
- **AI access: dialog** — free-form chat is allowed, with mode-specific system prompt and tool restrictions.
- **AI access: verification-only** — the LLM may only run citation-checking operations on user-authored content.

### 5.2 Mode contract: `read`

**Purpose.** Day 0 silent reading. Adler's inspectional pass + Keshav Pass 1. No AI contact.

**Entry preconditions.** Any (this is the default initial mode after `/ruta-init`).

**Exit postconditions.** Gate `read_unlocked` passes when `notebook.md` contains at least one entry AND `ruta.json.unity_sentence` is non-null and non-empty. (Honor-system lower bound; the gate is cheap to satisfy, the discipline is not.)

**AI access.** `disabled`.

**Tools available.** `read` only (user can grep/search the spec). `bash`, `edit`, `write` disabled.

**Commands registered.**
- `/ruta-note <text>` — append to `notebook.md` with timestamp.
- `/ruta-unity <sentence>` — write/replace the unity sentence in ruta.json.
- `/ruta-done-reading` — attempt to satisfy the gate and offer transition to `glossary`.

**UI.** Status line shows `[read] no AI · {unread sections}/{total}`. Widget above editor: *"Read mode: the AI is not available. This is intentional. See ruta-why."*

**R-5.2.1** When in `read` mode, ruta MUST intercept the `input` event for all non-command text and display a one-line reminder that AI is disabled in this mode, along with the command `/ruta-mode glossary` to transition.

**R-5.2.2** ruta MUST NOT register any tool that invokes the LLM while in `read` mode.

### 5.3 Mode contract: `glossary`

**Purpose.** Day 1 term extraction. Adler Rule 5 ("come to terms"). Force retrieval via paraphrase-adequacy testing.

**Entry preconditions.** `read` mode gate satisfied.

**Exit postconditions.** `glossary.md` has at least one entry with a non-empty "Your paraphrase" block. (v1 will strengthen this to "every important term identified." The v0 gate is deliberately lenient to avoid false precision.)

**AI access.** `narrow`.

**Tools available.** `read`, plus the custom tool `test_paraphrase` (§6.3). Free-form input via editor is blocked; only commands may advance state.

**Commands registered.**
- `/ruta-add-term <term>` — open an editor scaffold for a new glossary entry. The user types the spec definition and their own paraphrase. On save, ruta appends to `glossary.md`.
- `/ruta-test <term>` — invoke the `test_paraphrase` tool on an existing term.
- `/ruta-done-glossary` — attempt to satisfy the gate and offer transition.

**UI.** Status line shows `[glossary] {n_terms} terms · AI: narrow`. Split view: spec on left, current glossary on right.

**R-5.3.1** The `test_paraphrase` tool MUST NOT accept free-form user prompts. Its input is a term name; its internal prompt is fixed in source.

**R-5.3.2** Before ruta runs `test_paraphrase`, it MUST load the "Your paraphrase" block and include it in the LLM call. The LLM response MUST NOT include a rewrite of that paraphrase; the prompt enforces this (§7.2).

### 5.4 Mode contract: `reimplement`

**Purpose.** Day 3 virtual reimplementation. Section-by-section gap-probing. The highest-leverage day of the protocol.

**Entry preconditions.** `glossary` gate satisfied.

**Exit postconditions.** `gaps.md` has at least one entry per major spec section (defined as a level-1 or level-2 heading in the source spec) *within the project's declared scope*. **GAP-5.4.1** — "major section" heuristic may need tuning.

For specs with more than 40 major sections (e.g. large standards documents), the user MAY declare a narrower scope via `/ruta-scope <ref-range>` (e.g. `/ruta-scope §3-§7`). When scope is declared, the gate counts only sections within it. The declared scope is recorded in `.ruta/ruta.json.scope` and displayed in the mode indicator.

**AI access.** `dialog`, with the system prompt from §7.3 (gap-probing, no resolution, quote-passages-required).

**Tools available.** `read`, plus custom tools `gap_probe` (§6.4) and `add_gap` (§6.5).

**Commands registered.**
- `/ruta-probe <section>` — run `gap_probe` on the given section. Output goes into a scratch pane; user triages line-by-line into `gaps.md`.
- `/ruta-add-gap` — open an editor scaffold for a manually-identified gap.
- `/ruta-disagree` — run the "model musical chairs" flow (§8).
- `/ruta-done-reimplement` — attempt to satisfy the gate.

**UI.** Three panes: spec section (left), scratch pane with AI output (center, unless empty), gaps.md tail (right). Mode indicator: `[reimpl §{current}] AI: gap-probe only`.

**R-5.4.1** In `reimplement` mode, the LLM's system prompt MUST include the instructions from §7.3 in full. Handlers MUST NOT allow these instructions to be overridden by user input, prompt templates, or skill commands.

**R-5.4.2** The `gap_probe` tool MUST produce its output in a scratch pane with explicit "accept into gaps.md" / "discard" affordances per line. Direct writes to `gaps.md` from the LLM are forbidden.

### 5.5 Mode contracts: other modes

Full contracts for `propositions`, `properties`, `contracts`, `chavruta`, `perspectives`, `ach`, `premortem`, and `synthesize` follow the same template. **GAP-5.5.1** — deferred to v1/v2 design docs. Key invariants that apply across all of them:

- **R-5.5.1** Every mode MUST have an explicit AI access policy, enforced at the `input` and `tool_call` events, not merely documented.
- **R-5.5.2** Every mode's system prompt MUST forbid agreement language ("you're right," "great point") and MUST require quoted passages as evidence for claims about the spec.
- **R-5.5.3** Every mode MUST name the gate(s) it satisfies on completion and ruta MUST update `ruta.json` accordingly.

### 5.6 Mode transitions

Modes form a directed graph. The forward topology mirrors the seven-day protocol; backward transitions are unconditional and exist to let the user return to an earlier mode when a missing term, gap, or misunderstanding surfaces later.

**Forward edges (require gate satisfaction):**

```
read ──▶ glossary
glossary ──▶ propositions
glossary ──▶ properties
glossary ──▶ reimplement
properties ──▶ contracts
propositions ──▶ reimplement
contracts ──▶ reimplement
reimplement ──▶ chavruta
chavruta ──▶ perspectives
perspectives ──▶ ach
perspectives ──▶ premortem
ach ──▶ synthesize
premortem ──▶ synthesize
```

In v0 only `read ──▶ glossary ──▶ reimplement` is implemented; other forward edges are reserved for v1/v2 modes.

**Backward edges:** from any mode, a user MAY transition to any earlier mode (ordered by day). Artifacts are preserved on backward transition; gates remain satisfied once achieved (re-entering `glossary` does not invalidate `read_unlocked`).

- **R-5.6.1** Mode transitions MUST be explicit user commands. ruta MUST NOT transition automatically.
- **R-5.6.2** When a forward transition is attempted and the gate is not satisfied, ruta MUST name the specific unsatisfied condition and MUST NOT silently unlock the next mode.
- **R-5.6.3** Backward transitions MUST preserve all artifact contents and all previously-satisfied gates. A subsequent forward transition to the same mode does not re-run gate checks against artifacts that already satisfied them.

---

## 6. Tools and commands

### 6.1 Naming conventions

- User-facing commands: `/ruta-<verb>` (`/ruta-init`, `/ruta-mode`, `/ruta-note`, …).
- Mode-scoped commands: same prefix; only registered while the mode is active.
- LLM-callable tools (registered via `pi.registerTool`): `ruta_<snake_case>` (`ruta_test_paraphrase`, `ruta_gap_probe`).

### 6.2 Global commands

- `/ruta-init <spec-path>` — initialize a project in the current cwd.
- `/ruta-mode [<mode>]` — show current mode or request a transition.
- `/ruta-status` — print current mode, gates, artifact summary.
- `/ruta-why` — explain why the current mode restricts what it does (links to sources).
- `/ruta-disagree` — re-run the last LLM turn against a second model (§8).
- `/ruta-relocate <new-spec-path>` — update `spec_path` when the spec file has been moved or renamed. Recomputes `spec_hash`; triggers R-4.2.1 if the canonicalized content differs.

### 6.3 Tool: `ruta_test_paraphrase`

Input: `{ term: string }`. The tool reads the term from `glossary.md`, constructs a prompt that asks the LLM to produce one sentence using the term in natural spec context *without restating the paraphrase*, and returns that sentence to the user. The user then self-judges: does their paraphrase let them parse this sentence correctly? If not, the paraphrase is deficient.

**UX flow.** The tool's output appears in a scratch pane with two affordances: `[r] Revise paraphrase` (opens `glossary.md` at the term's heading) and `[d] Dismiss` (closes the pane). No test-history log is retained by default; the tool is stateless by design — each run is a fresh probe.

- **R-6.3.1** The tool MUST NOT return a revised paraphrase. The LLM is instructed not to produce one; the tool post-filters to strip any attempt.
- **R-6.3.2** The tool's output pane MUST NOT auto-edit `glossary.md`. All changes to the paraphrase happen through the user's editor.

### 6.4 Tool: `ruta_gap_probe`

Input: `{ section_ref: string }` (e.g. `"§4.3"` or a heading name). The tool loads the referenced section, runs the prompt from §7.3, and returns a structured list of (a) decisions an implementer would face, (b) apparent silences, (c) ambiguities admitting multiple text-consistent implementations, (d) implicit environmental assumptions.

- **R-6.4.1** The tool MUST NOT propose resolutions. The prompt forbids them.
- **R-6.4.2** Output MUST be delivered to a scratch pane, not `gaps.md`. User triage is mandatory.

### 6.5 Tool: `ruta_add_gap`

Input: structured fields matching the `gaps.md` schema, plus a `triage_token: string`. The tool appends to the file. This exists so the LLM can, *when explicitly invoked by user command after user review*, add an entry on the user's behalf — keeping the friction of typing low while keeping the human decision in the loop.

**Enforcement.** The tool's availability is gated by two independent mechanisms:

1. `pi.setActiveTools()` excludes `ruta_add_gap` from the active tool set during free-form chat turns. It is added to the active set only while the triage UI (spawned by `/ruta-probe` output review) is in focus.
2. The tool handler verifies the `triage_token` parameter matches a per-session nonce generated by the triage UI at pane-open time. A token missing, expired, or not matching the current nonce causes the call to fail with an explanatory error.

Either mechanism alone is sufficient to block the intended misuse; both are required because pi's active-tools enforcement is advisory to the agent loop and the token check is authoritative at the handler.

- **R-6.5.1** `ruta_add_gap` MUST NOT succeed outside the triage UI. Both the `pi.setActiveTools` scoping and the `triage_token` check MUST be implemented; a call that passes one but not the other MUST be refused.
- **R-6.5.2** Triage tokens MUST NOT outlive the triage pane that issued them. Closing the pane invalidates the token.

---

## 7. Prompts

**Prompts are code.** They live in `extension/prompts.ts` as string constants, not in user-editable markdown templates. Rationale in §2.

### 7.1 Base system prompt fragment (applied in every mode)

```
You are a strict reading partner, not a teacher and not an assistant.
Rules:
- Do not say "you're right," "great point," "exactly," or equivalent.
- State only claims that the spec text directly supports. For every claim
  about the spec, include a quoted passage with its section reference.
- If you are uncertain, say so. Do not resolve ambiguity by invention.
- If you detect that your previous answer was wrong, correct it explicitly.
- Never write the user's paraphrases, summaries, syntheses, or resolutions
  for them. If asked, refuse and explain why.
```

- **R-7.1.1** This fragment MUST be prepended to every mode-specific system prompt by ruta's own `before_agent_start` handler.
- **R-7.1.2** Within ruta's own handler chain, the fragment MUST NOT be overridable from user input, skills, or templates. A skill or template that attempts to null or replace it MUST be refused.
- **R-7.1.3** ruta MUST detect known patterns of external override — other installed extensions that replace the system prompt in their own `before_agent_start` handlers — and MUST warn on session start when detected. Full prevention of external override is not achievable in an extensible system (see GAP-13.4); detection-and-warn is the designed defense. The list of known-dangerous patterns ships with the package and is versioned with the prompt bundle.
- **R-7.1.4** The fragment's wording is English-only in v0. When the spec under study is not in English, the guardrails against agreement language still apply (the LLM's *response* is in English), but the blocklist may have lower recall. This is documented as a known limitation, not a defect.

### 7.2 Paraphrase-adequacy prompt (Glossary mode)

```
The user is studying a spec and has written the following paraphrase of a term:

TERM: {term}
SPEC DEFINITION: {spec_definition}
USER'S PARAPHRASE: {user_paraphrase}

Your task: produce ONE natural sentence that uses {term} as it would be used
in the spec. Do not quote the spec definition verbatim. Do not restate or
rewrite the user's paraphrase. Do not evaluate the paraphrase.

The sentence you produce will be read by the user, who will ask themselves:
"Can my paraphrase parse this sentence correctly?"
```

### 7.3 Gap-probing prompt (Reimplement mode)

```
The user is virtually re-implementing a spec section. Your task:

SECTION TEXT:
{section_text}

Produce four lists, in this order:

1. DECISIONS: Every decision an implementer would be forced to make while
   writing code for this section. One decision per line, neutral phrasing.

2. SILENCES: Every place the section does not tell the implementer what
   to do. Quote the adjacent spec text in each entry.

3. AMBIGUITIES: Every place the section's text admits two or more
   implementations that are both text-consistent but would fail to interoperate.
   Give both candidate implementations for each ambiguity.

4. IMPLICIT ASSUMPTIONS: Every place the section relies on an unstated
   environmental assumption (clock behavior, trust model, concurrency,
   memory semantics, etc.).

Hard rules:
- Do NOT propose resolutions to any of the above.
- Do NOT smooth over a silence by inferring what the author "probably meant."
- If you cannot find items in a category, write "none identified" and
  explain why you looked.
- Quote the spec where you cite it.
```

### 7.4 Kushya prompt (Chavruta mode, v1)

Deferred. **GAP-7.4.1.**

### 7.5 Perspective prompts (Perspectives mode, v2)

Deferred. **GAP-7.5.1** — five prompts needed, each locked to a persona.

### 7.6 Prompt integrity

- **R-7.6.1** The package MUST ship a `prompts-version.txt` file containing the SHA-256 hash of the serialized prompt constants. `ruta.json` records which hash was active when the user started the project. If the installed prompt hash no longer matches the project's recorded hash, ruta MUST warn on startup.

*Rationale.* This catches the case where a user upgrades ruta mid-project and the anti-sycophancy prompts have changed. It is also a defense against "helpful" local modifications that erode guardrails.

---

## 8. Multi-model dispatch

pi already supports multiple providers natively. ruta leverages this for Osmani's "model musical chairs."

### 8.1 The `disagree` operation

When the user runs `/ruta-disagree` after an LLM turn, ruta:

1. Takes the last user-authored prompt-or-command and the last assistant response from the current session.
2. Identifies a secondary model from the user's pi configuration, preferring a different provider family than the primary (configurable via `settings.json` key `ruta.secondary_model`).
3. Dispatches the same prompt (with the same system prompt fragment from §7.1) to the secondary model.
4. Presents both responses side-by-side in a diff-oriented view, highlighting divergent claims.

- **R-8.1.1** ruta MUST NOT automatically resolve disagreements. The user reads both and decides.
- **R-8.1.2** When primary and secondary disagree on a factual claim about the spec, ruta MUST suggest running `ruta_gap_probe` on the relevant section — disagreement between models often flags an ambiguity in the spec itself.
- **R-8.1.3** When primary and secondary agree, ruta MUST display the responses with a one-line reminder that agreement between models is not evidence of spec clarity: two models trained on overlapping data can share the same confident error. Agreement is weaker signal than disagreement; the reminder exists so the user does not treat `/ruta-disagree` as a validation oracle.

### 8.2 Configuration

```json
// ~/.pi/settings.json excerpt
{
  "ruta": {
    "secondary_model": "openai/gpt-5",
    "primary_provider_hint": "anthropic"
  }
}
```

**GAP-8.2.1** — behavior when the user only has one configured provider: fall back to same-provider, different-model? Or disable `/ruta-disagree` with an informative message? Current design: disable, explain.

---

## 9. Session tree usage

pi's tree-structured session storage is used non-trivially. Each mode has its own conventions.

### 9.1 Chavruta mode (v1)

Each paragraph-pair (user paraphrase + AI objection, or AI paraphrase + user objection) is a session entry. Each unresolved kushya becomes a labeled branch (via `pi.setLabel()`) so the user can navigate back.

At session end, ruta appends a persistent log to `.ruta/chavruta/<session-id>.md`. The log's content is *deterministically extracted*, not summarized: ruta walks session entries and copies user-labeled kushyot (entries marked with `/ruta-kushya` during the session) verbatim, along with their timestamps and branch labels. ruta MUST NOT paraphrase, condense, or re-word kushya content when writing the log — this would violate R-2.2. The log is a transcript filter, not a summary.

### 9.2 Perspectives mode (v2)

Each of the five personas is a forked session (`ctx.fork()`), rooted at a common point-of-entry. The user tabs between them via `/ruta-perspective <name>`. Each perspective writes its defect log independently. A final aggregation mode opens a new session that loads all five logs.

### 9.3 Reimplement mode (v0)

Each spec section is treated as a conceptual unit but not forked. The session stays linear; `gaps.md` is the durable output. The session log is useful only for post-hoc inspection of how a gap was identified.

### 9.4 Navigation

- **R-9.4.1** ruta MUST provide `/ruta-jump <anchor>` for navigating to any labeled entry (a kushya, a gap, a section-review).
- **R-9.4.2** Labels MUST follow the convention `ruta:<mode>:<kind>:<id>` so that a user running plain `/tree` sees organized navigation targets.

---

## 10. Extension API usage map

This section maps each pi API to the ruta feature that uses it. It is normative in the sense that it documents the dependency surface; changes to these pi APIs require corresponding ruta changes.

The authoritative reference for pi's extension API is the `@mariozechner/pi-coding-agent` TypeScript type definitions shipped with pi. Semantics summarized below are intended to match that reference; on any conflict the reference wins and ruta's spec is the document that needs updating.

| pi API | ruta usage |
|---|---|
| `pi.on("session_start")` | Load `.ruta/ruta.json`, verify spec hash, configure mode |
| `pi.on("before_agent_start")` | Compose and inject system prompt per mode (§7) |
| `pi.on("input")` | Enforce mode AI-access policy; block in `read` and `narrow` modes |
| `pi.on("context")` | Inject persistent chavruta log (v1), strip disallowed content |
| `pi.on("tool_call")` | Gate tool use per mode; block built-in tools when mode disables them |
| `pi.on("session_shutdown")` | Persist state, flush logs |
| `pi.registerCommand` | All `/ruta-*` commands |
| `pi.registerTool` | `ruta_test_paraphrase`, `ruta_gap_probe`, `ruta_add_gap`, and mode-specific additions |
| `pi.setActiveTools` | Restrict built-in tool set per mode |
| `pi.appendEntry` | Persist ruta state changes as session-custom entries |
| `pi.setLabel` | Label kushyot, gaps, perspective branches |
| `pi.registerShortcut` | Mode-specific keybindings (e.g. `Ctrl+G` to add a gap in reimplement mode) |
| `ctx.newSession` / `ctx.fork` | Perspective branches; mode isolation |
| `ctx.navigateTree` | `/ruta-jump` implementation |
| `ctx.ui.setWidget` | Mode indicator above editor |
| `ctx.ui.setStatus` | Footer status (mode, gate progress) |
| `ctx.ui.custom` | Gap triage UI, disagree diff view, perspective aggregation view |
| `pi.sendMessage` / `sendUserMessage` | Inject canonical prompts (as command-triggered, not free-form) |
| `pi.events` | Internal state-machine events across ruta's own handlers |

---

## 11. Implementation plan

### 11.1 v0 scope (first release)

Covers Days 0–3, which is where discipline either takes hold or doesn't.

- `read`, `glossary`, `reimplement` modes
- `/ruta-init`, `/ruta-mode`, `/ruta-status`, `/ruta-why`, `/ruta-note`, `/ruta-unity`, `/ruta-add-term`, `/ruta-test`, `/ruta-probe`, `/ruta-add-gap`, `/ruta-done-*`
- Tools `ruta_test_paraphrase`, `ruta_gap_probe`, `ruta_add_gap`
- Base system prompt (§7.1), paraphrase-adequacy prompt (§7.2), gap-probing prompt (§7.3)
- Multi-model dispatch `/ruta-disagree` (§8)
- File scaffolding for all v0 artifacts; schemas for later artifacts may be stubs
- Tree labels (§9.4)

### 11.2 v1 scope

- `propositions`, `properties`, `contracts`, `chavruta` modes
- Kushya/teirutz prompts (§7.4)
- Persistent chavruta log injection via `on("context")`
- Strengthen `glossary` exit gate

### 11.3 v2 scope

- `perspectives`, `ach`, `premortem`, `synthesize` modes
- Forked-session perspective UI
- Citation-verification engine for synthesis mode
- Aggregation views

### 11.4 Dogfooding

- **R-11.4.1** The repository MUST track dogfooding scenario definitions under `dogfooding/scenarios/<scenario>/`, including the input fixtures needed to materialize a workspace without relying on chat history or shell-local state.
- **R-11.4.2** Dogfooding workspaces materialized for ordinary development or debugging MUST live under `dogfooding/runs/<scenario>/<commit>/` (or an equivalent revision-keyed path) and MUST be treated as ephemeral by default.
- **R-11.4.3** Before each release, ruta MUST be used (by the maintainer, on a real spec) to complete at least the scope of that release. The resulting artifacts MUST be promoted into a tracked snapshot under `dogfooding/snapshots/<scenario>/<release-or-milestone>/` so that the claim is externally auditable. A release whose required promoted snapshot is missing or empty MUST NOT be published.
- **R-11.4.4** ruta's own spec (this document, in later versions) is a valid dogfooding target.

---

## 12. Evaluation

### 12.1 Acceptance criteria for v0

- A user can run `pi install npm:@<ns>/pi-ruta`, then `/ruta-init examples/specs/example.md`, then complete Days 0–3 of the protocol, producing non-empty `notebook.md`, `glossary.md`, and `gaps.md` files.
- Without ruta, the same user attempting the same protocol on the same spec would produce a qualitatively similar output — i.e. ruta is not generating content.
- After completing Day 3 with ruta, the user can restate the spec's major architectural choices in their own words (the Adlerian test).
- ruta refuses correctly in all of these probes: "summarize section 4," "write my paraphrase for 'frame'," "draft the gaps list for me," "just tell me if this spec makes sense."

### 12.2 Non-metrics

- Time to completion. Speeding this up is an anti-goal.
- Number of artifacts produced per hour. Same.
- User self-reported confidence. This is the Rozenblit-Keil failure mode; confidence is not correlated with comprehension.

### 12.3 Regression surface

- **R-12.3.1** The anti-sycophancy prompt fragment (§7.1) MUST have an automated test verifying its presence in the system prompt at every mode transition.
- **R-12.3.2** The `read` mode AI-disabled behavior MUST have an automated test: attempt to send a message; assert no LLM call was made.

---

## 13. Known gaps and open questions

Collected from inline `GAP-N` tags plus additional items.

- **GAP-4.6.1** Schemas for v1 and v2 artifacts are stubs.
- **GAP-5.4.1** "Major section" detection heuristic for the Reimplement gate is underspecified.
- **GAP-5.5.1** Full contracts for modes beyond v0 are deferred.
- **GAP-7.4.1** Kushya prompt not yet drafted.
- **GAP-7.5.1** Five perspective prompts not yet drafted.
- **GAP-8.2.1** Fallback for single-provider users: confirmed as "disable with explanation" but unverified in practice.
- **GAP-13.1** PDF specs. Many real-world specs are PDF, not markdown. pi's bash tool can invoke `pdftotext`, but the reading experience degrades. Options: (a) v0 is markdown-only and documents this; (b) v0 auto-converts on init and preserves page-number citations; (c) v0 punts. Current position: (a) for v0, revisit.
- **GAP-13.2** Multi-file specs (e.g. an RFC that references five other RFCs). Scope and gate semantics become ambiguous. Current position: v0 handles one spec file; v1 considers syntopical mode.
- **GAP-13.3** Collaborative use (two users, one spec). Out of scope for v0. The artifacts are git-friendly, so shared-repo collaboration works at the file layer; live coordination is not supported.
- **GAP-13.4** Extension override risk. A user may install another pi extension that strips ruta's anti-sycophancy prompt. Mitigation layers are enumerated in §15.2; detection-and-warn is implemented per R-7.1.3. Full prevention is impossible in an extensible system; this gap remains open as an acknowledged residual risk rather than an unresolved design question.
- **GAP-13.5** Compaction interaction with chavruta logs. pi's compaction could summarize away chavruta history. The log is persisted in files, not only in session, so this is recoverable, but the in-session continuity breaks. Needs explicit `session_before_compact` handler to exclude chavruta turns from compaction scope (v1).
- **GAP-13.6** The name `ruta`. Namespace collision check on npm pending.
- **GAP-13.7** Non-English specs. v0 prompts and anti-sycophancy blocklist are English-only (R-7.1.4). Coverage for spec contents in other languages works (the spec is quoted verbatim into prompts), but the LLM's guardrails have lower recall outside English. Full multilingual prompt set deferred.
- **GAP-13.8** Scope-selection heuristics for large specs (§5.4 `/ruta-scope`). v0.2 defines the command but leaves the user to pick ranges manually. v1 could propose scopes based on spec structure (e.g. "the five sections most cross-referenced by others").
- **GAP-13.9** Concurrent-session advisory (R-15.3.1) is a warning, not a guarantee. File-locking via `flock(2)` or equivalent is deferred; the risk surface is limited because ruta's writes are artifact-level and user-triggered.

---

## 13.1 Changelog

**v0.2** (this revision) — Rule-of-5 review response. Changes from v0.1:

- Added §1.5 summarizing the seven-day protocol in-document.
- Added `unity_sentence`, `spec_hash_canonicalization` to the `ruta.json` schema; defined `reset mode state` (R-4.2.1) and canonicalization (R-4.2.2); added recovery-from-missing-ruta.json flow (R-4.2.3).
- Added malformed-artifact handling (R-4.3.3) and empty-paraphrase definition (R-4.3.1).
- Added explicit forward-edge and backward-edge topology in §5.6 with R-5.6.3 preservation rule.
- Added `/ruta-relocate` (§6.2) and `/ruta-scope` (§5.4) commands.
- Specified `ruta_test_paraphrase` UX flow (§6.3) and added R-6.3.2.
- Specified `ruta_add_gap` enforcement via both `setActiveTools` scoping and `triage_token` check (R-6.5.1, R-6.5.2).
- Reconciled R-7.1.2 with GAP-13.4: added R-7.1.3 (external-override detection), R-7.1.4 (English-only limitation).
- Added R-8.1.3 covering model-agreement case.
- Fixed §9.1 chavruta-log "summarizes" ambiguity: log is now a deterministic transcript filter, not a summary.
- Split R-2.5 into R-2.5a and R-2.5b.
- Added §15.1.4 first-run network-disclosure notice; added §15.2 consolidated prompt-integrity threat model; added §15.3 concurrent-access advisory.
- Expanded §16 glossary with ACH, premortem, Rozenblit-Keil, Adler's test, theory-in-your-head test; expanded pardes sub-definitions.
- Reworked §11.4 dogfooding around tracked scenarios, ephemeral commit-aware runs, and promoted snapshots under `dogfooding/scenarios/`, `dogfooding/runs/`, and `dogfooding/snapshots/`.
- Documented pi API reference authority in §10.
- Fixed Appendix A import / helper stub inconsistency.
- Documented GAP numbering convention in §1.4.

---

## 14. Out of scope (v0 and v1)

- Windows-specific handling beyond what pi already provides.
- Mobile interfaces.
- Non-markdown spec ingestion (see GAP-13.1).
- Multi-spec syntopical mode (see GAP-13.2).
- Live collaboration (see GAP-13.3).
- An IDE plugin. ruta is terminal-only by design; the methodology benefits from a subdued visual environment and pi's TUI provides it.
- Export to other formats (docx, PDF). Artifacts are markdown; users who want other formats run pandoc themselves.
- Analytics, telemetry, cloud sync. None of these exist, none are planned.

---

## 15. Security and trust

### 15.1 Network and filesystem

- **R-15.1.1** ruta MUST NOT send spec contents to any endpoint other than the user's configured LLM provider(s). There is no ruta-operated backend.
- **R-15.1.2** ruta MUST NOT write to paths outside the project's working directory without explicit user confirmation.
- **R-15.1.3** ruta MUST inherit pi's trust model. Installing ruta is installing TypeScript that will run on the user's machine with user privileges; the user is expected to review source before installing, as with any pi package.
- **R-15.1.4** On first run of `/ruta-init` in a project, ruta MUST display a one-time notice stating that spec contents will be transmitted to the configured LLM provider(s) in the course of normal tool use (paraphrase tests, gap probes, chavruta turns), and that ruta cannot control provider-side retention, logging, or training use of that content. The notice MUST be dismissible but MUST NOT be suppressible by default. A confirmed-read flag is stored in `.ruta/ruta.json.disclosure_ack`.

### 15.2 Prompt integrity threat model

This section consolidates defenses scattered across R-7.1.1–R-7.1.4, R-7.6.1, §12.3.1, and GAP-13.4. The threat is: a configuration, skill, template, or co-installed extension that neutralizes the anti-sycophancy fragment (§7.1), causing ruta to appear to be working while the guardrail that gives it its value is gone.

**Layered defenses.**

1. **Source-only prompts** (§7, R-2.3): The fragment lives in TypeScript, not markdown. It cannot be edited by changing a user-visible file.
2. **Handler-chain integrity** (R-7.1.1, R-7.1.2): ruta prepends the fragment in its own `before_agent_start` handler and refuses in-handler-chain overrides from skills or templates.
3. **External-override detection** (R-7.1.3): ruta scans known-dangerous extensions on session start and warns. Not a guarantee (GAP-13.4).
4. **Prompt-bundle hash pinning** (R-7.6.1): A project records which prompt bundle hash it was started under. A local modification or upgrade that changes the prompts triggers a warning on next session.
5. **Automated presence test** (R-12.3.1): CI verifies the fragment is in the composed system prompt at every mode transition.

**Residual risk.** A sufficiently motivated user can disable any layer. The design goal is that the user must do so *deliberately* — each layer catches a different class of accidental or silent erosion.

### 15.3 Concurrent access

- **R-15.3.1** ruta is designed for a single user in a single working directory, with possibly multiple pi sessions open. When a second session starts in a directory with an existing `.ruta/ruta.json`, ruta MUST show a one-line advisory warning that concurrent writes may cause last-writer-wins on state. Full file-locking is not implemented in v0.
- **R-15.3.2** Multi-user collaboration on the same working directory is out of scope (GAP-13.3).

---

## 16. Glossary (for readers of this spec)

- **pi** — the minimal terminal coding harness at [pi.dev](https://pi.dev), on which ruta is built as an extension package.
- **Mode** — a state of the ruta extension with its own system prompt, enabled tools, AI-access policy, registered commands, and UI configuration.
- **Gate** — a boolean condition derived from artifact file content (or, for `read_unlocked`, from `ruta.json.unity_sentence`), required to transition forward between modes.
- **Artifact** — a user-authored markdown file that ruta reads and structures but does not write without explicit command. The work product of the methodology.
- **ACH** — Analysis of Competing Hypotheses, Richards Heuer's structured analytic technique. For each important inference, list plausible hypotheses and tabulate the evidence bearing on each. In ruta, a Day 6 artifact per major design decision in the spec.
- **Premortem** — Gary Klein's technique of imagining that a project has failed and writing backward to diagnose why. In ruta, a Day 6 artifact listing predicted failure modes of a system built from the spec as written.
- **Kushya** — Talmudic term for a textual objection raised against a proposed reading. In ruta, an unresolved question about the spec.
- **Teirutz** — proposed resolution of a kushya. ruta records kushyot unresolved by design; users produce teirutzin.
- **Chavruta** — pair-study practice. In ruta, the user-plus-AI partnership constrained to alternating paraphrase and objection.
- **Pardes** — four-level reading framework adapted to spec reading:
    - *Peshat* — the literal text: what the spec actually says.
    - *Remez* — implied meaning: what the text hints at but does not state.
    - *Drash* — analogical reading: what this spec resembles in other systems.
    - *Sod* — architectural reading: the deep structure the other three depend on.
- **Adler's test** — Mortimer Adler's criterion that you must be able to restate an author's argument in your own words before earning the right to criticize it.
- **Theory-in-your-head test** — Peter Naur's criterion that understanding a system means being able to predict behavior under conditions not documented.
- **Rozenblit-Keil illusion** — the finding that people consistently overestimate their understanding of mechanisms they cannot actually explain. The methodology's central failure mode.
- **Anti-sycophancy prompt fragment** — the §7.1 base prompt that every mode inherits. Its integrity is load-bearing; see R-7.1.1, R-7.1.2, R-7.1.3, R-7.6.1.

---

## Appendix A — A minimal extension skeleton

This is illustrative, not normative. The actual v0 extension will be substantially longer.

The package itself is published as `@<ns>/pi-ruta` (§3.1); it imports pi's extension API from `@mariozechner/pi-coding-agent`, which is pi's own package. Namespace resolution for the `<ns>` placeholder is GAP-13.6.

Helper stubs referenced below:
- `loadProject(cwd)` — read and validate `.ruta/ruta.json`; returns `null` if absent.
- `saveProject(project)` — persist project state atomically.
- `currentMode(project)` — returns the mode descriptor (system-prompt fragment, AI access policy, tool set) for `project.current_mode`.
- `describeAccess(project)` — renders the current mode's AI access policy as a short string (`"no AI"`, `"AI: narrow"`, `"AI: dialog"`, `"AI: verify-only"`).

```typescript
// extension/ruta.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { loadProject, saveProject, currentMode, describeAccess } from "./state";
import { BASE_PROMPT, GLOSSARY_PARAPHRASE, REIMPL_GAP_PROBE } from "./prompts";

export default function ruta(pi: ExtensionAPI) {
  let project = null;

  pi.on("session_start", async (_e, ctx) => {
    project = await loadProject(ctx.cwd);
    if (!project) return;
    ctx.ui.setWidget("ruta-mode", [
      `[ruta] ${project.current_mode} mode · ${describeAccess(project)}`,
    ]);
  });

  pi.on("input", async (event, ctx) => {
    if (!project) return { action: "continue" };
    const mode = currentMode(project);
    if (mode.aiAccess === "disabled" && !event.text.startsWith("/")) {
      ctx.ui.notify(
        "AI is disabled in read mode. Use /ruta-why to see why, or /ruta-mode glossary to advance.",
        "info",
      );
      return { action: "handled" };
    }
    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (!project) return;
    const mode = currentMode(project);
    return {
      systemPrompt: BASE_PROMPT + "\n\n" + mode.systemPromptFragment(event.systemPrompt),
    };
  });

  pi.registerCommand("ruta-init", {
    description: "Initialize a ruta project in the current directory",
    handler: async (args, ctx) => {
      // …
    },
  });

  pi.registerCommand("ruta-mode", {
    description: "Show or change the current ruta mode",
    handler: async (args, ctx) => {
      // … gate check, transition, persist
    },
  });

  pi.registerTool({
    name: "ruta_test_paraphrase",
    label: "Test paraphrase",
    description:
      "Test whether the user's paraphrase of a glossary term is strong enough to parse a natural sentence using that term. Does NOT rewrite the paraphrase.",
    parameters: Type.Object({ term: Type.String() }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      // build prompt from GLOSSARY_PARAPHRASE with glossary lookup, call LLM, post-filter
      return { content: [{ type: "text", text: "…" }], details: {} };
    },
  });

  // …more commands, tools, shortcuts
}
```

---

*End of ruta spec v0.2.*
