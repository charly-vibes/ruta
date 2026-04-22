import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHelpText, buildTutorialText, HELP_TOPIC_KEYS } from '../extensions/tutorial';
import type { RutaProjectState } from '../extensions/state';

function makeState(overrides: Partial<RutaProjectState> = {}): RutaProjectState {
  return {
    schema_version: '0.2',
    spec_path: 'spec/example.md',
    spec_hash: 'sha256:abc',
    spec_hash_canonicalization: 'nfc-lf-trim-v1',
    current_mode: 'read',
    unity_sentence: null,
    mode_history: [{ mode: 'read', entered_at: '2026-04-22T00:00:00.000Z' }],
    gates: {
      read_unlocked: false,
      glossary_unlocked: false,
      reimplement_unlocked: false,
    },
    prompt_bundle_hash: 'prompt-hash',
    ...overrides,
  };
}

test('buildTutorialText explains how to start before initialization', () => {
  const text = buildTutorialText(null);
  assert.ok(text.includes('/ruta-init <spec-path>'));
  assert.ok(text.includes('/ruta-start'));
  assert.ok(text.toLowerCase().includes('read'));
  assert.ok(text.toLowerCase().includes('glossary'));
  assert.ok(text.toLowerCase().includes('reimplement'));
});

test('buildTutorialText for read mode lists only read-stage commands and next action', () => {
  const text = buildTutorialText(makeState({ current_mode: 'read' }));
  assert.ok(text.includes('[read]'));
  assert.ok(text.includes('/ruta-note'));
  assert.ok(text.includes('/ruta-unity'));
  assert.ok(text.includes('/ruta-done-reading'));
  assert.ok(text.includes('/ruta-tutorial'));
  assert.ok(text.includes('active session state has a unity sentence'));
  // /ruta-probe-term and /ruta-probe appear in Key concepts (as illustrations), not in "Commands to use now"
  assert.ok(!text.includes('- /ruta-probe-term'));
  assert.ok(!text.includes('- /ruta-probe '));
  assert.ok(text.toLowerCase().includes('next recommended action'));
});

test('buildTutorialText for glossary mode points to paraphrase workflow', () => {
  const text = buildTutorialText(makeState({ current_mode: 'glossary', gates: { read_unlocked: true, glossary_unlocked: false, reimplement_unlocked: false } }));
  assert.ok(text.includes('[glossary]'));
  assert.ok(text.includes('/ruta-add-term'));
  assert.ok(text.includes('/ruta-probe-term'));
  assert.ok(text.includes('/ruta-done-glossary'));
  assert.ok(!text.includes('- /ruta-note'));
  // /ruta-probe (section scan, reimplement-mode) should not appear in glossary commands
  assert.ok(!text.includes('- /ruta-probe '));
  assert.ok(text.toLowerCase().includes('paraphrase'));
});

test('buildHelpText with no topic lists all topics', () => {
  const text = buildHelpText(null);
  assert.ok(text.includes('# ruta help'));
  assert.ok(text.includes('Usage: /ruta-help <topic>'));
  // A sample of expected topics
  for (const topic of ['unity', 'gap', 'probe', 'read', 'glossary', 'reimplement', 'gate', 'paraphrase', 'start', 'exit']) {
    assert.ok(text.includes(topic), `Expected topic index to include "${topic}"`);
  }
});

test('buildHelpText for a known concept returns detailed explanation', () => {
  const text = buildHelpText('unity');
  assert.ok(text.includes('Unity sentence'));
  assert.ok(text.includes('Mortimer Adler'));
  assert.ok(text.includes('/ruta-unity'));
});


test('buildHelpText for init describes the session-scoped state layout', () => {
  const text = buildHelpText('init');
  assert.ok(text.includes('.ruta/active.json'));
  assert.ok(text.includes('.ruta/<spec-uuid>/session-N/ruta.json'));
  assert.ok(!text.includes('.ruta/ruta.json'));
});

test('buildHelpText accepts /ruta- prefix and resolves to same topic', () => {
  const withPrefix = buildHelpText('/ruta-unity');
  const withoutPrefix = buildHelpText('unity');
  assert.equal(withPrefix, withoutPrefix);
});

test('buildHelpText for unknown topic returns helpful error with suggestions', () => {
  const text = buildHelpText('uni');
  assert.ok(text.includes('Unknown topic'));
  // Should suggest "unity" since it starts with "uni"
  assert.ok(text.includes('unity'));
});

test('HELP_TOPIC_KEYS is sorted and non-empty', () => {
  assert.ok(HELP_TOPIC_KEYS.length > 0);
  for (let i = 1; i < HELP_TOPIC_KEYS.length; i++) {
    assert.ok(
      HELP_TOPIC_KEYS[i - 1] <= HELP_TOPIC_KEYS[i],
      `Keys not sorted: "${HELP_TOPIC_KEYS[i - 1]}" > "${HELP_TOPIC_KEYS[i]}"`,
    );
  }
});

test('buildTutorialText for reimplement mode points to gap discovery workflow', () => {
  const text = buildTutorialText(makeState({
    current_mode: 'reimplement',
    gates: { read_unlocked: true, glossary_unlocked: true, reimplement_unlocked: false },
    scope: 'Goals, Non-goals',
  }));
  assert.ok(text.includes('[reimplement]'));
  assert.ok(text.includes('/ruta-probe'));
  assert.ok(text.includes('/ruta-add-gap'));
  assert.ok(text.includes('/ruta-done-reimplement'));
  assert.ok(text.includes('scope: Goals, Non-goals'));
  assert.ok(!text.includes('/ruta-note'));
  // /ruta-probe-term appears in the shared Key concepts section (as an illustration), but not in the "Commands to use now" list
  assert.ok(!text.includes('- /ruta-probe-term'));
  assert.ok(text.toLowerCase().includes('ambigu'));
});


test('buildTutorialText prefers source_spec_path and appends the spec title when provided', () => {
  const text = buildTutorialText(makeState({
    current_mode: 'read',
    spec_path: '.ruta/abc/session-2/spec.md',
    source_spec_path: 'openspec/specs/ruta/spec.md',
  }), 'ruta spec');
  assert.ok(text.includes('spec: openspec/specs/ruta/spec.md  —  ruta spec'));
  assert.ok(!text.includes('spec: .ruta/abc/session-2/spec.md'));
});
