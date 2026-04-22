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
      success: 'Read mode is complete when notebook.md has at least one real note and .ruta/ruta.json has a unity sentence.',
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
        '/ruta-test <term> — probe whether your paraphrase is adequate',
        '/ruta-done-glossary — check the glossary gate and optionally advance',
        '/ruta-why — explain why help is narrow in this mode',
        '/ruta-tutorial — show this guide again',
      ],
      success: 'Glossary mode is complete when glossary.md contains at least one term with a non-empty user paraphrase.',
      nextAction: 'Pick a term that matters to the architecture, add it with /ruta-add-term <term>, then run /ruta-test <term>.',
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

function formatModeBlock(mode: RutaMode, state: RutaProjectState, tutorial: ModeTutorial): string {
  const lines = [
    '# ruta tutorial',
    '',
    `- mode: ${mode}`,
    `- purpose: ${tutorial.purpose}`,
    `- spec: ${state.spec_path}`,
    `- read gate: ${state.gates.read_unlocked}`,
    `- glossary gate: ${state.gates.glossary_unlocked}`,
    `- reimplement gate: ${state.gates.reimplement_unlocked}`,
  ];

  if (state.scope) {
    lines.push(`- scope: ${state.scope}`);
  }

  lines.push(
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
  );

  return lines.join('\n');
}

export function buildTutorialText(state: RutaProjectState | null): string {
  if (!state) {
    return [
      '# ruta tutorial',
      '',
      'ruta is a mode-restricted workflow for learning a spec without outsourcing the understanding.',
      '',
      '## Start here',
      '',
      '- Run /ruta-init <spec-path> in a directory that contains the spec you want to study.',
      '- ruta will create file-backed artifacts like notebook.md, glossary.md, and gaps.md.',
      '',
      '## Workflow',
      '',
      '- read — read the spec yourself, take notes, and write the unity sentence',
      '- glossary — define important terms and test your own paraphrases',
      '- reimplement — surface ambiguities and forced decisions without resolving them too early',
      '',
      'After initialization, run /ruta-tutorial again to get mode-specific next steps.',
    ].join('\n');
  }

  return formatModeBlock(state.current_mode, state, modeTutorial(state));
}
