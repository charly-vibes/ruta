import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type RutaMode = "read" | "glossary" | "reimplement";

export interface ModeHistoryEntry {
  mode: RutaMode;
  entered_at: string;
  exited_at?: string;
  reason?: string;
}

export interface RutaProjectState {
  schema_version: "0.2";
  spec_path: string;
  spec_hash: string;
  spec_hash_canonicalization: "nfc-lf-trim-v1";
  current_mode: RutaMode;
  unity_sentence: string | null;
  mode_history: ModeHistoryEntry[];
  gates: Record<string, boolean>;
  prompt_bundle_hash: string;
  scope?: string;
  disclosure_ack?: boolean;
}

export interface GlossaryEntry {
  term: string;
  specDefinition: string;
  userParaphrase: string;
  sourcePassages: string[];
}

export interface GapEntry {
  citation: string;
  decisionForced: string;
  specGuidance: string;
  proposedResolution: string;
  confidence: string;
  gapType: string;
  raisedInSession: string;
}

export const ROUTA_DIR = ".ruta";
export const STATE_PATH = path.join(ROUTA_DIR, "ruta.json");
export const PROMPTS_VERSION_PATH = "prompts-version.txt";

export const MODE_ORDER: RutaMode[] = ["read", "glossary", "reimplement"];

export function canonicalizeSpec(input: string): string {
  const normalized = input.normalize("NFC").replace(/\r\n?/g, "\n");
  const trimmedLines = normalized
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""));
  while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1] === "") {
    trimmedLines.pop();
  }
  return trimmedLines.join("\n");
}

export function sha256Text(input: string): string {
  return `sha256:${createHash("sha256").update(input, "utf8").digest("hex")}`;
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function loadPromptBundleHash(cwd: string): Promise<string> {
  const promptFile = path.join(cwd, PROMPTS_VERSION_PATH);
  const text = await readText(promptFile);
  return text.trim();
}

export async function computeSpecHash(specPath: string): Promise<string> {
  const content = await readText(specPath);
  return sha256Text(canonicalizeSpec(content));
}

export async function loadProjectState(cwd: string): Promise<RutaProjectState | null> {
  const filePath = path.join(cwd, STATE_PATH);
  if (!(await pathExists(filePath))) return null;
  const raw = await readText(filePath);
  return JSON.parse(raw) as RutaProjectState;
}

export async function saveProjectState(cwd: string, state: RutaProjectState): Promise<void> {
  const filePath = path.join(cwd, STATE_PATH);
  await writeText(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function artifactPaths(cwd: string) {
  return {
    specDir: path.join(cwd, "spec"),
    stateDir: path.join(cwd, ROUTA_DIR),
    chavrutaDir: path.join(cwd, ROUTA_DIR, "chavruta"),
    notebook: path.join(cwd, "notebook.md"),
    glossary: path.join(cwd, "glossary.md"),
    propositions: path.join(cwd, "propositions.md"),
    properties: path.join(cwd, "properties.md"),
    contracts: path.join(cwd, "contracts.md"),
    gaps: path.join(cwd, "gaps.md"),
    perspectivesDir: path.join(cwd, "perspectives"),
    achDir: path.join(cwd, "ach"),
    premortem: path.join(cwd, "premortem.md"),
    synthesis: path.join(cwd, "synthesis.md"),
  };
}

export async function scaffoldProject(cwd: string, sourceSpecPath: string, disclosureAck: boolean): Promise<RutaProjectState> {
  const absSource = path.resolve(cwd, sourceSpecPath);
  const specBasename = path.basename(absSource);
  const paths = artifactPaths(cwd);

  await ensureDir(paths.specDir);
  await ensureDir(paths.stateDir);
  await ensureDir(paths.chavrutaDir);
  await ensureDir(paths.perspectivesDir);
  await ensureDir(paths.achDir);

  const targetSpec = path.join(paths.specDir, specBasename);
  const original = await readText(absSource);
  await writeText(targetSpec, original);

  const promptBundleHash = await loadPromptBundleHash(cwd);
  await writeText(path.join(paths.stateDir, "prompts-version.txt"), `${promptBundleHash}\n`);

  const state: RutaProjectState = {
    schema_version: "0.2",
    spec_path: path.relative(cwd, targetSpec),
    spec_hash: await computeSpecHash(targetSpec),
    spec_hash_canonicalization: "nfc-lf-trim-v1",
    current_mode: "read",
    unity_sentence: null,
    mode_history: [{ mode: "read", entered_at: new Date().toISOString() }],
    gates: {
      read_unlocked: false,
      glossary_unlocked: false,
      reimplement_unlocked: false,
    },
    prompt_bundle_hash: promptBundleHash,
    disclosure_ack: disclosureAck,
  };

  await saveProjectState(cwd, state);
  await writeIfMissing(paths.notebook, "# Notebook\n\n- " + timestampPrefix() + " Things I don't know yet:\n");
  await writeIfMissing(paths.glossary, "# Glossary\n\n");
  await writeIfMissing(paths.propositions, "# Propositions\n\n");
  await writeIfMissing(paths.properties, "# Properties\n\n");
  await writeIfMissing(paths.contracts, "# Contracts\n\n");
  await writeIfMissing(paths.gaps, "# Gaps\n\n");
  await writeIfMissing(path.join(paths.perspectivesDir, "security.md"), "# Security perspective\n\n");
  await writeIfMissing(path.join(paths.perspectivesDir, "operator.md"), "# Operator perspective\n\n");
  await writeIfMissing(path.join(paths.perspectivesDir, "downstream.md"), "# Downstream perspective\n\n");
  await writeIfMissing(path.join(paths.perspectivesDir, "skeptic.md"), "# Skeptic perspective\n\n");
  await writeIfMissing(path.join(paths.perspectivesDir, "junior.md"), "# Junior perspective\n\n");
  await writeIfMissing(paths.premortem, "# Premortem\n\n");
  await writeIfMissing(paths.synthesis, "# Synthesis\n\n");
  return state;
}

export async function writeIfMissing(filePath: string, content: string): Promise<void> {
  if (await pathExists(filePath)) return;
  await writeText(filePath, content);
}

export async function appendMarkdown(filePath: string, content: string): Promise<void> {
  const existing = (await pathExists(filePath)) ? await readText(filePath) : "";
  await writeText(filePath, `${existing}${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}${content}`);
}

export function timestampPrefix(date = new Date()): string {
  return `[${date.toISOString()}]`;
}

export function describeAccess(mode: RutaMode): string {
  if (mode === "read") return "no AI";
  if (mode === "glossary") return "AI: narrow";
  return "AI: dialog";
}

export function modeFragment(mode: RutaMode): string {
  switch (mode) {
    case "read":
      return "read mode";
    case "glossary":
      return "glossary mode";
    case "reimplement":
      return "reimplement mode";
  }
}

export function activeToolsForMode(mode: RutaMode, triageActive = false): string[] {
  if (mode === "read") return ["read"];
  if (mode === "glossary") return ["read", "ruta_test_paraphrase"];
  const tools = ["read", "ruta_gap_probe"];
  if (triageActive) tools.push("ruta_add_gap");
  return tools;
}

export function canTransition(current: RutaMode, target: RutaMode, gates: Record<string, boolean>): { ok: true } | { ok: false; reason: string } {
  if (current === target) return { ok: true };
  const currentIndex = MODE_ORDER.indexOf(current);
  const targetIndex = MODE_ORDER.indexOf(target);
  if (targetIndex <= currentIndex) return { ok: true };
  if (target === "glossary" && !gates.read_unlocked) {
    return { ok: false, reason: "read gate not satisfied: notebook.md needs at least one entry and unity sentence must be set" };
  }
  if (target === "reimplement" && !gates.glossary_unlocked) {
    return { ok: false, reason: "glossary gate not satisfied: glossary.md needs at least one non-empty paraphrase" };
  }
  return { ok: true };
}

export async function updateMode(cwd: string, state: RutaProjectState, target: RutaMode, reason?: string): Promise<RutaProjectState> {
  if (state.current_mode === target) return state;
  const now = new Date().toISOString();
  const history = [...state.mode_history];
  const last = history[history.length - 1];
  if (last && !last.exited_at) {
    last.exited_at = now;
    if (reason) last.reason = reason;
  }
  history.push({ mode: target, entered_at: now });
  const next = { ...state, current_mode: target, mode_history: history };
  await saveProjectState(cwd, next);
  return next;
}

export async function verifySpecHash(cwd: string, state: RutaProjectState): Promise<{ matches: boolean; actual: string }> {
  const specPath = path.join(cwd, state.spec_path);
  const actual = await computeSpecHash(specPath);
  return { matches: actual === state.spec_hash, actual };
}

export async function resetModeStateForSpecMismatch(cwd: string, state: RutaProjectState, newHash: string, declined = false): Promise<RutaProjectState> {
  const next: RutaProjectState = {
    ...state,
    spec_hash: newHash,
    current_mode: "read",
    gates: Object.fromEntries(Object.keys(state.gates).map((key) => [key, false])),
    mode_history: [
      ...state.mode_history,
      {
        mode: "read",
        entered_at: new Date().toISOString(),
        reason: declined ? "spec_hash_mismatch_declined_reset" : "spec_hash_mismatch",
      },
    ],
  };
  await saveProjectState(cwd, next);
  return next;
}

export async function readGlossaryEntries(filePath: string): Promise<GlossaryEntry[]> {
  if (!(await pathExists(filePath))) return [];
  const text = await readText(filePath);
  const chunks = text.split(/^##\s+/m).slice(1);
  return chunks.map((chunk) => {
    const lines = chunk.split("\n");
    const term = lines[0].trim();
    const body = lines.slice(1).join("\n");
    return {
      term,
      specDefinition: extractLabeledBlock(body, "Spec definition"),
      userParaphrase: extractLabeledBlock(body, "Your paraphrase"),
      sourcePassages: extractSourcePassages(body),
    };
  });
}

export function extractLabeledBlock(body: string, label: string): string {
  const pattern = new RegExp(`\\*\\*${escapeRegExp(label)}:?\\*\\*\\s*(?:\\([^)]*\\))?\\s*\\n?([\\s\\S]*?)(?=\\n\\*\\*|$)`, "m");
  const match = body.match(pattern);
  return match?.[1]?.trim() ?? "";
}

export function extractSourcePassages(body: string): string[] {
  const block = extractLabeledBlock(body, "Source passages");
  return block
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export function stripMarkdownFormatting(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`>#-]/g, "")
    .trim();
}

export async function glossaryGateSatisfied(filePath: string): Promise<boolean> {
  const entries = await readGlossaryEntries(filePath);
  return entries.some((entry) => stripMarkdownFormatting(entry.userParaphrase).length > 0);
}

export async function readGateSatisfied(notebookPath: string, unitySentence: string | null): Promise<boolean> {
  if (!unitySentence || !unitySentence.trim()) return false;
  if (!(await pathExists(notebookPath))) return false;
  const text = await readText(notebookPath);
  return text.replace(/^#.*$/gm, "").trim().length > 0;
}

export async function readGapEntries(filePath: string): Promise<GapEntry[]> {
  if (!(await pathExists(filePath))) return [];
  const text = await readText(filePath);
  const chunks = text.split(/^###\s+/m).slice(1);
  return chunks.map((chunk) => {
    const body = chunk.split("\n").slice(1).join("\n");
    return {
      citation: extractSimpleField(body, "Citation"),
      decisionForced: extractSimpleField(body, "Decision forced"),
      specGuidance: extractSimpleField(body, "Spec's guidance"),
      proposedResolution: extractSimpleField(body, "Your proposed resolution"),
      confidence: extractSimpleField(body, "Confidence"),
      gapType: extractSimpleField(body, "Gap type"),
      raisedInSession: extractSimpleField(body, "Raised in session"),
    };
  });
}

export function extractSimpleField(body: string, field: string): string {
  const pattern = new RegExp(`\\*\\*${escapeRegExp(field)}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|$)`, "m");
  const match = body.match(pattern);
  return match?.[1]?.trim() ?? "";
}

export async function reimplementGateSatisfied(specPath: string, gapsPath: string): Promise<boolean> {
  const headings = await readMajorSectionHeadings(specPath);
  const gaps = await readGapEntries(gapsPath);
  if (headings.length === 0) return gaps.length > 0;
  return gaps.length >= headings.length;
}

export async function readMajorSectionHeadings(specPath: string): Promise<string[]> {
  const text = await readText(specPath);
  return text
    .split("\n")
    .filter((line) => /^(#|##)\s+/.test(line))
    .map((line) => line.replace(/^(#|##)\s+/, "").trim());
}

export function formatGlossaryEntry(term: string): string {
  return `## ${term}\n\n**Spec definition** (§):\n> \n\n**Your paraphrase:**\n\n**Source passages:**\n- § — definition\n`;
}

export function formatGapEntry(index: number, seed?: Partial<GapEntry>): string {
  const id = String(index).padStart(3, "0");
  return `### G-${id}\n\n**Citation:** ${seed?.citation ?? "§"}\n**Decision forced:** ${seed?.decisionForced ?? ""}\n**Spec's guidance:** ${seed?.specGuidance ?? ""}\n**Your proposed resolution:** ${seed?.proposedResolution ?? ""}\n**Confidence:** ${seed?.confidence ?? "low"}\n**Gap type:** ${seed?.gapType ?? "likely spec silence (not my ignorance)"}\n**Raised in session:** ${seed?.raisedInSession ?? new Date().toISOString().slice(0, 10)}\n`;
}

export async function nextGapIndex(filePath: string): Promise<number> {
  const gaps = await readGapEntries(filePath);
  return gaps.length + 1;
}

export async function appendGapEntry(filePath: string, seed?: Partial<GapEntry>): Promise<void> {
  const entry = formatGapEntry(await nextGapIndex(filePath), seed);
  await appendMarkdown(filePath, `\n${entry}\n`);
}

export async function getSpecSectionByRef(specPath: string, sectionRef: string): Promise<string> {
  const text = await readText(specPath);
  const trimmed = sectionRef.trim();
  const headingPattern = new RegExp(`^(#{1,6})\\s+.*${escapeRegExp(trimmed)}.*$`, "mi");
  const headingMatch = text.match(headingPattern);
  if (!headingMatch || headingMatch.index === undefined) {
    return text;
  }
  const start = headingMatch.index;
  const level = headingMatch[1].length;
  const tail = text.slice(start);
  const nextHeading = tail.slice(headingMatch[0].length).match(new RegExp(`\\n#{1,${level}}\\s+`, "m"));
  const end = nextHeading && nextHeading.index !== undefined ? start + headingMatch[0].length + nextHeading.index : text.length;
  return text.slice(start, end).trim();
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}
