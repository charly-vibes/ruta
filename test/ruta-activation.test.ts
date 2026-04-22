import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import ruta from '../extensions/ruta';
import { computeSpecUUID, scaffoldProject, scaffoldSession, writeActiveEntry, writeText } from '../extensions/state';

type Listener = (event: any, ctx: any) => Promise<any> | any;

function makeFakePi() {
  const listeners = new Map<string, Listener>();
  const commands = new Map<string, any>();

  const api = {
    on(event: string, handler: Listener) {
      listeners.set(event, handler);
    },
    registerCommand(name: string, spec: any) {
      commands.set(name, spec);
    },
    registerTool() {
      // no-op for test
    },
    setActiveTools() {
      // no-op for test
    },
  };

  return { api, listeners, commands };
}

function makeCtx(
  cwd: string,
  options?: { confirmResults?: boolean[]; inputResults?: string[] },
) {
  const notifications: Array<{ message: string; level: string }> = [];
  const status: Array<{ key: string; value: string | undefined }> = [];
  const widgets: Array<{ key: string; value: string[] | undefined }> = [];
  const confirms: Array<{ title: string; message: string }> = [];
  const prompts: string[] = [];
  const confirmResults = [...(options?.confirmResults ?? [])];
  const inputResults = [...(options?.inputResults ?? [])];

  const ctx = {
    cwd,
    hasUI: false,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
      setStatus(key: string, value: string | undefined) {
        status.push({ key, value });
      },
      setWidget(key: string, value: string[] | undefined) {
        widgets.push({ key, value });
      },
      async confirm(title: string, message: string) {
        confirms.push({ title, message });
        return confirmResults.shift() ?? false;
      },
      async input(prompt: string) {
        prompts.push(prompt);
        return inputResults.shift() ?? '';
      },
    },
  };

  return { ctx, notifications, status, widgets, confirms, prompts };
}

test('ruta guardrails are inactive on session start until explicitly started', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-activation-'));
  await writeText(path.join(dir, 'prompts-version.txt'), 'prompt-hash\n');
  await writeText(path.join(dir, 'spec.md'), '# Spec\n\nBody\n');
  const uuid = computeSpecUUID(dir, 'spec.md');
  const sessionDir = path.join(dir, '.ruta', uuid, 'session-1');
  await scaffoldSession(dir, 'spec.md', sessionDir);
  await writeActiveEntry(dir, uuid, 'session-1', 'spec.md');

  const fake = makeFakePi();
  ruta(fake.api as any);

  const { ctx, notifications, status } = makeCtx(dir);

  const onSessionStart = fake.listeners.get('session_start');
  assert.ok(onSessionStart, 'session_start handler should be registered');
  await onSessionStart!({}, ctx);

  const onInput = fake.listeners.get('input');
  assert.ok(onInput, 'input handler should be registered');

  const beforeStart = await onInput!({ text: 'summarize this spec' }, ctx);
  assert.deepEqual(beforeStart, { action: 'continue' });
  assert.equal(notifications.length, 0, 'no guardrail notifications before /ruta-start');
  assert.equal(status.length, 0, 'status widget should stay hidden before /ruta-start');

  const start = fake.commands.get('ruta-start');
  assert.ok(start, 'ruta-start command should be registered');
  await start.handler('', ctx);

  const afterStart = await onInput!({ text: 'summarize this spec' }, ctx);
  assert.deepEqual(afterStart, { action: 'handled' });
  assert.ok(
    notifications.some((entry) => entry.message.includes('AI is disabled in read mode')),
    'read mode guardrail should block free-form chat after activation',
  );

  const exit = fake.commands.get('ruta-exit');
  assert.ok(exit, 'ruta-exit command should be registered');
  await exit.handler('', ctx);

  const afterExit = await onInput!({ text: 'summarize this spec' }, ctx);
  assert.deepEqual(afterExit, { action: 'continue' });
});

test('ruta-init scaffolds session-1 under .ruta/<uuid>/ and writes active.json', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-init-session-layout-'));
  await writeText(path.join(dir, 'prompts-version.txt'), 'prompt-hash\n');
  await writeText(path.join(dir, 'spec.md'), '# Spec\n\nBody\n');

  const fake = makeFakePi();
  ruta(fake.api as any);

  const { ctx } = makeCtx(dir, { confirmResults: [true] });
  const init = fake.commands.get('ruta-init');
  assert.ok(init, 'ruta-init command should be registered');

  await init.handler('spec.md', ctx);

  const uuid = computeSpecUUID(dir, 'spec.md');
  await access(path.join(dir, '.ruta', uuid, 'session-1', 'state.json'));
  const active = JSON.parse(await readFile(path.join(dir, '.ruta', 'active.json'), 'utf8')) as Record<string, { spec_uuid: string; session_id: string }>;
  assert.equal(active[String(process.pid)]?.spec_uuid, uuid);
  assert.equal(active[String(process.pid)]?.session_id, 'session-1');
});

test('ruta-init on an existing spec prompts for resume or fresh', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-init-resume-prompt-'));
  await writeText(path.join(dir, 'prompts-version.txt'), 'prompt-hash\n');
  await writeText(path.join(dir, 'spec.md'), '# Spec\n\nBody\n');

  const uuid = computeSpecUUID(dir, 'spec.md');
  const sessionDir = path.join(dir, '.ruta', uuid, 'session-1');
  await mkdir(path.join(dir, '.ruta', uuid), { recursive: true });
  await writeFile(path.join(dir, '.ruta', uuid, 'meta.json'), '{"source_spec_path":"spec.md","sessions":["session-1"]}\n', 'utf8');
  await scaffoldSession(dir, 'spec.md', sessionDir);

  const fake = makeFakePi();
  ruta(fake.api as any);

  const { ctx, prompts } = makeCtx(dir, { confirmResults: [true], inputResults: ['r'] });
  const init = fake.commands.get('ruta-init');
  assert.ok(init, 'ruta-init command should be registered');

  await init.handler('spec.md', ctx);

  assert.ok(prompts.some((prompt) => prompt.toLowerCase().includes('resume')));
});

test('ruta-init can create the next numbered session when user chooses fresh', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-init-fresh-session-'));
  await writeText(path.join(dir, 'prompts-version.txt'), 'prompt-hash\n');
  await writeText(path.join(dir, 'spec.md'), '# Spec\n\nBody\n');

  const uuid = computeSpecUUID(dir, 'spec.md');
  await mkdir(path.join(dir, '.ruta', uuid), { recursive: true });
  await writeFile(path.join(dir, '.ruta', uuid, 'meta.json'), '{"source_spec_path":"spec.md","sessions":["session-1"]}\n', 'utf8');
  await scaffoldSession(dir, 'spec.md', path.join(dir, '.ruta', uuid, 'session-1'));

  const fake = makeFakePi();
  ruta(fake.api as any);

  const { ctx } = makeCtx(dir, { confirmResults: [true], inputResults: ['n'] });
  const init = fake.commands.get('ruta-init');
  assert.ok(init, 'ruta-init command should be registered');

  await init.handler('spec.md', ctx);

  await access(path.join(dir, '.ruta', uuid, 'session-2', 'state.json'));
});

test('ruta-init warns when another live pid already owns the same session', { concurrency: false }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-init-parallel-warning-'));
  await writeText(path.join(dir, 'prompts-version.txt'), 'prompt-hash\n');
  await writeText(path.join(dir, 'spec.md'), '# Spec\n\nBody\n');

  const uuid = computeSpecUUID(dir, 'spec.md');
  const sessionDir = path.join(dir, '.ruta', uuid, 'session-1');
  await mkdir(path.join(dir, '.ruta', uuid), { recursive: true });
  await writeFile(path.join(dir, '.ruta', uuid, 'meta.json'), '{"source_spec_path":"spec.md","sessions":["session-1"]}\n', 'utf8');
  await scaffoldSession(dir, 'spec.md', sessionDir);
  await writeFile(
    path.join(dir, '.ruta', 'active.json'),
    `${JSON.stringify({
      ['424242']: {
        spec_uuid: uuid,
        session_id: 'session-1',
        source_spec_path: 'spec.md',
        started_at: '2026-04-22T00:00:00.000Z',
      },
    }, null, 2)}\n`,
    'utf8',
  );

  const originalKill = process.kill;
  // @ts-expect-error test override
  process.kill = ((pid: number) => {
    if (pid === 424242 || pid === process.pid) return true;
    const error = new Error('missing') as NodeJS.ErrnoException;
    error.code = 'ESRCH';
    throw error;
  }) as typeof process.kill;

  try {
    const fake = makeFakePi();
    ruta(fake.api as any);

    const { ctx, notifications } = makeCtx(dir, { confirmResults: [true], inputResults: ['r'] });
    const init = fake.commands.get('ruta-init');
    assert.ok(init, 'ruta-init command should be registered');

    await init.handler('spec.md', ctx);

    assert.ok(notifications.some((entry) => entry.message.toLowerCase().includes('concurrent')));
  } finally {
    process.kill = originalKill;
  }
});

test('ruta-resume command is registered and resumes latest session for a path without prompting fresh', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-resume-path-'));
  await writeText(path.join(dir, 'prompts-version.txt'), 'prompt-hash\n');
  await writeText(path.join(dir, 'spec.md'), '# Spec\n\nBody\n');

  const uuid = computeSpecUUID(dir, 'spec.md');
  await mkdir(path.join(dir, '.ruta', uuid), { recursive: true });
  await writeFile(path.join(dir, '.ruta', uuid, 'meta.json'), '{"source_spec_path":"spec.md","sessions":["session-1","session-2"]}\n', 'utf8');
  await scaffoldSession(dir, 'spec.md', path.join(dir, '.ruta', uuid, 'session-1'));
  await scaffoldSession(dir, 'spec.md', path.join(dir, '.ruta', uuid, 'session-2'));

  const fake = makeFakePi();
  ruta(fake.api as any);

  const resume = fake.commands.get('ruta-resume');
  assert.ok(resume, 'ruta-resume command should be registered');

  const { ctx, prompts } = makeCtx(dir);
  await resume.handler('spec.md', ctx);

  assert.deepEqual(prompts, []);
  const active = JSON.parse(await readFile(path.join(dir, '.ruta', 'active.json'), 'utf8')) as Record<string, { session_id: string }>;
  assert.equal(active[String(process.pid)]?.session_id, 'session-2');
});

test('ruta-resume with no args shows a session picker', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-resume-picker-'));
  await writeText(path.join(dir, 'prompts-version.txt'), 'prompt-hash\n');
  await writeText(path.join(dir, 'spec.md'), '# Spec\n\nBody\n');

  const uuid = computeSpecUUID(dir, 'spec.md');
  await mkdir(path.join(dir, '.ruta', uuid), { recursive: true });
  await writeFile(path.join(dir, '.ruta', uuid, 'meta.json'), '{"source_spec_path":"spec.md","sessions":["session-1"]}\n', 'utf8');
  await scaffoldSession(dir, 'spec.md', path.join(dir, '.ruta', uuid, 'session-1'));

  const fake = makeFakePi();
  ruta(fake.api as any);

  const resume = fake.commands.get('ruta-resume');
  assert.ok(resume, 'ruta-resume command should be registered');

  const { ctx, prompts } = makeCtx(dir, { inputResults: ['1'] });
  await resume.handler('', ctx);

  assert.ok(prompts.some((prompt) => prompt.toLowerCase().includes('pick a session')));
});

test('ruta-switch shows guidance when no sessions exist and updates active session when one is picked', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-switch-'));
  await writeText(path.join(dir, 'prompts-version.txt'), 'prompt-hash\n');
  await writeText(path.join(dir, 'spec.md'), '# Spec\n\nBody\n');

  const fake = makeFakePi();
  ruta(fake.api as any);

  const switchCommand = fake.commands.get('ruta-switch');
  assert.ok(switchCommand, 'ruta-switch command should be registered');

  const emptyCtx = makeCtx(dir);
  await switchCommand.handler('', emptyCtx.ctx);
  assert.ok(emptyCtx.notifications.some((entry) => entry.message.includes('No sessions yet')));

  const uuid = computeSpecUUID(dir, 'spec.md');
  await mkdir(path.join(dir, '.ruta', uuid), { recursive: true });
  await writeFile(path.join(dir, '.ruta', uuid, 'meta.json'), '{"source_spec_path":"spec.md","sessions":["session-1"]}\n', 'utf8');
  await scaffoldSession(dir, 'spec.md', path.join(dir, '.ruta', uuid, 'session-1'));

  const populatedCtx = makeCtx(dir, { inputResults: ['1'] });
  await switchCommand.handler('', populatedCtx.ctx);

  const active = JSON.parse(await readFile(path.join(dir, '.ruta', 'active.json'), 'utf8')) as Record<string, { session_id: string }>;
  assert.equal(active[String(process.pid)]?.session_id, 'session-1');
});

test('ruta commands do not implicitly reactivate guardrails after /ruta-exit', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ruta-activation-exit-'));
  await writeText(path.join(dir, 'prompts-version.txt'), 'prompt-hash\n');
  await writeText(path.join(dir, 'spec.md'), '# Spec\n\nBody\n');
  const uuid = computeSpecUUID(dir, 'spec.md');
  const sessionDir = path.join(dir, '.ruta', uuid, 'session-1');
  await scaffoldSession(dir, 'spec.md', sessionDir);
  await writeActiveEntry(dir, uuid, 'session-1', 'spec.md');

  const fake = makeFakePi();
  ruta(fake.api as any);

  const { ctx, notifications } = makeCtx(dir);

  const onSessionStart = fake.listeners.get('session_start');
  assert.ok(onSessionStart, 'session_start handler should be registered');
  await onSessionStart!({}, ctx);

  const start = fake.commands.get('ruta-start');
  const exit = fake.commands.get('ruta-exit');
  const statusCmd = fake.commands.get('ruta-status');
  const onInput = fake.listeners.get('input');
  assert.ok(start && exit && statusCmd && onInput, 'required command/listener hooks should be registered');

  await start.handler('', ctx);
  await exit.handler('', ctx);

  const countBeforeStatus = notifications.length;
  await statusCmd.handler('', ctx);

  const maybeReactivatedNotice = notifications.slice(countBeforeStatus).find((entry) =>
    entry.message.includes('ruta guardrails enabled for this session'),
  );
  assert.equal(maybeReactivatedNotice, undefined, '/ruta-status should not reactivate ruta guardrails');

  const afterStatus = await onInput!({ text: 'summarize this spec' }, ctx);
  assert.deepEqual(afterStatus, { action: 'continue' }, 'free-form input should stay unguarded after /ruta-status');
});
