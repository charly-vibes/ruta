import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEGRADED_DISCLOSURE_FIXTURES,
  DISCLOSURE_FIXTURES,
  INVALID_HELP_TOPICS,
} from './disclosure-fixtures';

const EXPECTED_STATE_NAMES = ['pre-init', 'read', 'glossary', 'reimplement'] as const;

test('disclosure fixtures cover pre-init and each ruta mode', () => {
  assert.deepEqual(Object.keys(DISCLOSURE_FIXTURES), EXPECTED_STATE_NAMES);

  for (const name of EXPECTED_STATE_NAMES) {
    const fixture = DISCLOSURE_FIXTURES[name];
    assert.equal(fixture.name, name);
    assert.ok(fixture.availableNow.length > 0, `${name} should expose at least one command`);
  }
});

test('mode fixtures carry next-unlock guidance for forward progress', () => {
  for (const name of EXPECTED_STATE_NAMES.filter((value) => value !== 'pre-init')) {
    const fixture = DISCLOSURE_FIXTURES[name];
    assert.ok(fixture.nextUnlock, `${name} should define next-unlock guidance`);
    assert.ok(fixture.nextUnlock?.transitionCommand.startsWith('/ruta-'));
    assert.ok((fixture.nextUnlock?.supportingCommands.length ?? 0) > 0);
  }
});

test('degraded disclosure fixtures fall back to bootstrap commands and recovery hints', () => {
  const bootstrap = DISCLOSURE_FIXTURES['pre-init'].availableNow;
  assert.equal(DEGRADED_DISCLOSURE_FIXTURES.length, 2);

  for (const fixture of DEGRADED_DISCLOSURE_FIXTURES) {
    assert.deepEqual(fixture.availableNow, bootstrap);
    assert.ok(fixture.recoveryHint.includes('/ruta-init'));
    assert.ok(fixture.recoveryHint.includes('/ruta-resume'));
  }
});

test('invalid help topic fixtures are non-empty and ruta-shaped', () => {
  assert.ok(INVALID_HELP_TOPICS.length > 0);
  for (const topic of INVALID_HELP_TOPICS) {
    assert.ok(topic.length > 0);
    assert.ok(topic.includes('bogus') || topic.includes('uni-'));
  }
});
