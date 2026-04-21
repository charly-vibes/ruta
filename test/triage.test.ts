import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProbeLines, makeTriageFrame } from '../extensions/triage';

const SAMPLE_PROBE = `
1. DECISIONS:
- What default value to use when field X is absent
- How to handle concurrent writes

2. SILENCES:
- The spec does not say what happens on timeout. "The system shall respond within 5s" but no error behavior.

3. AMBIGUITIES:
- "Unique" could mean unique per session or globally. Candidate A: session-scoped. Candidate B: global.

4. IMPLICIT ASSUMPTIONS:
- Assumes the clock is monotonic
`.trim();

test('parseProbeLines extracts non-empty non-header lines', () => {
  const lines = parseProbeLines(SAMPLE_PROBE);
  // Should contain the bullet items, not the numbered section headers
  assert.ok(lines.length > 0);
  assert.ok(lines.every((l) => l.trim().length > 0));
  assert.ok(!lines.some((l) => /^\d+\.\s+[A-Z]+/.test(l)), 'Should not include section headers');
  assert.ok(lines.some((l) => l.includes('default value')));
  assert.ok(lines.some((l) => l.includes('Unique')));
});

test('parseProbeLines returns empty array for blank input', () => {
  assert.deepEqual(parseProbeLines(''), []);
  assert.deepEqual(parseProbeLines('   \n  \n  '), []);
});

test('parseProbeLines handles "none identified" entries', () => {
  const probe = '1. DECISIONS:\nnone identified — this section is purely declarative.\n\n2. SILENCES:\n- Missing timeout behavior.';
  const lines = parseProbeLines(probe);
  assert.ok(lines.some((l) => l.includes('none identified')));
  assert.ok(lines.some((l) => l.includes('Missing timeout')));
});

test('makeTriageFrame renders lines with cursor and line numbers', () => {
  const lines = ['First finding', 'Second finding', 'Third finding'];
  const frame = makeTriageFrame(lines, {
    cursorLine: 2,
    scrollTop: 1,
    bodyHeight: 3,
    width: 40,
  });
  assert.equal(frame.length, 3);
  assert.ok(frame[0]!.includes('1'));
  assert.ok(frame[1]!.startsWith('>'), 'Cursor line should start with >');
  assert.ok(frame[1]!.includes('Second finding'));
});

test('makeTriageFrame truncates long lines', () => {
  const lines = ['A'.repeat(60)];
  const frame = makeTriageFrame(lines, {
    cursorLine: 1,
    scrollTop: 1,
    bodyHeight: 1,
    width: 20,
  });
  assert.ok(frame[0]!.length <= 20);
});
