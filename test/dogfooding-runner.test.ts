import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadScenario, materializeScenarioRun, resolveRunDir } from '../scripts/dogfooding-run.mjs';

test('loadScenario resolves scenario metadata and input directory', async () => {
  const repo = await mkdtemp(path.join(tmpdir(), 'ruta-dogfood-load-'));
  const scenarioDir = path.join(repo, 'dogfooding', 'scenarios', 'demo');
  const inputDir = path.join(scenarioDir, 'input');
  await mkdir(inputDir, { recursive: true });
  await writeFile(path.join(scenarioDir, 'scenario.json'), JSON.stringify({
    id: 'demo',
    inputDir: 'dogfooding/scenarios/demo/input',
    entrySpec: 'spec.md',
    recommendedInitCommand: '/ruta-init spec.md'
  }, null, 2));

  const scenario = await loadScenario(repo, 'demo');
  assert.equal(scenario.id, 'demo');
  assert.equal(scenario.entrySpec, 'spec.md');
  assert.equal(scenario.inputDirAbs, path.join(repo, 'dogfooding', 'scenarios', 'demo', 'input'));
});

test('materializeScenarioRun copies tracked inputs into a commit-scoped run directory', async () => {
  const repo = await mkdtemp(path.join(tmpdir(), 'ruta-dogfood-run-'));
  const scenarioDir = path.join(repo, 'dogfooding', 'scenarios', 'demo');
  const inputDir = path.join(scenarioDir, 'input');
  await mkdir(inputDir, { recursive: true });
  await writeFile(path.join(scenarioDir, 'scenario.json'), JSON.stringify({
    id: 'demo',
    name: 'Demo scenario',
    description: 'Demo',
    inputDir: 'dogfooding/scenarios/demo/input',
    entrySpec: 'spec.md',
    recommendedInitCommand: '/ruta-init spec.md',
    snapshotDir: 'dogfooding/snapshots/demo/v0'
  }, null, 2));
  await writeFile(path.join(inputDir, 'spec.md'), '# Spec\n', 'utf8');

  const result = await materializeScenarioRun(repo, 'demo', { commit: 'abc123' });
  const expectedRunDir = resolveRunDir(repo, 'demo', 'abc123');
  assert.equal(result.runDir, expectedRunDir);
  assert.equal(await readFile(path.join(expectedRunDir, 'spec.md'), 'utf8'), '# Spec\n');

  const metadata = JSON.parse(await readFile(path.join(expectedRunDir, 'dogfooding-run.json'), 'utf8'));
  assert.equal(metadata.scenario, 'demo');
  assert.equal(metadata.commit, 'abc123');
  assert.equal(metadata.entrySpec, 'spec.md');
  assert.equal(metadata.promotedSnapshot, 'dogfooding/snapshots/demo/v0');
});

test('materializeScenarioRun refuses to overwrite an existing run directory', async () => {
  const repo = await mkdtemp(path.join(tmpdir(), 'ruta-dogfood-run-existing-'));
  const scenarioDir = path.join(repo, 'dogfooding', 'scenarios', 'demo');
  const inputDir = path.join(scenarioDir, 'input');
  await mkdir(inputDir, { recursive: true });
  await writeFile(path.join(scenarioDir, 'scenario.json'), JSON.stringify({
    id: 'demo',
    inputDir: 'dogfooding/scenarios/demo/input',
    entrySpec: 'spec.md',
    recommendedInitCommand: '/ruta-init spec.md'
  }, null, 2));
  await writeFile(path.join(inputDir, 'spec.md'), '# Spec\n', 'utf8');

  await materializeScenarioRun(repo, 'demo', { commit: 'abc123' });

  await assert.rejects(
    materializeScenarioRun(repo, 'demo', { commit: 'abc123' }),
    /Dogfooding run already exists/
  );
});
