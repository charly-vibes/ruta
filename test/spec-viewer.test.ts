import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  findSpecLineForSection,
  makeSpecViewerFrame,
  openSpecViewer,
} from '../extensions/spec-viewer';
import { writeSpecComments } from '../extensions/state';
import { readSpecComments } from '../extensions/state';

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

test('makeSpecViewerFrame marks commented lines in the gutter', () => {
  const spec = [
    '# Intro',
    'opening',
    '## Goals',
    'goal text',
  ].join('\n');

  const frame = makeSpecViewerFrame(spec, {
    cursorLine: 3,
    scrollTop: 1,
    bodyHeight: 4,
    width: 24,
    commentLines: new Set([2, 3]),
  });

  assert.deepEqual(frame, [
    '   1  # Intro',
    ' * 2  opening',
    '>* 3  ## Goals',
    '   4  goal text',
  ]);
});

test('openSpecViewer alt+c persists a comment and shows it after reopen', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-viewer-comments-'));
  const specPath = path.join(dir, 'spec.md');
  const originalSpec = [
    '# Intro',
    'opening',
    '## Goals',
    '',
    'goal text',
  ].join('\n');
  await writeFile(specPath, originalSpec, 'utf8');

  const state = { spec_path: 'spec.md' } as any;
  let savedView: any = null;
  const mockCtx = {
    ui: {
      notify: () => {},
      custom: (factory: any) => new Promise<void>((resolve) => {
        savedView = factory(
          { requestRender: () => {} },
          { fg: (_c: string, text: string) => text, bold: (text: string) => text },
          {},
          () => resolve(),
        );
      }),
      editor: async (_title: string, draft: string) => {
        assert.equal(draft, '');
        return 'Need more precision here';
      },
    },
  };

  const openPromise = openSpecViewer(mockCtx as any, dir, state);
  for (let attempt = 0; attempt < 20 && !savedView; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(savedView, 'Viewer should open in custom UI');
  savedView.handleInput('\u001bc');

  let comments = [] as Awaited<ReturnType<typeof readSpecComments>>;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    comments = await readSpecComments(path.join(dir, '.ruta', 'comments.json'));
    if (comments.length === 1) break;
  }

  savedView.handleInput('q');
  await openPromise;

  assert.equal(comments.length, 1);
  assert.deepEqual(comments[0], {
    id: comments[0]!.id,
    specPath: 'spec.md',
    line: 1,
    sectionRef: 'Intro',
    excerpt: '# Intro',
    text: 'Need more precision here',
    createdAt: comments[0]!.createdAt,
  });
  assert.equal(await readFile(specPath, 'utf8'), originalSpec, 'Spec file must remain unchanged');

  let reopenedView: any = null;
  const reopenPromise = openSpecViewer({
    ui: {
      notify: () => {},
      custom: (factory: any) => new Promise<void>((resolve) => {
        reopenedView = factory(
          { requestRender: () => {} },
          { fg: (_c: string, text: string) => text, bold: (text: string) => text },
          {},
          () => resolve(),
        );
      }),
      editor: async () => undefined,
    },
  } as any, dir, state);

  for (let attempt = 0; attempt < 20 && !reopenedView; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(reopenedView, 'Viewer should reopen in custom UI');
  const rendered = reopenedView.render(32);
  assert.ok(rendered.some((line: string) => line.includes('>* 1  # Intro')), 'Reopened viewer should show the persisted comment marker');
  reopenedView.handleInput('q');
  await reopenPromise;
});

test('openSpecViewer ctrl+k ctrl+c persists a comment chord inside the viewer', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-viewer-chord-'));
  await writeFile(path.join(dir, 'spec.md'), ['# Intro', 'opening'].join('\n'), 'utf8');

  const state = { spec_path: 'spec.md' } as any;
  let savedView: any = null;
  const openPromise = openSpecViewer({
    ui: {
      notify: () => {},
      custom: (factory: any) => new Promise<void>((resolve) => {
        savedView = factory(
          { requestRender: () => {} },
          { fg: (_c: string, text: string) => text, bold: (text: string) => text },
          {},
          () => resolve(),
        );
      }),
      editor: async () => 'Chord-created comment',
    },
  } as any, dir, state);

  for (let attempt = 0; attempt < 20 && !savedView; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(savedView, 'Viewer should open in custom UI');

  savedView.handleInput('\u000b');
  savedView.handleInput('\u0003');

  let comments = [] as Awaited<ReturnType<typeof readSpecComments>>;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    comments = await readSpecComments(path.join(dir, '.ruta', 'comments.json'));
    if (comments.length === 1) break;
  }

  savedView.handleInput('q');
  await openPromise;

  assert.equal(comments.length, 1);
  assert.equal(comments[0]?.text, 'Chord-created comment');
});

test('openSpecViewer resets the comment chord when the second key is not ctrl+c', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-viewer-chord-reset-'));
  await writeFile(path.join(dir, 'spec.md'), ['# Intro', 'opening'].join('\n'), 'utf8');

  const state = { spec_path: 'spec.md' } as any;
  let savedView: any = null;
  let editorCalls = 0;
  const openPromise = openSpecViewer({
    ui: {
      notify: () => {},
      custom: (factory: any) => new Promise<void>((resolve) => {
        savedView = factory(
          { requestRender: () => {} },
          { fg: (_c: string, text: string) => text, bold: (text: string) => text },
          {},
          () => resolve(),
        );
      }),
      editor: async () => {
        editorCalls += 1;
        return 'Should not be used';
      },
    },
  } as any, dir, state);

  for (let attempt = 0; attempt < 20 && !savedView; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(savedView, 'Viewer should open in custom UI');

  savedView.handleInput('\u000b');
  savedView.handleInput('x');
  savedView.handleInput('\u0003');
  await new Promise((resolve) => setTimeout(resolve, 25));

  savedView.handleInput('q');
  await openPromise;

  assert.equal(editorCalls, 0);
  assert.deepEqual(await readSpecComments(path.join(dir, '.ruta', 'comments.json')), []);
});

test('openSpecViewer navigates to next and previous commented lines', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-viewer-nav-'));
  await writeFile(path.join(dir, 'spec.md'), ['# Intro', 'opening', '## Goals', 'goal text'].join('\n'), 'utf8');
  await writeSpecComments(path.join(dir, '.ruta', 'comments.json'), [
    {
      id: 'c-1',
      specPath: 'spec.md',
      line: 2,
      sectionRef: 'Intro',
      excerpt: 'opening',
      text: 'First',
      createdAt: '2026-04-22T00:00:00.000Z',
    },
    {
      id: 'c-2',
      specPath: 'spec.md',
      line: 4,
      sectionRef: 'Goals',
      excerpt: 'goal text',
      text: 'Second',
      createdAt: '2026-04-22T00:00:01.000Z',
    },
  ]);

  const state = { spec_path: 'spec.md' } as any;
  let savedView: any = null;
  const openPromise = openSpecViewer({
    ui: {
      notify: () => {},
      custom: (factory: any) => new Promise<void>((resolve) => {
        savedView = factory(
          { requestRender: () => {} },
          { fg: (_c: string, text: string) => text, bold: (text: string) => text },
          {},
          () => resolve(),
        );
      }),
      editor: async () => undefined,
    },
  } as any, dir, state);

  for (let attempt = 0; attempt < 20 && !savedView; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(savedView, 'Viewer should open in custom UI');

  savedView.handleInput(']');
  assert.ok(savedView.render(32).some((line: string) => line.includes('>* 2  opening')));

  savedView.handleInput(']');
  assert.ok(savedView.render(32).some((line: string) => line.includes('>* 4  goal text')));

  savedView.handleInput('[');
  assert.ok(savedView.render(32).some((line: string) => line.includes('>* 2  opening')));

  savedView.handleInput('q');
  await openPromise;
});
