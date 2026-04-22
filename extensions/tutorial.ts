import type { RutaProjectState, RutaMode } from './state.ts';

interface ModeTutorial {
  purpose: string;
  commands: string[];
  success: string;
  nextAction: string;
}

function modeTutorial(state: RutaProjectState): ModeTutorial {
  const mode = state.current_mode;
  if (mode === 'read') {
    return {
      purpose: 'Read the spec yourself, collect ignorance, and state the document\'s unity in your own words.',
      commands: [
        '/ruta-note <text> — add an observation or open question to notebook.md',
        '/ruta-unity <sentence> — save your unity sentence',
        '/ruta-done-reading — check the read gate and optionally advance',
        '/ruta-why — explain why AI is restricted here',
        '/ruta-tutorial — show this guide again',
      ],
      success: 'Read mode is complete when notebook.md has at least one real note and the active session state has a unity sentence.',
      nextAction: state.unity_sentence
        ? 'Add another concrete note with /ruta-note, then run /ruta-done-reading when your first pass is complete.'
        : 'Write your unity sentence with /ruta-unity <sentence>, then keep taking notes with /ruta-note.',
    };
  }

  if (mode === 'glossary') {
    return {
      purpose: 'Define important terms from the spec and test whether your own paraphrases actually hold up.',
      commands: [
        '/ruta-add-term <term> — add a glossary entry scaffold',
        '/ruta-probe-term <term> — probe whether your paraphrase is adequate',
        '/ruta-done-glossary — check the glossary gate and optionally advance',
        '/ruta-why — explain why help is narrow in this mode',
        '/ruta-tutorial — show this guide again',
      ],
      success: 'Glossary mode is complete when glossary.md contains at least one term with a non-empty user paraphrase.',
      nextAction: 'Pick a term that matters to the architecture, add it with /ruta-add-term <term>, then run /ruta-probe-term <term>.',
    };
  }

  return {
    purpose: 'Surface implementation ambiguities, silences, and forced decisions without prematurely resolving them.',
    commands: [
      '/ruta-scope <ref-range> — optionally narrow the section range for large specs',
      '/ruta-probe <section> — inspect a section for implementation gaps',
      '/ruta-add-gap — record a gap manually in gaps.md',
      '/ruta-done-reimplement — check the reimplementation gate',
      '/ruta-why — explain the guardrails for this mode',
      '/ruta-tutorial — show this guide again',
    ],
    success: 'Reimplement mode is complete when gaps.md has at least one gap entry per major section in scope.',
    nextAction: state.scope
      ? `Probe one in-scope section with /ruta-probe <section> and preserve ambiguities in gaps.md. Current scope: ${state.scope}`
      : 'Probe one major section with /ruta-probe <section>; if the spec is large, set a scope first with /ruta-scope <ref-range>.',
  };
}

const KEY_CONCEPTS = `## Key concepts

- unity sentence — one sentence stating what the spec is trying to accomplish, in your own words. Mortimer Adler's test: you haven't understood an argument until you can restate it without quoting the source.
- gap — an implementation decision the spec leaves silent, ambiguous, or forced. Something you would have to resolve when actually building this.
- probe — an AI-assisted scan of one spec section that lists implementation gaps. The AI surfaces ambiguities; you decide whether to resolve them.
- paraphrase-adequacy — whether your own definition of a term matches how the spec actually uses it. /ruta-probe-term checks this without writing the definition for you.
- gate — a checkpoint ruta uses before letting you advance to the next mode. Gates check that artifacts are non-empty, not that they are good.`;

function accessLabel(mode: RutaMode): string {
  if (mode === 'read') return 'no AI';
  if (mode === 'glossary') return 'AI: narrow';
  return 'AI: dialog';
}

function formatModeBlock(mode: RutaMode, state: RutaProjectState, tutorial: ModeTutorial, specTitle?: string): string {
  const gates = state.gates;
  const toolbar = `[${mode}] ${accessLabel(mode)}  ·  gates: read=${gates.read_unlocked} glossary=${gates.glossary_unlocked} reimpl=${gates.reimplement_unlocked}`;
  const displayPath = state.source_spec_path ?? state.spec_path;
  const specLine = specTitle ? `spec: ${displayPath}  —  ${specTitle}` : `spec: ${displayPath}`;

  const lines = [
    '# ruta tutorial',
    '',
    toolbar,
    specLine,
  ];

  if (state.scope) {
    lines.push(`scope: ${state.scope}`);
  }

  lines.push(
    '',
    '## Purpose',
    '',
    tutorial.purpose,
    '',
    '## Commands to use now',
    '',
    ...tutorial.commands.map((command) => `- ${command}`),
    '',
    '## What success looks like',
    '',
    tutorial.success,
    '',
    '## Next recommended action',
    '',
    tutorial.nextAction,
    '',
    KEY_CONCEPTS,
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Help topics — /ruta-help <topic>
// ---------------------------------------------------------------------------

export interface HelpTopic {
  title: string;
  body: string;
}

export const HELP_TOPICS: Record<string, HelpTopic> = {
  // Concepts
  unity: {
    title: 'Unity sentence',
    body: `A unity sentence is one sentence, in your own words, that states what the spec is trying to accomplish.

Mortimer Adler's test: you haven't understood an argument until you can restate it without quoting the source. The unity sentence is ruta's version of that test.

It is not a summary. It is not a list of features. It is a single claim about intent — what problem does this spec solve and for whom?

Example: "This spec defines a token-bucket rate limiter that protects downstream services from bursty clients while allowing short bursts within a sliding window."

Use /ruta-unity <sentence> to record yours. You cannot advance past read mode until it is set.`,
  },
  gap: {
    title: 'Gap',
    body: `A gap is an implementation decision the spec leaves silent, ambiguous, or forced.

Three kinds of gaps:
- Silent — the spec does not address something you would have to decide when building. Example: "The spec says items expire; it doesn't say whether expiry runs eagerly or lazily."
- Ambiguous — the spec uses a term or rule that could be interpreted more than one way. Example: "'Recent' is undefined — does it mean last 24 hours, last N events, or a configurable window?"
- Forced — the spec's constraints combine to force a specific architectural decision without stating it explicitly. Example: "The 10ms latency SLA and the requirement to persist every event force synchronous write-ahead logging or a very specific async flush strategy."

Gaps are not bugs in the spec. They are the places where the architecture conversation happens. Surfacing them is the point of reimplement mode.

Use /ruta-add-gap to record a gap manually, or /ruta-probe <section> to scan for them.`,
  },
  probe: {
    title: 'Probe',
    body: `A probe is an AI-assisted scan of one spec section that lists implementation gaps.

During a probe, the AI reads the section you specify and surfaces decisions the spec leaves silent, ambiguous, or forced — without resolving them. The AI is constrained to discovery only; it must not propose architecture or tell you how to build.

/ruta-probe <section> runs the probe. The section argument should match a heading in the spec, e.g. "Goals", "Rate limiting", "§3.2".

After a probe, the gaps it finds are added to gaps.md. You decide which ones matter for your build.

Probes are only available in reimplement mode.`,
  },
  paraphrase: {
    title: 'Paraphrase adequacy',
    body: `Paraphrase adequacy is whether your own definition of a term matches how the spec actually uses it.

The gap between "I know what this means" and "I can define it myself" is where most comprehension failures hide. You may think you understand "idempotency key" but your mental model might be subtly wrong in a way that matters for the implementation.

/ruta-probe-term <term> checks paraphrase adequacy. It does not write the definition for you — it reads your definition in glossary.md and the spec's usage of the term and tells you where they diverge.

Paraphrase adequacy is not about correctness in the abstract; it is about whether your definition is consistent with the spec's usage.`,
  },
  gate: {
    title: 'Gate',
    body: `A gate is a checkpoint ruta uses before letting you advance to the next mode.

Gates check that artifacts are non-empty — not that they are good. The read gate requires at least one note in notebook.md and a non-empty unity sentence. The glossary gate requires at least one defined term in glossary.md. The reimplement gate requires at least one gap entry in gaps.md.

Gates are intentionally minimal. ruta does not judge the quality of your work — that is your job. The gates exist so you cannot accidentally skip a phase.

Use /ruta-done-reading, /ruta-done-glossary, or /ruta-done-reimplement to check the gate for the current phase.`,
  },
  // Modes
  read: {
    title: 'Read mode',
    body: `Read mode is the first phase of the ruta workflow.

Goal: read the spec yourself, collect ignorance, and state the document's unity in your own words.

AI is fully disabled in read mode. This is intentional. If the AI reads for you, you form no mental model — only the appearance of one.

What to do:
1. Read the spec (open the file directly or use /ruta-open-spec)
2. Take notes on anything you observe, question, or don't understand: /ruta-note <text>
3. Write your unity sentence: /ruta-unity <sentence>
4. When you have at least one note and a unity sentence, run /ruta-done-reading

Read mode is complete when notebook.md has at least one real note and the active session state has a unity sentence.`,
  },
  glossary: {
    title: 'Glossary mode',
    body: `Glossary mode is the second phase of the ruta workflow.

Goal: define the important terms from the spec in your own words, then test whether your paraphrases hold up.

AI is narrowed in glossary mode — it can test a paraphrase (does your definition match how the spec uses the term?) but it cannot write definitions for you.

What to do:
1. Pick a term that matters to the architecture
2. Add an entry scaffold: /ruta-add-term <term>
3. Open glossary.md and write your own paraphrase under the "paraphrase" heading
4. Test it: /ruta-probe-term <term>
5. Revise your paraphrase based on the feedback, or move on to the next term

Glossary mode is complete when glossary.md has at least one term with a non-empty user paraphrase.`,
  },
  reimplement: {
    title: 'Reimplement mode',
    body: `Reimplement mode is the third phase of the ruta workflow.

Goal: surface implementation ambiguities, silences, and forced decisions without prematurely resolving them.

AI can scan sections for gaps in reimplement mode, but it must not resolve them. Surfacing gaps now is the point — resolving them now skips the architecture conversation.

What to do:
1. Optionally narrow scope for large specs: /ruta-scope <ref-range> (e.g. "Goals, §3, Appendix A")
2. Pick a major section and probe it: /ruta-probe <section>
3. Review the gaps added to gaps.md
4. Add gaps you notice manually: /ruta-add-gap
5. When each major section in scope has at least one gap: /ruta-done-reimplement

Reimplement mode is complete when gaps.md has at least one gap entry per major section in scope.`,
  },
  // Commands
  start: {
    title: '/ruta-start',
    body: `Enables ruta guardrails for the current session.

Use this when you already have a ruta project and want to re-enter the restricted workflow after launching pi.

ruta no longer auto-activates on startup. You can safely chat normally until you explicitly run /ruta-start.`,
  },
  exit: {
    title: '/ruta-exit',
    body: `Disables ruta guardrails for the current session.

This stops mode-based chat/tool restrictions and clears the ruta status widget.

Your files and project state are unchanged. Run /ruta-start to resume later in the same workspace.`,
  },
  init: {
    title: '/ruta-init <spec-path>',
    body: `Initializes a new ruta project in the current directory.

Creates:
- .ruta/active.json — active-session map for the current workspace
- .ruta/<spec-uuid>/session-N/ruta.json — per-spec session state (mode, gates, unity sentence, spec hash)
- notebook.md, glossary.md, gaps.md, and related artifacts inside that session directory

The spec-path should be relative to the current directory. The spec must exist as a file.

After initialization, the project starts in read mode and guardrails are enabled for this session. Run /ruta-tutorial to see what to do next.`,
  },
  status: {
    title: '/ruta-status',
    body: `Shows a summary of the current ruta project state.

Displays:
- Current mode (read, glossary, or reimplement)
- Gate status for all three phases
- Unity sentence (if set)
- Scope (if set, reimplement mode only)
- Artifact content summary (notes, glossary terms, gaps)

Use this to orient yourself when you return to a project after a break.`,
  },
  tutorial: {
    title: '/ruta-tutorial',
    body: `Shows a mode-aware onboarding guide for the current ruta workflow.

Before initialization: explains the three-mode workflow and how to start.
After initialization: shows commands available in the current mode, what success looks like, and the recommended next action.

Use /ruta-tutorial any time you want a reminder of where you are and what to do next. It adapts to your current mode.`,
  },
  why: {
    title: '/ruta-why',
    body: `Explains why ruta restricts AI in the current mode.

The answer is different in each mode:
- Read mode: AI is disabled so your unity sentence and ignorance list come from you, not from a summary
- Glossary mode: AI is narrowed so it can test a paraphrase without writing one for you
- Reimplement mode: AI can surface ambiguities but must not resolve them

/ruta-why gives the full rationale. Use it when the restrictions feel like obstacles — they are the product, not missing features.`,
  },
  note: {
    title: '/ruta-note <text>',
    body: `Appends an observation or open question to notebook.md.

Available in read mode only. Each note gets a timestamp prefix.

A note can be anything: a question, a confusion, an observation about structure, something you want to revisit. The notebook is your ignorance list — a record of what you noticed while reading.

The read gate requires at least one note in notebook.md. You need at least one before /ruta-done-reading will pass.`,
  },
  'add-term': {
    title: '/ruta-add-term <term>',
    body: `Adds a glossary entry scaffold for a term to glossary.md.

Available in glossary mode. The scaffold includes:
- The term as a heading
- A "spec usage" section (for you to fill in with how the spec uses this term)
- A "paraphrase" section (for you to fill in with your own definition)

After adding the scaffold, open glossary.md and write your paraphrase. Then run /ruta-probe-term <term> to check whether your paraphrase matches the spec's usage.`,
  },
  'probe-term': {
    title: '/ruta-probe-term <term>',
    body: `Checks whether your paraphrase of a term matches how the spec actually uses it.

Available in glossary mode. The AI reads your paraphrase from glossary.md and the spec's usage of the term, then reports where they agree and where they diverge.

Important: /ruta-probe-term does NOT write the definition for you. It only checks whether yours is adequate. You must write the paraphrase yourself in glossary.md before running this command.

Use the feedback to revise your paraphrase or to understand a subtlety you missed.`,
  },
  scope: {
    title: '/ruta-scope <ref-range>',
    body: `Narrows which sections of the spec to probe during reimplementation.

Available in reimplement mode. Useful when the spec is large and you want to focus on the sections most relevant to what you are building.

The ref-range is a comma-separated list of section references matching headings in the spec. Examples:
- "Goals, Non-goals"
- "§3, §4.1, Appendix A"
- "Background, Architecture, Open questions"

Once scope is set, /ruta-probe only runs on in-scope sections, and the reimplement gate only requires coverage of in-scope sections.

Run /ruta-scope with no argument to clear the scope and cover the full spec.`,
  },
  'open-spec': {
    title: '/ruta-open-spec',
    body: `Opens the spec file in the built-in spec viewer.

The spec viewer shows the spec in a read-only panel with keyboard navigation (↑↓/jk scroll, pgup/pgdn, home/end, enter/esc/q to close).

Use this to read the spec without leaving the terminal. The viewer does not allow editing — it is read-only.`,
  },
  'add-gap': {
    title: '/ruta-add-gap',
    body: `Records a gap manually in gaps.md.

Available in reimplement mode. Opens an editor for you to describe the gap. A gap entry should describe:
- Where in the spec the gap appears (section reference)
- What is silent, ambiguous, or forced
- Why it matters for implementation

Use /ruta-probe <section> to find gaps automatically via AI scan. Use /ruta-add-gap when you notice a gap yourself while reading or thinking.`,
  },
  disagree: {
    title: '/ruta-disagree',
    body: `Gets a second opinion from a different AI model on your current work.

Use this when you want to pressure-test your understanding or your gap list. The secondary model reads your artifacts and the spec and highlights where it would interpret things differently.

Disagreements are surfaced in a read-only report. You decide whether to update your artifacts based on the feedback.

Available in glossary and reimplement modes.`,
  },
  comments: {
    title: '/ruta-comments',
    body: `Shows comments attached to sections of the spec.

Comments are annotations you have added to specific parts of the spec to record observations, questions, or links to your notes. They are stored in .ruta/ alongside the project state.

Use /ruta-open-spec to add comments while viewing the spec.`,
  },
};

/** All valid topic keys, sorted alphabetically — used for tab-completion. */
export const HELP_TOPIC_KEYS: string[] = Object.keys(HELP_TOPICS).sort();

export function buildHelpText(topic: string | null | undefined): string {
  if (!topic || !topic.trim()) {
    const index = HELP_TOPIC_KEYS.map((key) => {
      const t = HELP_TOPICS[key];
      return `- ${key.padEnd(20)} ${t.title}`;
    }).join('\n');
    return [
      '# ruta help',
      '',
      'Usage: /ruta-help <topic>',
      '',
      'Available topics:',
      '',
      index,
      '',
      'Examples:',
      '  /ruta-help unity',
      '  /ruta-help gap',
      '  /ruta-help read',
      '  /ruta-help probe',
    ].join('\n');
  }

  // Normalize: strip leading /ruta- so both "unity" and "/ruta-unity" work
  const normalized = topic.trim().toLowerCase().replace(/^\/ruta-/, '');
  const found = HELP_TOPICS[normalized];
  if (!found) {
    const suggestions = HELP_TOPIC_KEYS.filter((k) => k.startsWith(normalized.slice(0, 3)));
    const hint = suggestions.length
      ? `\nDid you mean: ${suggestions.join(', ')}?\n\nRun /ruta-help with no argument to see all topics.`
      : '\nRun /ruta-help with no argument to see all topics.';
    return `# ruta help\n\nUnknown topic: "${topic}"${hint}`;
  }

  return `# ruta help — ${found.title}\n\n${found.body}`;
}

export function buildTutorialText(state: RutaProjectState | null, specTitle?: string): string {
  if (!state) {
    return [
      '# ruta tutorial',
      '',
      'ruta is a mode-restricted workflow for learning a spec without outsourcing the understanding.',
      'AI is restricted at each stage so you form your own mental model before the assistant fills in the gaps.',
      '',
      '## Start here',
      '',
      '- Run /ruta-init <spec-path> in a directory that contains the spec you want to study.',
      '- ruta will create file-backed artifacts: notebook.md (your notes), glossary.md (your term definitions), gaps.md (implementation ambiguities).',
      '- If a project is already initialized, run /ruta-start to enable guardrails for this session.',
      '',
      '## Three-mode workflow',
      '',
      '1. read — read the spec yourself, take notes in notebook.md, write a unity sentence (one sentence: what is this spec trying to accomplish?)',
      '2. glossary — define important terms in your own words, then test whether your paraphrases hold up',
      '3. reimplement — scan sections for gaps: decisions the spec leaves silent, ambiguous, or forced',
      '',
      'Each mode has a gate. You advance when the artifact for that mode is non-empty.',
      '',
      'After initialization, run /ruta-tutorial again to get mode-specific next steps.',
      '',
      KEY_CONCEPTS,
    ].join('\n');
  }

  return formatModeBlock(state.current_mode, state, modeTutorial(state), specTitle);
}
