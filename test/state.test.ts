import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeSpec } from './test-helpers';
import {
  appendSpecComment,
  deriveSpecCommentAnchor,
  glossaryGateSatisfied,
  readGateSatisfied,
  readSpecComments,
  stripMarkdownFormatting,
  writeSpecComments,
  type SpecComment,
} from '../extensions/state';
import { composeSystemPrompt, BASE_PROMPT } from '../extensions/prompts';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('canonicalizeSpec normalizes line endings, trailing whitespace, and trailing blank lines', () => {
  const input = 'a  \r\nbe\u0301\r\n\r\n';
  assert.equal(canonicalizeSpec(input), 'a\nbé');
});

test('composeSystemPrompt prepends the base prompt', () => {
  const fragment = 'glossary mode only';
  const composed = composeSystemPrompt(fragment);
  assert.ok(composed.startsWith(BASE_PROMPT));
  assert.ok(composed.includes(fragment));
});

test('stripMarkdownFormatting removes lightweight markdown wrappers', () => {
  assert.equal(stripMarkdownFormatting('**hello** _world_ `x`'), 'hello world x');
});

test('readGateSatisfied requires both notebook content and unity sentence', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-read-gate-'));
  const notebook = path.join(dir, 'notebook.md');
  await writeFile(notebook, '# Notebook\n\n- one note\n', 'utf8');
  assert.equal(await readGateSatisfied(notebook, null), false);
  assert.equal(await readGateSatisfied(notebook, 'Unity sentence'), true);
});

test('glossaryGateSatisfied requires a non-empty paraphrase block', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-glossary-gate-'));
  const glossary = path.join(dir, 'glossary.md');
  await writeFile(
    glossary,
    '# Glossary\n\n## Frame\n\n**Spec definition** (§3):\n> Something\n\n**Your paraphrase:**\nMy own words\n\n**Source passages:**\n- §3 — definition\n',
    'utf8',
  );
  assert.equal(await glossaryGateSatisfied(glossary), true);
});

test('writeSpecComments round-trips comment data', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-comments-roundtrip-'));
  const commentsPath = path.join(dir, 'comments.json');
  const comments: SpecComment[] = [{
    id: 'c-1',
    specPath: 'spec/example.md',
    line: 7,
    sectionRef: 'Goals',
    excerpt: 'Goal text',
    text: 'Needs clarification',
    createdAt: '2026-04-21T00:00:00.000Z',
  }];

  await writeSpecComments(commentsPath, comments);

  assert.deepEqual(await readSpecComments(commentsPath), comments);
});

test('appendSpecComment preserves existing comments', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-comments-append-'));
  const commentsPath = path.join(dir, 'comments.json');

  await appendSpecComment(commentsPath, {
    id: 'c-1',
    specPath: 'spec/example.md',
    line: 3,
    sectionRef: 'Intro',
    excerpt: 'First line',
    text: 'First comment',
    createdAt: '2026-04-21T00:00:00.000Z',
  });
  await appendSpecComment(commentsPath, {
    id: 'c-2',
    specPath: 'spec/example.md',
    line: 9,
    sectionRef: 'Goals',
    excerpt: 'Second line',
    text: 'Second comment',
    createdAt: '2026-04-21T00:01:00.000Z',
  });

  assert.deepEqual(
    (await readSpecComments(commentsPath)).map((comment) => comment.id),
    ['c-1', 'c-2'],
  );
});

test('deriveSpecCommentAnchor returns excerpt and best-effort section label', () => {
  const spec = [
    '# Intro',
    '',
    'Opening context',
    'Still intro',
    '## Goals',
    '',
    'Goal line',
    'Another goal detail',
  ].join('\n');

  assert.deepEqual(deriveSpecCommentAnchor(spec, 7), {
    line: 7,
    sectionRef: 'Goals',
    excerpt: 'Goal line',
  });
  assert.deepEqual(deriveSpecCommentAnchor(spec, 6), {
    line: 6,
    sectionRef: 'Goals',
    excerpt: 'Goal line',
  });
});
