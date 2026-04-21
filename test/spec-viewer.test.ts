import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findSpecLineForSection,
  makeSpecViewerFrame,
} from '../extensions/spec-viewer';

test('findSpecLineForSection returns the matching heading line', () => {
  const spec = [
    '# Intro',
    'opening',
    '## Goals',
    'goal text',
    '## Non-goals',
    'avoid scope creep',
  ].join('\n');

  assert.equal(findSpecLineForSection(spec, 'Goals'), 3);
  assert.equal(findSpecLineForSection(spec, 'non-goals'), 5);
});

test('findSpecLineForSection returns null when the section is missing', () => {
  const spec = ['# Intro', 'opening'].join('\n');

  assert.equal(findSpecLineForSection(spec, 'missing'), null);
  assert.equal(findSpecLineForSection(spec), 1);
});

test('findSpecLineForSection returns null for ambiguous query matching multiple headings', () => {
  const spec = [
    '# Goals',
    'goal text',
    '## Non-goals',
    'out of scope',
  ].join('\n');

  // 'goal' is a substring of both 'Goals' and 'Non-goals' — ambiguous
  assert.equal(findSpecLineForSection(spec, 'goal'), null);
  // Exact match is unambiguous even when substring hits multiple
  assert.equal(findSpecLineForSection(spec, 'Goals'), 1);
});

test('makeSpecViewerFrame includes line numbers and cursor marker', () => {
  const spec = [
    '# Intro',
    'opening',
    '## Goals',
    'goal text',
  ].join('\n');

  const frame = makeSpecViewerFrame(spec, {
    cursorLine: 3,
    scrollTop: 1,
    bodyHeight: 3,
    width: 24,
  });

  assert.deepEqual(frame, [
    '   1  # Intro',
    '   2  opening',
    '>  3  ## Goals',
  ]);
});

test('makeSpecViewerFrame scrolls and truncates long lines to fit width', () => {
  const spec = [
    '# Intro',
    'opening',
    '## Goals',
    'a very long line that should be truncated',
  ].join('\n');

  const frame = makeSpecViewerFrame(spec, {
    cursorLine: 4,
    scrollTop: 2,
    bodyHeight: 2,
    width: 18,
  });

  assert.deepEqual(frame, [
    '   3  ## Goals',
    '>  4  a very long…',
  ]);
});
