import assert from 'node:assert/strict';
import test from 'node:test';
import { makeTextViewerFrame, openTextViewer } from '../extensions/text-viewer';

test('makeTextViewerFrame returns visible lines for the current scroll window', () => {
  const text = ['one', 'two', 'three', 'four'].join('\n');
  const frame = makeTextViewerFrame(text, {
    scrollTop: 2,
    bodyHeight: 2,
    width: 20,
  });

  assert.deepEqual(frame, ['two', 'three']);
});

test('makeTextViewerFrame wraps long lines to fit width', () => {
  const text = 'a very long line that should not fit';
  const frame = makeTextViewerFrame(text, {
    scrollTop: 1,
    bodyHeight: 10,
    width: 12,
  });

  // line wraps into multiple entries, none longer than width
  assert.ok(frame.length > 1, 'should wrap into multiple lines');
  for (const line of frame) {
    assert.ok(line.length <= 12, `line "${line}" exceeds width`);
  }
  // content is preserved
  assert.equal(frame.join(' '), text);
});

test('openTextViewer uses custom read-only UI instead of editor', async () => {
  let customCalled = false;
  let editorCalled = false;
  let savedView: any = null;

  const ctx = {
    hasUI: true,
    ui: {
      custom: (factory: any) => new Promise<void>((resolve) => {
        customCalled = true;
        savedView = factory(
          { requestRender: () => {} },
          { fg: (_c: string, t: string) => t, bold: (t: string) => t },
          {},
          () => resolve(),
        );
      }),
      editor: async () => {
        editorCalled = true;
        return '';
      },
    },
  };

  const promise = openTextViewer(ctx as any, 'ruta tutorial', 'line 1\nline 2');
  assert.equal(customCalled, true);
  assert.equal(typeof savedView.render, 'function');
  savedView.handleInput('q');
  await promise;
  assert.equal(editorCalled, false);
});
