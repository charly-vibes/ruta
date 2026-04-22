import type { RutaProjectState } from '../extensions/state';

export type DisclosureStateName = 'pre-init' | 'read' | 'glossary' | 'reimplement';

export interface DisclosureFixture {
  name: DisclosureStateName;
  state: RutaProjectState | null;
  availableNow: string[];
  nextUnlock?: {
    gate: string;
    transitionCommand: string;
    supportingCommands: string[];
  };
}

export interface DegradedDisclosureFixture {
  name: 'missing-state' | 'corrupt-state';
  stateFileContents?: string;
  availableNow: string[];
  recoveryHint: string;
}

function makeState(overrides: Partial<RutaProjectState>): RutaProjectState {
  return {
    schema_version: '0.2',
    spec_path: 'spec/example.md',
    source_spec_path: 'examples/specs/example.md',
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

export const DISCLOSURE_FIXTURES: Record<DisclosureStateName, DisclosureFixture> = {
  'pre-init': {
    name: 'pre-init',
    state: null,
    availableNow: ['/ruta-help', '/ruta-init', '/ruta-tutorial', '/ruta-why'],
  },
  read: {
    name: 'read',
    state: makeState({
      current_mode: 'read',
      unity_sentence: null,
      gates: {
        read_unlocked: false,
        glossary_unlocked: false,
        reimplement_unlocked: false,
      },
    }),
    availableNow: ['/ruta-note', '/ruta-unity', '/ruta-done-reading'],
    nextUnlock: {
      gate: 'read gate',
      transitionCommand: '/ruta-done-reading',
      supportingCommands: ['/ruta-note', '/ruta-unity'],
    },
  },
  glossary: {
    name: 'glossary',
    state: makeState({
      current_mode: 'glossary',
      gates: {
        read_unlocked: true,
        glossary_unlocked: false,
        reimplement_unlocked: false,
      },
    }),
    availableNow: ['/ruta-add-term', '/ruta-probe-term', '/ruta-done-glossary'],
    nextUnlock: {
      gate: 'glossary gate',
      transitionCommand: '/ruta-done-glossary',
      supportingCommands: ['/ruta-add-term', '/ruta-probe-term'],
    },
  },
  reimplement: {
    name: 'reimplement',
    state: makeState({
      current_mode: 'reimplement',
      gates: {
        read_unlocked: true,
        glossary_unlocked: true,
        reimplement_unlocked: false,
      },
      scope: 'Goals, Non-goals',
    }),
    availableNow: ['/ruta-probe', '/ruta-add-gap', '/ruta-done-reimplement'],
    nextUnlock: {
      gate: 'reimplement gate',
      transitionCommand: '/ruta-done-reimplement',
      supportingCommands: ['/ruta-probe', '/ruta-add-gap'],
    },
  },
};

export const DEGRADED_DISCLOSURE_FIXTURES: DegradedDisclosureFixture[] = [
  {
    name: 'missing-state',
    availableNow: DISCLOSURE_FIXTURES['pre-init'].availableNow,
    recoveryHint: 'Run /ruta-init <spec-path> to initialize a spec, or /ruta-resume to reconnect to an existing session.',
  },
  {
    name: 'corrupt-state',
    stateFileContents: '{"schema_version": "0.2",',
    availableNow: DISCLOSURE_FIXTURES['pre-init'].availableNow,
    recoveryHint: 'State could not be read. Reinitialize with /ruta-init <spec-path> or resume a healthy session with /ruta-resume.',
  },
];

export const INVALID_HELP_TOPICS = ['bogus', 'uni-', '/ruta-bogus'];
