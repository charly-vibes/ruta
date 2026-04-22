import { createHash, randomUUID } from "node:crypto";
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
  source_spec_path?: string;
  spec_hash: string;
  spec_hash_canonicalization: "nfc-lf-trim-v1";
  current_mode: RutaMode;
  unity_sentence: string | null;
  mode_history: ModeHistoryEntry[];
  gates: Record<string, boolean>;
  prompt_bundle_hash: string;
  scope?: string;
  secondary_model?: string;
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

export interface SpecCommentAnchor {
  line: number;
  sectionRef: string | null;
  excerpt: string;
}

export interface SpecComment extends SpecCommentAnchor {
  id: string;
  specPath: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
}

interface SpecCommentStore {
  schemaVersion: "0.1";
  comments: SpecComment[];
}

export interface ActiveSessionEntry {
  spec_uuid: string;
  session_id: string;
  source_spec_path: string;
  started_at: string;
}

export interface SessionMeta {
  source_spec_path: string;
  sessions: string[];
}

export interface SessionListEntry {
  uuid: string;
  sessionId: string;
  sourcePath: string;
  mode: RutaMode;
  sessionDir: string;
}

export const ROUTA_DIR = ".ruta";
export const STATE_PATH = path.join(ROUTA_DIR, "ruta.json");
export const PROMPTS_VERSION_PATH = "prompts-version.txt";
export const COMMENTS_PATH = path.join(ROUTA_DIR, "comments.json");
export const ACTIVE_SESSIONS_PATH = path.join(ROUTA_DIR, "active.json");
export const SESSION_STATE_FILE = "state.json";
export const SESSION_META_FILE = "meta.json";

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

export function computeSpecUUID(cwd: string, specPath: string): string {
  const abs = path.resolve(cwd, specPath);
  return createHash("sha256").update(abs, "utf8").digest("hex").slice(0, 16);
}

function isSessionDir(dirPath: string): boolean {
  const normalized = path.normalize(dirPath);
  const parts = normalized.split(path.sep).filter(Boolean);
  if (parts.length < 3) return false;
  const [rutaMarker, _uuid, sessionId] = parts.slice(-3);
  return rutaMarker === ROUTA_DIR && /^session-\d+$/.test(sessionId ?? "");
}

function stateFilePath(dirPath: string): string {
  return isSessionDir(dirPath) ? path.join(dirPath, SESSION_STATE_FILE) : path.join(dirPath, STATE_PATH);
}

export async function loadProjectState(dirPath: string): Promise<RutaProjectState | null> {
  const filePath = stateFilePath(dirPath);
  if (!(await pathExists(filePath))) return null;
  const raw = await readText(filePath);
  return JSON.parse(raw) as RutaProjectState;
}

export async function saveProjectState(dirPath: string, state: RutaProjectState): Promise<void> {
  const filePath = stateFilePath(dirPath);
  await writeText(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function pruneDeadPIDs(map: Record<string, ActiveSessionEntry>): Promise<Record<string, ActiveSessionEntry>> {
  const next: Record<string, ActiveSessionEntry> = {};
  for (const [pid, entry] of Object.entries(map)) {
    try {
      process.kill(Number(pid), 0);
      next[pid] = entry;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM") {
        next[pid] = entry;
      }
      // ESRCH and invalid pids are treated as stale and removed on read.
    }
  }
  return next;
}

export async function readActiveJson(cwd: string): Promise<Record<string, ActiveSessionEntry>> {
  const filePath = path.join(cwd, ACTIVE_SESSIONS_PATH);
  if (!(await pathExists(filePath))) return {};
  const parsed = JSON.parse(await readText(filePath)) as Record<string, ActiveSessionEntry>;
  const pruned = await pruneDeadPIDs(parsed);
  if (Object.keys(pruned).length !== Object.keys(parsed).length) {
    await writeActiveJson(cwd, pruned);
  }
  return pruned;
}

export async function writeActiveJson(cwd: string, map: Record<string, ActiveSessionEntry>): Promise<void> {
  await writeText(path.join(cwd, ACTIVE_SESSIONS_PATH), `${JSON.stringify(map, null, 2)}\n`);
}

export async function writeActiveEntry(cwd: string, uuid: string, sessionId: string, sourcePath: string): Promise<void> {
  const active = await readActiveJson(cwd);
  active[String(process.pid)] = {
    spec_uuid: uuid,
    session_id: sessionId,
    source_spec_path: sourcePath,
    started_at: new Date().toISOString(),
  };
  await writeActiveJson(cwd, active);
}

export async function loadActiveSession(cwd: string): Promise<{ state: RutaProjectState; sessionDir: string; active: ActiveSessionEntry } | null> {
  const active = await readActiveJson(cwd);
  const entry = active[String(process.pid)];
  if (!entry) return null;
  const sessionDir = path.join(cwd, ROUTA_DIR, entry.spec_uuid, entry.session_id);
  const state = await loadProjectState(sessionDir);
  if (!state) return null;
  return { state, sessionDir, active: entry };
}

export async function listAllSessions(cwd: string): Promise<SessionListEntry[]> {
  const rutaDir = path.join(cwd, ROUTA_DIR);
  if (!(await pathExists(rutaDir))) return [];

  const entries = await fs.readdir(rutaDir, { withFileTypes: true });
  const sessions: SessionListEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const uuid = entry.name;
    const metaPath = path.join(rutaDir, uuid, SESSION_META_FILE);
    if (!(await pathExists(metaPath))) continue;
    const meta = JSON.parse(await readText(metaPath)) as SessionMeta;
    for (const sessionId of meta.sessions) {
      const sessionDir = path.join(rutaDir, uuid, sessionId);
      const state = await loadProjectState(sessionDir);
      if (!state) continue;
      sessions.push({
        uuid,
        sessionId,
        sourcePath: meta.source_spec_path,
        mode: state.current_mode,
        sessionDir,
      });
    }
  }
  return sessions;
}

export function artifactPaths(dirPath: string) {
  if (isSessionDir(dirPath)) {
    return {
      specDir: dirPath,
      stateDir: dirPath,
      chavrutaDir: path.join(dirPath, "chavruta"),
      comments: path.join(dirPath, "comments.json"),
      notebook: path.join(dirPath, "notebook.md"),
      glossary: path.join(dirPath, "glossary.md"),
      propositions: path.join(dirPath, "propositions.md"),
      properties: path.join(dirPath, "properties.md"),
      contracts: path.join(dirPath, "contracts.md"),
      gaps: path.join(dirPath, "gaps.md"),
      perspectivesDir: path.join(dirPath, "perspectives"),
      achDir: path.join(dirPath, "ach"),
      premortem: path.join(dirPath, "premortem.md"),
      synthesis: path.join(dirPath, "synthesis.md"),
    };
  }

  return {
    specDir: path.join(dirPath, "spec"),
    stateDir: path.join(dirPath, ROUTA_DIR),
    chavrutaDir: path.join(dirPath, ROUTA_DIR, "chavruta"),
    comments: path.join(dirPath, COMMENTS_PATH),
    notebook: path.join(dirPath, "notebook.md"),
    glossary: path.join(dirPath, "glossary.md"),
    propositions: path.join(dirPath, "propositions.md"),
    properties: path.join(dirPath, "properties.md"),
    contracts: path.join(dirPath, "contracts.md"),
    gaps: path.join(dirPath, "gaps.md"),
    perspectivesDir: path.join(dirPath, "perspectives"),
    achDir: path.join(dirPath, "ach"),
    premortem: path.join(dirPath, "premortem.md"),
    synthesis: path.join(dirPath, "synthesis.md"),
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
    source_spec_path: path.relative(cwd, absSource),
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

export async function scaffoldSession(cwd: string, sourceSpecPath: string, sessionDir: string): Promise<RutaProjectState> {
  const absSource = path.resolve(cwd, sourceSpecPath);
  const specBasename = path.basename(absSource);
  const paths = artifactPaths(sessionDir);

  await ensureDir(paths.stateDir);
  await ensureDir(paths.chavrutaDir);
  await ensureDir(paths.perspectivesDir);
  await ensureDir(paths.achDir);

  const targetSpec = path.join(sessionDir, specBasename);
  await writeText(targetSpec, await readText(absSource));

  const promptBundleHash = await loadPromptBundleHash(cwd);
  const state: RutaProjectState = {
    schema_version: "0.2",
    spec_path: path.basename(targetSpec),
    source_spec_path: path.relative(cwd, absSource),
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
  };

  await saveProjectState(sessionDir, state);
  await writeIfMissing(paths.notebook, "# Notebook\n\n- " + timestampPrefix() + " Things I don't know yet:\n");
  await writeIfMissing(paths.glossary, "# Glossary\n\n");
  await writeIfMissing(paths.propositions, "# Propositions\n\n");
  await writeIfMissing(paths.properties, "# Properties\n\n");
  await writeIfMissing(paths.contracts, "# Contracts\n\n");
  await writeIfMissing(paths.gaps, "# Gaps\n\n");
  await writeIfMissing(paths.comments, "[]\n");
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

// Matches the exact scaffold line seeded by scaffoldProject().
// Lines with trailing content after the colon are user notes, not templates.
export const NOTEBOOK_SCAFFOLD_PATTERN = /^-\s+\[.*\]\s+Things I don't know yet:\s*$/;

export async function readGateSatisfied(notebookPath: string, unitySentence: string | null): Promise<boolean> {
  if (!unitySentence || !unitySentence.trim()) return false;
  if (!(await pathExists(notebookPath))) return false;
  const text = await readText(notebookPath);
  const userLines = text
    .split("\n")
    .filter((line) => !/^#/.test(line))
    .filter((line) => !NOTEBOOK_SCAFFOLD_PATTERN.test(line))
    .filter((line) => line.trim().length > 0);
  return userLines.length > 0;
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

export function parseScopeHeadings(scope: string): string[] {
  return scope.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function reimplementGateSatisfied(specPath: string, gapsPath: string, scope?: string): Promise<boolean> {
  let headings = await readMajorSectionHeadings(specPath);
  if (scope) {
    const scopeList = parseScopeHeadings(scope);
    headings = headings.filter((h) => scopeList.includes(h.toLowerCase()));
  }
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

export async function readSpecComments(filePath: string): Promise<SpecComment[]> {
  if (!(await pathExists(filePath))) return [];
  const raw = await readText(filePath);
  const parsed = JSON.parse(raw) as SpecCommentStore | SpecComment[];
  if (Array.isArray(parsed)) return parsed;
  return parsed.comments ?? [];
}

export async function writeSpecComments(filePath: string, comments: SpecComment[]): Promise<void> {
  const payload: SpecCommentStore = {
    schemaVersion: "0.1",
    comments,
  };
  await writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function appendSpecComment(filePath: string, comment: SpecComment): Promise<void> {
  const comments = await readSpecComments(filePath);
  comments.push(comment);
  await writeSpecComments(filePath, comments);
}

export function listSpecComments(commentsPath: string, specPath?: string): Promise<SpecComment[]> {
  return readSpecComments(commentsPath).then((comments) => comments
    .filter((comment) => specPath ? comment.specPath === specPath : true)
    .sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
      return a.id.localeCompare(b.id);
    }));
}

export function createSpecComment(
  specText: string,
  specPath: string,
  lineNumber: number,
  text: string,
  options?: { id?: string; createdAt?: string; updatedAt?: string },
): SpecComment {
  const anchor = deriveSpecCommentAnchor(specText, lineNumber);
  return {
    id: options?.id ?? randomUUID(),
    specPath,
    ...anchor,
    text,
    createdAt: options?.createdAt ?? new Date().toISOString(),
    ...(options?.updatedAt ? { updatedAt: options.updatedAt } : {}),
  };
}

export function deriveSpecCommentAnchor(specText: string, lineNumber: number): SpecCommentAnchor {
  const lines = specText.split("\n");
  const line = Math.max(1, Math.min(lineNumber, Math.max(lines.length, 1)));
  const sectionRef = deriveSectionRefForLine(lines, line);
  const excerpt = deriveExcerptForLine(lines, line);
  return { line, sectionRef, excerpt };
}

export async function deriveSpecCommentAnchorForPath(specPath: string, lineNumber: number): Promise<SpecCommentAnchor> {
  return deriveSpecCommentAnchor(await readText(specPath), lineNumber);
}

function deriveSectionRefForLine(lines: string[], lineNumber: number): string | null {
  for (let index = Math.min(lineNumber - 1, lines.length - 1); index >= 0; index -= 1) {
    const match = lines[index]?.match(/^(#{1,6})\s+(.+)$/);
    if (match) return match[2].trim();
  }
  return null;
}

function deriveExcerptForLine(lines: string[], lineNumber: number): string {
  const candidates = [
    lines[lineNumber - 1],
    ...lines.slice(lineNumber),
    ...lines.slice(0, Math.max(0, lineNumber - 1)).reverse(),
  ];
  const chosen = candidates
    .map((line) => line?.trim() ?? "")
    .find((line) => line.length > 0) ?? "";
  return chosen.replace(/\s+/g, " ").slice(0, 160);
}

function extractSectionFromText(text: string, headingLine: string): string {
  const start = text.indexOf(headingLine);
  if (start === -1) return text;
  const levelMatch = headingLine.match(/^(#{1,6})/);
  const level = levelMatch ? levelMatch[1].length : 1;
  const tail = text.slice(start + headingLine.length);
  const nextHeading = tail.match(new RegExp(`\n#{1,${level}}\\s+`, "m"));
  const end = nextHeading && nextHeading.index !== undefined ? start + headingLine.length + nextHeading.index : text.length;
  return text.slice(start, end).trim();
}

export async function getSpecSectionByRef(specPath: string, sectionRef: string): Promise<string | null> {
  const text = await readText(specPath);
  const query = sectionRef.trim().toLowerCase();

  const headingLines: string[] = [];
  for (const line of text.split("\n")) {
    if (/^#{1,6}\s+/.test(line)) headingLines.push(line);
  }

  const exact = headingLines.filter((l) => l.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === query);
  if (exact.length > 0) return extractSectionFromText(text, exact[0]!);

  const partial = headingLines.filter((l) => l.replace(/^#{1,6}\s+/, "").trim().toLowerCase().includes(query));
  if (partial.length === 1) return extractSectionFromText(text, partial[0]!);

  return null;
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Triage token — ephemeral session state for authorizing ruta_add_gap calls.
// Not persisted to disk.
// ---------------------------------------------------------------------------

export interface TriageToken {
  token: string;
  issuedAt: number;
}

export function createTriageToken(): TriageToken {
  return {
    token: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    issuedAt: Date.now(),
  };
}

export function isValidTriageToken(active: TriageToken | null, candidate: string | undefined): boolean {
  return active !== null && candidate === active.token;
}
