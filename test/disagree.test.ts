import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSecondaryModel, detectDisagreement, formatDisagreementReport } from '../extensions/disagree';

const makeModel = (id: string, provider: string) => ({ id, provider, name: id } as any);

test('selectSecondaryModel picks configured model when available', () => {
  const available = [
    makeModel('gpt-4o', 'openai'),
    makeModel('claude-3-5-sonnet', 'anthropic'),
    makeModel('gemini-pro', 'google'),
  ];
  const primary = makeModel('claude-3-5-sonnet', 'anthropic');
  const result = selectSecondaryModel(available, primary, 'gemini-pro');
  assert.equal(result?.id, 'gemini-pro');
});

test('selectSecondaryModel falls back to first different-provider model when not configured', () => {
  const available = [
    makeModel('gpt-4o', 'openai'),
    makeModel('claude-3-5-sonnet', 'anthropic'),
  ];
  const primary = makeModel('claude-3-5-sonnet', 'anthropic');
  const result = selectSecondaryModel(available, primary, undefined);
  assert.equal(result?.id, 'gpt-4o');
});

test('selectSecondaryModel returns null when no other provider is available', () => {
  const available = [makeModel('claude-3-5-sonnet', 'anthropic')];
  const primary = makeModel('claude-3-5-sonnet', 'anthropic');
  assert.equal(selectSecondaryModel(available, primary, undefined), null);
});

test('selectSecondaryModel falls back to different-provider model when configured model is absent', () => {
  const available = [makeModel('gpt-4o', 'openai')];
  const primary = makeModel('claude-3-5-sonnet', 'anthropic');
  // configured model not in available list → fall back to first different-provider
  const result = selectSecondaryModel(available, primary, 'nonexistent-model');
  assert.equal(result?.id, 'gpt-4o');
});

test('detectDisagreement returns false when either input is empty', () => {
  assert.equal(detectDisagreement('', 'The session token should be embedded in the JWT.'), false);
  assert.equal(detectDisagreement('Store tokens server-side.', ''), false);
  assert.equal(detectDisagreement('', ''), false);
});

test('detectDisagreement returns false for near-identical texts', () => {
  const a = 'The system shall store the session token in an encrypted cookie.';
  const b = 'The system shall store the session token in an encrypted cookie.';
  assert.equal(detectDisagreement(a, b), false);
});

test('detectDisagreement returns true for clearly different texts', () => {
  const a = 'The session token must be stored server-side and never transmitted.';
  const b = 'The session token should be embedded in the JWT payload for stateless auth.';
  assert.equal(detectDisagreement(a, b), true);
});

test('formatDisagreementReport flags disagreement with probe suggestion', () => {
  const report = formatDisagreementReport({
    primary: 'Store tokens server-side.',
    secondary: 'Embed tokens in JWT.',
    primaryId: 'claude-3',
    secondaryId: 'gpt-4o',
    disagrees: true,
    section: 'Authentication',
  });
  assert.ok(report.includes('DISAGREEMENT'));
  assert.ok(report.includes('/ruta-probe') || report.includes('ruta_gap_probe'));
  assert.ok(report.includes('Authentication'));
});

test('formatDisagreementReport notes agreement caveat when models agree', () => {
  const report = formatDisagreementReport({
    primary: 'Use HMAC-SHA256 for signing.',
    secondary: 'Use HMAC-SHA256 for signing.',
    primaryId: 'claude-3',
    secondaryId: 'gpt-4o',
    disagrees: false,
    section: 'Signing',
  });
  assert.ok(!report.includes('DISAGREEMENT'));
  assert.ok(report.toLowerCase().includes('agreement') || report.toLowerCase().includes('not evidence'));
});
