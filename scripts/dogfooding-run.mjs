import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, writeFile, cp, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const SCENARIOS_DIR = path.join('dogfooding', 'scenarios');
const RUNS_DIR = path.join('dogfooding', 'runs');

export async function loadScenario(repoRoot, scenarioId) {
  const scenarioPath = path.join(repoRoot, SCENARIOS_DIR, scenarioId, 'scenario.json');
  const raw = await readFile(scenarioPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    scenarioPath,
    inputDirAbs: path.join(repoRoot, parsed.inputDir),
  };
}

export async function detectCommit(repoRoot) {
  const { stdout } = await execFile('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD']);
  return stdout.trim();
}

export function resolveRunDir(repoRoot, scenarioId, commit) {
  return path.join(repoRoot, RUNS_DIR, scenarioId, commit);
}

export async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function materializeScenarioRun(repoRoot, scenarioId, options = {}) {
  const scenario = await loadScenario(repoRoot, scenarioId);
  const commit = options.commit ?? await detectCommit(repoRoot);
  const runDir = resolveRunDir(repoRoot, scenarioId, commit);

  if (await pathExists(runDir)) {
    throw new Error(`Dogfooding run already exists: ${path.relative(repoRoot, runDir)}`);
  }

  await mkdir(path.dirname(runDir), { recursive: true });
  await cp(scenario.inputDirAbs, runDir, { recursive: true });

  const metadata = {
    scenario: scenario.id,
    name: scenario.name,
    description: scenario.description,
    commit,
    createdAt: new Date().toISOString(),
    entrySpec: scenario.entrySpec,
    recommendedInitCommand: scenario.recommendedInitCommand,
    sourceScenario: path.relative(repoRoot, scenario.scenarioPath),
    promotedSnapshot: scenario.snapshotDir ?? null,
  };

  await writeFile(path.join(runDir, 'dogfooding-run.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return { runDir, metadata, scenario };
}

export function parseArgs(argv) {
  const args = [...argv];
  const scenarioId = args.shift();
  let commit;

  while (args.length > 0) {
    const token = args.shift();
    if (token === '--commit') {
      commit = args.shift();
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!scenarioId) {
    throw new Error('Usage: node scripts/dogfooding-run.mjs <scenario-id> [--commit <sha>]');
  }

  return { scenarioId, commit };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const { scenarioId, commit } = parseArgs(process.argv.slice(2));
  const { runDir, metadata } = await materializeScenarioRun(repoRoot, scenarioId, { commit });

  console.log(`Materialized ${scenarioId} at ${path.relative(repoRoot, runDir)}`);
  console.log(`- commit: ${metadata.commit}`);
  console.log(`- entry spec: ${metadata.entrySpec}`);
  console.log(`- init: ${metadata.recommendedInitCommand}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
