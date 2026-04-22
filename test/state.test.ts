import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeSpec } from './test-helpers';
import {
  appendSpecComment,
  computeSpecUUID,
  createSpecComment,
  createTriageToken,
  deriveSpecCommentAnchor,
  getSpecSectionByRef,
  glossaryGateSatisfied,
  isValidTriageToken,
  listAllSessions,
  listSpecComments,
  loadActiveSession,
  readActiveJson,
  readGateSatisfied,
  readSpecComments,
  reimplementGateSatisfied,
  stripMarkdownFormatting,
  writeSpecComments,
  type RutaProjectState,
  type SpecComment,
} from '../extensions/state';
import { composeSystemPrompt, BASE_PROMPT } from '../extensions/prompts';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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

test('readGateSatisfied rejects scaffold-only notebook', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-read-gate-scaffold-'));
  const notebook = path.join(dir, 'notebook.md');
  // This is exactly what scaffoldProject() writes
  await writeFile(notebook, '# Notebook\n\n- [2026-04-21T00:00:00.000Z] Things I don\'t know yet:\n', 'utf8');
  assert.equal(await readGateSatisfied(notebook, 'Unity sentence'), false);
});

test('readGateSatisfied accepts user-extended scaffold line as real content', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-read-gate-extended-'));
  const notebook = path.join(dir, 'notebook.md');
  // User extended the scaffold placeholder with actual content after the colon
  await writeFile(notebook, '# Notebook\n\n- [2026-04-21T00:00:00.000Z] Things I don\'t know yet: session expiry behavior\n', 'utf8');
  assert.equal(await readGateSatisfied(notebook, 'Unity sentence'), true);
});

test('reimplementGateSatisfied unscoped counts all major headings', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-reimplement-gate-'));
  const specPath = path.join(dir, 'spec.md');
  const gapsPath = path.join(dir, 'gaps.md');
  await writeFile(specPath, '# Section A\n\n## Section B\n\n# Section C\n', 'utf8');
  // 3 headings, only 2 gaps — gate not satisfied without scope
  await writeFile(gapsPath, '# Gaps\n\n### G-001\n\n**Citation:** §A\n**Decision forced:** \n**Spec\'s guidance:** \n**Your proposed resolution:** \n**Confidence:** low\n**Gap type:** likely spec silence (not my ignorance)\n**Raised in session:** 2026-04-21\n\n### G-002\n\n**Citation:** §B\n**Decision forced:** \n**Spec\'s guidance:** \n**Your proposed resolution:** \n**Confidence:** low\n**Gap type:** likely spec silence (not my ignorance)\n**Raised in session:** 2026-04-21\n', 'utf8');
  assert.equal(await reimplementGateSatisfied(specPath, gapsPath), false);
  // 3 gaps — gate satisfied
  await writeFile(gapsPath, '# Gaps\n\n### G-001\n\n**Citation:** §A\n**Decision forced:** \n**Spec\'s guidance:** \n**Your proposed resolution:** \n**Confidence:** low\n**Gap type:** likely spec silence (not my ignorance)\n**Raised in session:** 2026-04-21\n\n### G-002\n\n**Citation:** §B\n**Decision forced:** \n**Spec\'s guidance:** \n**Your proposed resolution:** \n**Confidence:** low\n**Gap type:** likely spec silence (not my ignorance)\n**Raised in session:** 2026-04-21\n\n### G-003\n\n**Citation:** §C\n**Decision forced:** \n**Spec\'s guidance:** \n**Your proposed resolution:** \n**Confidence:** low\n**Gap type:** likely spec silence (not my ignorance)\n**Raised in session:** 2026-04-21\n', 'utf8');
  assert.equal(await reimplementGateSatisfied(specPath, gapsPath), true);
});

test('reimplementGateSatisfied scoped counts only declared headings', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-reimplement-gate-scoped-'));
  const specPath = path.join(dir, 'spec.md');
  const gapsPath = path.join(dir, 'gaps.md');
  await writeFile(specPath, '# Section A\n\n## Section B\n\n# Section C\n', 'utf8');
  // Only "Section A, Section B" in scope — 1 gap is not enough, 2 is
  await writeFile(gapsPath, '# Gaps\n\n### G-001\n\n**Citation:** §A\n**Decision forced:** \n**Spec\'s guidance:** \n**Your proposed resolution:** \n**Confidence:** low\n**Gap type:** likely spec silence (not my ignorance)\n**Raised in session:** 2026-04-21\n', 'utf8');
  assert.equal(await reimplementGateSatisfied(specPath, gapsPath, 'Section A, Section B'), false);
  await writeFile(gapsPath, '# Gaps\n\n### G-001\n\n**Citation:** §A\n**Decision forced:** \n**Spec\'s guidance:** \n**Your proposed resolution:** \n**Confidence:** low\n**Gap type:** likely spec silence (not my ignorance)\n**Raised in session:** 2026-04-21\n\n### G-002\n\n**Citation:** §B\n**Decision forced:** \n**Spec\'s guidance:** \n**Your proposed resolution:** \n**Confidence:** low\n**Gap type:** likely spec silence (not my ignorance)\n**Raised in session:** 2026-04-21\n', 'utf8');
  assert.equal(await reimplementGateSatisfied(specPath, gapsPath, 'Section A, Section B'), true);
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

test('computeSpecUUID is deterministic for the same resolved path', () => {
  assert.equal(
    computeSpecUUID('/workspace/project', './specs/example.md'),
    computeSpecUUID('/workspace/project', 'specs/example.md'),
  );
});

test('computeSpecUUID differs for different spec paths', () => {
  assert.notEqual(
    computeSpecUUID('/workspace/project', 'specs/example-a.md'),
    computeSpecUUID('/workspace/project', 'specs/example-b.md'),
  );
});

test('readActiveJson prunes dead pid entries and preserves live ones', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-active-json-'));
  await mkdir(path.join(dir, '.ruta'), { recursive: true });
  await writeFile(
    path.join(dir, '.ruta', 'active.json'),
    `${JSON.stringify({
      [String(process.pid)]: {
        spec_uuid: 'live-spec',
        session_id: 'session-1',
        source_spec_path: 'specs/live.md',
        started_at: '2026-04-22T00:00:00.000Z',
      },
      ['99999999']: {
        spec_uuid: 'dead-spec',
        session_id: 'session-2',
        source_spec_path: 'specs/dead.md',
        started_at: '2026-04-22T00:00:00.000Z',
      },
    }, null, 2)}\n`,
    'utf8',
  );

  const active = await readActiveJson(dir);

  assert.deepEqual(Object.keys(active), [String(process.pid)]);
  const persisted = JSON.parse(await readFile(path.join(dir, '.ruta', 'active.json'), 'utf8')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(persisted), [String(process.pid)]);
});

test('loadActiveSession returns null when there is no active session', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-load-active-none-'));
  assert.equal(await loadActiveSession(dir), null);
});

test('loadActiveSession returns state and sessionDir for current pid entry', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-load-active-'));
  const uuid = 'abc123def4567890';
  const sessionId = 'session-2';
  const sessionDir = path.join(dir, '.ruta', uuid, sessionId);
  await mkdir(sessionDir, { recursive: true });

  const state: RutaProjectState = {
    schema_version: '0.2',
    spec_path: 'spec/spec.md',
    source_spec_path: 'openspec/specs/ruta/spec.md',
    spec_hash: 'sha256:test',
    spec_hash_canonicalization: 'nfc-lf-trim-v1',
    current_mode: 'glossary',
    unity_sentence: 'A test unity sentence.',
    mode_history: [{ mode: 'read', entered_at: '2026-04-22T00:00:00.000Z' }],
    gates: { read_unlocked: true, glossary_unlocked: false, reimplement_unlocked: false },
    prompt_bundle_hash: 'prompt-hash',
  };

  await writeFile(path.join(sessionDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await mkdir(path.join(dir, '.ruta'), { recursive: true });
  await writeFile(
    path.join(dir, '.ruta', 'active.json'),
    `${JSON.stringify({
      [String(process.pid)]: {
        spec_uuid: uuid,
        session_id: sessionId,
        source_spec_path: state.source_spec_path,
        started_at: '2026-04-22T01:00:00.000Z',
      },
    }, null, 2)}\n`,
    'utf8',
  );

  const loaded = await loadActiveSession(dir);

  assert.ok(loaded);
  assert.equal(loaded?.sessionDir, sessionDir);
  assert.equal(loaded?.state.current_mode, 'glossary');
  assert.equal(loaded?.active.session_id, sessionId);
});

test('listAllSessions enumerates session directories and ignores missing ones', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-list-sessions-'));
  const rutaDir = path.join(dir, '.ruta');
  const uuidA = 'aaaaaaaaaaaaaaaa';
  const uuidB = 'bbbbbbbbbbbbbbbb';

  await mkdir(path.join(rutaDir, uuidA, 'session-1'), { recursive: true });
  await mkdir(path.join(rutaDir, uuidB, 'session-3'), { recursive: true });

  await writeFile(
    path.join(rutaDir, uuidA, 'meta.json'),
    `${JSON.stringify({ source_spec_path: 'specs/a.md', sessions: ['session-1', 'session-2'] }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(rutaDir, uuidB, 'meta.json'),
    `${JSON.stringify({ source_spec_path: 'specs/b.md', sessions: ['session-3'] }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(rutaDir, uuidA, 'session-1', 'state.json'),
    `${JSON.stringify({ current_mode: 'read' }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(rutaDir, uuidB, 'session-3', 'state.json'),
    `${JSON.stringify({ current_mode: 'reimplement' }, null, 2)}\n`,
    'utf8',
  );

  const sessions = await listAllSessions(dir);
  sessions.sort((a, b) => a.uuid.localeCompare(b.uuid) || a.sessionId.localeCompare(b.sessionId));

  assert.deepEqual(
    sessions.map((session) => ({
      uuid: session.uuid,
      sessionId: session.sessionId,
      sourcePath: session.sourcePath,
      mode: session.mode,
    })),
    [
      { uuid: uuidA, sessionId: 'session-1', sourcePath: 'specs/a.md', mode: 'read' },
      { uuid: uuidB, sessionId: 'session-3', sourcePath: 'specs/b.md', mode: 'reimplement' },
    ],
  );
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

test('getSpecSectionByRef returns null when section is missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-section-ref-'));
  const specPath = path.join(dir, 'spec.md');
  await writeFile(specPath, '# Goals\n\nGoal text.\n\n# Implementation\n\nImpl text.\n', 'utf8');
  assert.equal(await getSpecSectionByRef(specPath, 'NonExistent'), null);
});

test('getSpecSectionByRef returns null for ambiguous query', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-section-ambiguous-'));
  const specPath = path.join(dir, 'spec.md');
  await writeFile(specPath, '# Goals\n\nGoal text.\n\n## Non-goals\n\nNon-goal text.\n', 'utf8');
  // 'goal' is a substring of both 'Goals' and 'Non-goals'
  assert.equal(await getSpecSectionByRef(specPath, 'goal'), null);
});

test('getSpecSectionByRef returns the section text on exact match', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-section-exact-'));
  const specPath = path.join(dir, 'spec.md');
  // Same-level headings: Goals section stops at Implementation
  await writeFile(specPath, '# Goals\n\nGoal text.\n\n# Implementation\n\nImpl text.\n', 'utf8');
  const result = await getSpecSectionByRef(specPath, 'Goals');
  assert.ok(result !== null);
  assert.ok(result!.includes('Goal text.'));
  assert.ok(!result!.includes('Impl text.'));
});

test('createTriageToken produces a non-empty token', () => {
  const t = createTriageToken();
  assert.ok(t.token.length > 0);
  assert.ok(t.issuedAt > 0);
});

test('isValidTriageToken accepts the matching live token', () => {
  const t = createTriageToken();
  assert.equal(isValidTriageToken(t, t.token), true);
});

test('isValidTriageToken rejects wrong token string', () => {
  const t = createTriageToken();
  assert.equal(isValidTriageToken(t, 'wrong-token'), false);
});

test('isValidTriageToken rejects when no active triage (null state)', () => {
  assert.equal(isValidTriageToken(null, 'any-token'), false);
});

test('isValidTriageToken rejects undefined candidate', () => {
  const t = createTriageToken();
  assert.equal(isValidTriageToken(t, undefined), false);
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

test('createSpecComment stores anchor metadata for the requested line', () => {
  const spec = [
    '# Intro',
    '',
    'Opening context',
    '## Goals',
    '',
    'Goal line',
  ].join('\n');

  assert.deepEqual(
    createSpecComment(spec, 'spec/example.md', 5, 'Needs clarification', {
      id: 'c-1',
      createdAt: '2026-04-22T00:00:00.000Z',
    }),
    {
      id: 'c-1',
      specPath: 'spec/example.md',
      line: 5,
      sectionRef: 'Goals',
      excerpt: 'Goal line',
      text: 'Needs clarification',
      createdAt: '2026-04-22T00:00:00.000Z',
    },
  );
});

test('listSpecComments filters by spec path and orders by line then creation time', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-comments-list-'));
  const commentsPath = path.join(dir, 'comments.json');

  await writeSpecComments(commentsPath, [
    {
      id: 'c-3',
      specPath: 'spec/other.md',
      line: 2,
      sectionRef: 'Other',
      excerpt: 'Other line',
      text: 'Ignore me',
      createdAt: '2026-04-22T00:02:00.000Z',
    },
    {
      id: 'c-2',
      specPath: 'spec/example.md',
      line: 4,
      sectionRef: 'Goals',
      excerpt: 'Later same line',
      text: 'Second on same line',
      createdAt: '2026-04-22T00:02:00.000Z',
    },
    {
      id: 'c-1',
      specPath: 'spec/example.md',
      line: 4,
      sectionRef: 'Goals',
      excerpt: 'Earlier same line',
      text: 'First on same line',
      createdAt: '2026-04-22T00:01:00.000Z',
    },
    {
      id: 'c-0',
      specPath: 'spec/example.md',
      line: 2,
      sectionRef: 'Intro',
      excerpt: 'Opening context',
      text: 'Earlier line',
      createdAt: '2026-04-22T00:03:00.000Z',
    },
  ]);

  assert.deepEqual(
    (await listSpecComments(commentsPath, 'spec/example.md')).map((comment) => comment.id),
    ['c-0', 'c-1', 'c-2'],
  );
});
