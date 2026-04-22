import { readdir } from "node:fs/promises";
import path from "node:path";
import { complete, type Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  activeToolsForMode,
  appendGapEntry,
  appendMarkdown,
  artifactPaths,
  canTransition,
  computeSpecUUID,
  createTriageToken,
  describeAccess,
  formatGapEntry,
  formatGlossaryEntry,
  getSpecSectionByRef,
  glossaryGateSatisfied,
  isValidTriageToken,
  listAllSessions,
  listSpecComments,
  loadActiveSession,
  loadProjectState,
  nextGapIndex,
  pathExists,
  readActiveJson,
  readGapEntries,
  readGateSatisfied,
  readGlossaryEntries,
  readMajorSectionHeadings,
  readText,
  reimplementGateSatisfied,
  resetModeStateForSpecMismatch,
  saveProjectState,
  scaffoldSession,
  timestampPrefix,
  type RutaMode,
  type RutaProjectState,
  type SessionMeta,
  type TriageToken,
  SESSION_META_FILE,
  updateMode,
  verifySpecHash,
  writeActiveEntry,
  writeText,
} from "./state.ts";
import {
  BASE_PROMPT,
  composeSystemPrompt,
  GLOSSARY_MODE_PROMPT,
  GLOSSARY_PARAPHRASE_PROMPT,
  READ_MODE_PROMPT,
  REIMPLEMENT_MODE_PROMPT,
  REIMPL_GAP_PROBE_PROMPT,
} from "./prompts.ts";
import { openSpecViewer } from "./spec-viewer.ts";
import { openTriageView } from "./triage.ts";
import { detectDisagreement, formatDisagreementReport, selectSecondaryModel } from "./disagree.ts";
import { detectPromptOverrides } from "./prompt-integrity.ts";
import { buildHelpText, buildTutorialText, HELP_TOPIC_KEYS } from "./tutorial.ts";
import { openTextViewer } from "./text-viewer.ts";

const WHY_TEXT: Record<string, string> = {
  read: `Read mode: AI is fully restricted so that your unity sentence and ignorance list come from you, not from a summary. If the AI reads for you, you form no mental model — only the appearance of one. Mortimer Adler's test: you haven't understood an argument until you can restate it in your own words without quoting the source. Use /ruta-note to capture observations and questions. Use /ruta-unity when you can state in one sentence what the spec is trying to accomplish.`,
  glossary: `Glossary mode: AI is narrowed so it can test a paraphrase without writing one for you. The gap between "I know what this means" and "I can define it myself" is where most comprehension failures hide. /ruta-add-term scaffolds an entry for you to fill in. /ruta-probe-term checks whether your paraphrase actually matches how the spec uses the term — it does not write the definition for you.`,
  reimplement: `Reimplement mode: AI can scan a section for implementation gaps, but it must not resolve them. A gap is a decision the spec leaves silent, ambiguous, or forced — something you would have to decide when building. Surfacing gaps now is the point. Resolving them now would skip the architecture conversation. Use /ruta-probe <section> to find gaps. Use /ruta-add-gap to record ones you spot manually.`,
  default: `ruta exists to keep AI from substituting fluency for comprehension. The restrictions are not missing features; they are the product. In read mode, AI is disabled so you form your own unity sentence and ignorance list. In glossary mode, AI is narrowed so it can test a paraphrase without writing one for you. In reimplement mode, AI can surface ambiguities but must not resolve them for you.`,
};

export default function ruta(pi: ExtensionAPI) {
  let triageState: TriageToken | null = null;
  let rutaActive = false;

  async function loadStateOrNotify(
    cwd: string,
    ctx: { ui: { notify: (message: string, level: "info" | "warning" | "error" | "success") => void } },
  ): Promise<{ state: RutaProjectState; sessionDir: string } | null> {
    const active = await loadActiveSession(cwd);
    if (!active) {
      ctx.ui.notify("No active ruta session found. Run /ruta-init <spec-path> first.", "warning");
      return null;
    }
    return { state: active.state, sessionDir: active.sessionDir };
  }

  function modePrompt(mode: RutaMode): string {
    if (mode === "read") return READ_MODE_PROMPT;
    if (mode === "glossary") return GLOSSARY_MODE_PROMPT;
    return REIMPLEMENT_MODE_PROMPT;
  }

  async function refreshUi(ctx: any, cwd: string, state?: RutaProjectState | null, sessionDir?: string) {
    const active = state && sessionDir ? { state, sessionDir } : await loadActiveSession(cwd);
    const project = state ?? active?.state ?? null;
    const activeSessionDir = sessionDir ?? active?.sessionDir;
    if (!project || !activeSessionDir) {
      ctx.ui.setStatus("ruta", undefined);
      ctx.ui.setWidget("ruta", undefined);
      return;
    }
    const paths = artifactPaths(activeSessionDir);
    const glossaryEntries = await readGlossaryEntries(paths.glossary);
    const displayPath = project.source_spec_path ?? project.spec_path;
    const status = `[${project.current_mode}] ${displayPath} · ${describeAccess(project.current_mode)} · gates: read=${project.gates.read_unlocked ? "✓" : "×"} glossary=${project.gates.glossary_unlocked ? "✓" : "×"} reimpl=${project.gates.reimplement_unlocked ? "✓" : "×"}`;
    ctx.ui.setStatus("ruta", status);
    ctx.ui.setWidget("ruta", [
      `[ruta] ${project.current_mode} mode · ${describeAccess(project.current_mode)}`,
      project.current_mode === "read"
        ? "Read mode: the AI is not available. This is intentional. See /ruta-why."
        : project.current_mode === "glossary"
          ? `[glossary] ${glossaryEntries.length} term(s) · AI: narrow`
          : `[reimplement]${project.scope ? ` scope=${project.scope}` : ""} AI: gap-probe only`,
    ]);
    pi.setActiveTools(activeToolsForMode(project.current_mode, triageState !== null));
  }

  async function maybeWarnAboutSpecHash(ctx: any, cwd: string, sessionDir?: string) {
    const active = sessionDir ? { state: await loadProjectState(sessionDir), sessionDir } : await loadActiveSession(cwd);
    const state = active?.state;
    if (!state || !active?.sessionDir) return;
    const { matches, actual } = await verifySpecHash(active.sessionDir, state);
    if (!matches) {
      const shouldReset = await ctx.ui.confirm(
        "ruta: spec changed",
        "The canonicalized spec hash no longer matches this project's recorded hash. Reset mode state to read while preserving artifacts?",
      );
      const next = await resetModeStateForSpecMismatch(active.sessionDir, state, actual, !shouldReset);
      if (!shouldReset) {
        ctx.ui.notify("Spec hash updated without reset; recorded in mode history.", "warning");
      } else {
        ctx.ui.notify("Mode state reset to read due to spec change.", "warning");
      }
      await refreshUi(ctx, cwd, next, active.sessionDir);
    }
  }

  async function maybeWarnAboutPromptBundleHash(ctx: any, cwd: string, state: RutaProjectState) {
    if (!state.prompt_bundle_hash) return;
    try {
      const shippedPromptHash = (await readText(path.join(cwd, "prompts-version.txt"))).trim();
      if (shippedPromptHash !== state.prompt_bundle_hash) {
        ctx.ui.notify("Prompt bundle hash differs from the one recorded when this project started.", "warning");
      }
    } catch {
      // ignore missing hash file
    }
  }

  async function runCompletion(ctx: any, prompt: string): Promise<string> {
    if (!ctx.model) {
      throw new Error("No active model selected");
    }
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
    if (!auth.ok || !auth.apiKey) {
      throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);
    }
    const response = await complete(
      ctx.model,
      {
        systemPrompt: BASE_PROMPT,
        messages: [{
          role: "user",
          content: [{ type: "text", text: prompt }],
          timestamp: Date.now(),
        } satisfies Message],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        signal: ctx.signal,
      },
    );
    return response.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }

  async function runParaphraseProbe(ctx: any, sessionDir: string, term: string): Promise<string> {
    const paths = artifactPaths(sessionDir);
    const entries = await readGlossaryEntries(paths.glossary);
    const entry = entries.find((candidate) => candidate.term.toLowerCase() === term.toLowerCase());
    if (!entry) {
      throw new Error(`Glossary term not found: ${term}`);
    }
    const prompt = GLOSSARY_PARAPHRASE_PROMPT
      .replaceAll("{term}", entry.term)
      .replace("{spec_definition}", entry.specDefinition)
      .replace("{user_paraphrase}", entry.userParaphrase);
    const raw = await runCompletion(ctx, prompt);
    return raw
      .split("\n")
      .filter((line) => !/paraphrase|rewrite|definition/i.test(line))
      .join("\n")
      .trim();
  }

  async function runGapProbe(ctx: any, sessionDir: string, sectionRef: string): Promise<string> {
    const state = await loadProjectState(sessionDir);
    if (!state) throw new Error("No ruta project loaded");
    const specPath = path.join(sessionDir, state.spec_path);
    const sectionText = await getSpecSectionByRef(specPath, sectionRef);
    if (sectionText === null) {
      throw new Error(`Section not found or ambiguous: "${sectionRef}". Use an exact heading name.`);
    }
    const prompt = REIMPL_GAP_PROBE_PROMPT.replace("{section_text}", sectionText);
    return runCompletion(ctx, prompt);
  }

  async function showScratch(ctx: any, title: string, content: string) {
    await openTextViewer(ctx, title, content);
  }

  async function readSpecTitle(specPath: string): Promise<string | undefined> {
    try {
      const text = await readText(specPath);
      const match = text.match(/^#\s+(.+)/m);
      return match ? match[1].trim() : undefined;
    } catch {
      return undefined;
    }
  }

  function makeTriageToken(): string {
    triageState = createTriageToken();
    return triageState.token;
  }

  function clearTriageToken() {
    triageState = null;
  }

  pi.on("session_start", async () => {
    rutaActive = false;
    clearTriageToken();
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearTriageToken();
    rutaActive = false;
    ctx.ui.setStatus("ruta", undefined);
    ctx.ui.setWidget("ruta", undefined);
  });

  pi.on("input", async (event, ctx) => {
    if (!rutaActive) return { action: "continue" };
    const active = await loadActiveSession(ctx.cwd);
    const state = active?.state;
    if (!state) return { action: "continue" };
    if (event.text.startsWith("/")) return { action: "continue" };

    if (state.current_mode === "read") {
      ctx.ui.notify("AI is disabled in read mode. Use /ruta-why or /ruta-mode glossary after you finish reading.", "info");
      return { action: "handled" };
    }

    if (state.current_mode === "glossary") {
      ctx.ui.notify("Glossary mode blocks free-form chat. Use /ruta-add-term, /ruta-probe-term, or /ruta-done-glossary.", "info");
      return { action: "handled" };
    }

    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!rutaActive) return;
    const active = await loadActiveSession(ctx.cwd);
    const state = active?.state;
    if (!state) return;
    const rutaFragment = composeSystemPrompt(modePrompt(state.current_mode));
    const overrides = detectPromptOverrides(event.systemPrompt, rutaFragment);
    if (overrides.length > 0) {
      ctx.ui.notify(`Prompt override pattern detected from an external source: "${overrides[0]}". ruta restrictions may be at risk.`, "warning");
    }
    return {
      systemPrompt: `${event.systemPrompt}\n\n${rutaFragment}`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!rutaActive) return { block: false };
    const state = await loadProjectState(ctx.cwd);
    if (!state) return { block: false };
    const allowed = new Set(activeToolsForMode(state.current_mode, triageState !== null));
    if (!allowed.has(event.toolName)) {
      return {
        block: true,
        reason: `Tool ${event.toolName} is not available in ${modeFragment(state.current_mode)}. See /ruta-why.`,
      };
    }
    if (event.toolName === "ruta_add_gap") {
      const token = (event.input as { triage_token?: string }).triage_token;
      if (!isValidTriageToken(triageState, token)) {
        return {
          block: true,
          reason: "ruta_add_gap may only be used from the active triage flow.",
        };
      }
    }
    return { block: false };
  });

  pi.registerTool({
    name: "ruta_test_paraphrase",
    label: "Test paraphrase",
    description: "Generate a single natural sentence using a glossary term without rewriting the user's paraphrase.",
    promptSnippet: "Use ruta_test_paraphrase only when explicitly asked to test a glossary term; never rewrite the paraphrase.",
    parameters: Type.Object({
      term: Type.String({ description: "Glossary term to probe" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const active = await loadActiveSession(ctx.cwd);
      if (!active) throw new Error("No active ruta session found");
      const text = await runParaphraseProbe(ctx, active.sessionDir, params.term);
      return {
        content: [{ type: "text", text }],
        details: { term: params.term },
      };
    },
  });

  pi.registerTool({
    name: "ruta_gap_probe",
    label: "Probe section for implementation gaps",
    description: "Analyze a spec section for forced decisions, silences, ambiguities, and implicit assumptions without proposing resolutions.",
    promptSnippet: "Use ruta_gap_probe only for a specific section ref and do not propose resolutions.",
    parameters: Type.Object({
      section_ref: Type.String({ description: "Section reference or heading text" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const active = await loadActiveSession(ctx.cwd);
      if (!active) throw new Error("No active ruta session found");
      const text = await runGapProbe(ctx, active.sessionDir, params.section_ref);
      return {
        content: [{ type: "text", text }],
        details: { section_ref: params.section_ref },
      };
    },
  });

  pi.registerTool({
    name: "ruta_add_gap",
    label: "Add gap entry",
    description: "Append a structured gap entry to gaps.md after explicit user review in triage.",
    parameters: Type.Object({
      citation: Type.String(),
      decision_forced: Type.String(),
      spec_guidance: Type.String(),
      proposed_resolution: Type.String(),
      confidence: Type.String(),
      gap_type: Type.String(),
      raised_in_session: Type.String(),
      triage_token: Type.String(),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!isValidTriageToken(triageState, params.triage_token)) {
        throw new Error("ruta_add_gap requires a live triage token");
      }
      const active = await loadActiveSession(ctx.cwd);
      if (!active) {
        throw new Error("No active ruta session found");
      }
      const paths = artifactPaths(active.sessionDir);
      await appendGapEntry(paths.gaps, {
        citation: params.citation,
        decisionForced: params.decision_forced,
        specGuidance: params.spec_guidance,
        proposedResolution: params.proposed_resolution,
        confidence: params.confidence,
        gapType: params.gap_type,
        raisedInSession: params.raised_in_session,
      });
      clearTriageToken();
      return {
        content: [{ type: "text", text: "Gap appended to gaps.md" }],
        details: { citation: params.citation },
      };
    },
  });

  pi.registerCommand("ruta-start", {
    description: "Enable ruta guardrails for this session",
    handler: async (_args, ctx) => {
      if (rutaActive) {
        ctx.ui.notify("ruta is already active in this session.", "info");
        return;
      }
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      rutaActive = true;
      await refreshUi(ctx, ctx.cwd, active.state, active.sessionDir);
      await maybeWarnAboutSpecHash(ctx, ctx.cwd, active.sessionDir);
      await maybeWarnAboutPromptBundleHash(ctx, ctx.cwd, active.state);
      ctx.ui.notify("ruta guardrails enabled for this session. Run /ruta-exit to stop.", "success");
    },
  });

  pi.registerCommand("ruta-exit", {
    description: "Disable ruta guardrails for this session",
    handler: async (_args, ctx) => {
      clearTriageToken();
      if (!rutaActive) {
        ctx.ui.notify("ruta is not active in this session.", "info");
        return;
      }
      rutaActive = false;
      ctx.ui.setStatus("ruta", undefined);
      ctx.ui.setWidget("ruta", undefined);
      ctx.ui.notify("ruta guardrails disabled for this session. Run /ruta-start to resume.", "success");
    },
  });

  pi.registerCommand("ruta-init", {
    description: "Initialize a ruta project in the current directory",
    getArgumentCompletions: async (prefix) => {
      try {
        const cwd = process.cwd();
        let dir: string;
        let namePrefix: string;
        let pathPrefix: string;
        if (prefix.endsWith("/")) {
          dir = path.join(cwd, prefix);
          namePrefix = "";
          pathPrefix = prefix;
        } else if (prefix === "") {
          dir = cwd;
          namePrefix = "";
          pathPrefix = "";
        } else {
          const parts = prefix.split("/");
          namePrefix = parts.pop()!;
          pathPrefix = parts.length > 0 ? parts.join("/") + "/" : "";
          dir = pathPrefix === "" ? cwd : path.join(cwd, pathPrefix);
        }
        const entries = await readdir(dir, { withFileTypes: true });
        const items = [];
        for (const entry of entries) {
          if (namePrefix && !entry.name.startsWith(namePrefix)) continue;
          const isDir = entry.isDirectory();
          const value = pathPrefix + entry.name + (isDir ? "/" : "");
          items.push({ value, label: entry.name + (isDir ? "/" : "") });
        }
        return items.length > 0 ? items : null;
      } catch {
        return null;
      }
    },
    handler: async (args, ctx) => {
      const specPath = args.trim();
      if (!specPath) {
        ctx.ui.notify("Usage: /ruta-init <spec-path>", "error");
        return;
      }
      const disclosureAck = await ctx.ui.confirm(
        "ruta network disclosure",
        "Spec contents will be sent to your configured LLM provider(s) during paraphrase tests and gap probes. ruta cannot control provider-side logging, retention, or training use. Continue?",
      );

      const specUuid = computeSpecUUID(ctx.cwd, specPath);
      const specDir = path.join(ctx.cwd, ".ruta", specUuid);
      const metaPath = path.join(specDir, SESSION_META_FILE);
      const meta: SessionMeta = await pathExists(metaPath)
        ? JSON.parse(await readText(metaPath)) as SessionMeta
        : { source_spec_path: specPath, sessions: [] };
      const validSessions = [] as string[];
      for (const sessionId of meta.sessions) {
        const statePath = path.join(specDir, sessionId, "state.json");
        if (await pathExists(statePath)) validSessions.push(sessionId);
      }

      let sessionId = "session-1";
      let state: RutaProjectState;
      let sessionDir: string;

      if (validSessions.length > 0) {
        const choice = (await ctx.ui.input(`Resume ${validSessions[validSessions.length - 1]} (latest) or start fresh? [r/n] `)).trim().toLowerCase();
        if (choice === "r" || choice === "resume" || choice === "") {
          sessionId = validSessions[validSessions.length - 1]!;
          sessionDir = path.join(specDir, sessionId);
          const activeEntries = await readActiveJson(ctx.cwd);
          const conflict = Object.entries(activeEntries).find(([pid, entry]) => pid !== String(process.pid) && entry.spec_uuid === specUuid && entry.session_id === sessionId);
          if (conflict) {
            ctx.ui.notify(`Concurrent session warning: PID ${conflict[0]} is already using ${sessionId}.`, "warning");
          }
          const loaded = await loadProjectState(sessionDir);
          if (!loaded) {
            ctx.ui.notify(`Active session state missing at ${sessionDir}`, "error");
            return;
          }
          state = loaded;
        } else {
          sessionId = `session-${validSessions.length + 1}`;
          sessionDir = path.join(specDir, sessionId);
          state = await scaffoldSession(ctx.cwd, specPath, sessionDir);
          meta.sessions = [...validSessions, sessionId];
          meta.source_spec_path = state.source_spec_path ?? specPath;
          await writeText(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
        }
      } else {
        sessionDir = path.join(specDir, sessionId);
        state = await scaffoldSession(ctx.cwd, specPath, sessionDir);
        meta.sessions = [sessionId];
        meta.source_spec_path = state.source_spec_path ?? specPath;
        await writeText(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
      }

      await writeActiveEntry(ctx.cwd, specUuid, sessionId, state.source_spec_path ?? specPath);
      rutaActive = true;
      await refreshUi(ctx, ctx.cwd, state, sessionDir);
      await maybeWarnAboutPromptBundleHash(ctx, ctx.cwd, state);
      ctx.ui.notify(`Initialized ruta project for ${state.source_spec_path ?? state.spec_path}`, "success");
    },
  });

  pi.registerCommand("ruta-resume", {
    description: "Resume the latest ruta session for a spec or pick from existing sessions",
    getArgumentCompletions: async (prefix) => {
      try {
        const cwd = process.cwd();
        let dir: string;
        let namePrefix: string;
        let pathPrefix: string;
        if (prefix.endsWith("/")) {
          dir = path.join(cwd, prefix);
          namePrefix = "";
          pathPrefix = prefix;
        } else if (prefix === "") {
          dir = cwd;
          namePrefix = "";
          pathPrefix = "";
        } else {
          const parts = prefix.split("/");
          namePrefix = parts.pop()!;
          pathPrefix = parts.length > 0 ? parts.join("/") + "/" : "";
          dir = pathPrefix === "" ? cwd : path.join(cwd, pathPrefix);
        }
        const entries = await readdir(dir, { withFileTypes: true });
        return entries
          .filter((entry) => !namePrefix || entry.name.startsWith(namePrefix))
          .map((entry) => ({ value: pathPrefix + entry.name + (entry.isDirectory() ? "/" : ""), label: entry.name + (entry.isDirectory() ? "/" : "") }));
      } catch {
        return null;
      }
    },
    handler: async (args, ctx) => {
      const specPath = args.trim();
      if (specPath) {
        const specUuid = computeSpecUUID(ctx.cwd, specPath);
        const metaPath = path.join(ctx.cwd, ".ruta", specUuid, SESSION_META_FILE);
        if (!(await pathExists(metaPath))) {
          await ctx.ui.confirm(
            "ruta network disclosure",
            "Spec contents will be sent to your configured LLM provider(s) during paraphrase tests and gap probes. ruta cannot control provider-side logging, retention, or training use. Continue?",
          );
          const sessionDir = path.join(ctx.cwd, ".ruta", specUuid, "session-1");
          const state = await scaffoldSession(ctx.cwd, specPath, sessionDir);
          const meta: SessionMeta = { source_spec_path: state.source_spec_path ?? specPath, sessions: ["session-1"] };
          await writeText(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
          await writeActiveEntry(ctx.cwd, specUuid, "session-1", meta.source_spec_path);
          rutaActive = true;
          await refreshUi(ctx, ctx.cwd, state, sessionDir);
          ctx.ui.notify("No previous session found — starting session-1.", "info");
          await maybeWarnAboutPromptBundleHash(ctx, ctx.cwd, state);
          return;
        }
        const meta = JSON.parse(await readText(metaPath)) as SessionMeta;
        const validSessions: string[] = [];
        for (const sessionId of meta.sessions) {
          if (await pathExists(path.join(ctx.cwd, ".ruta", specUuid, sessionId, "state.json"))) {
            validSessions.push(sessionId);
          }
        }
        const latest = validSessions[validSessions.length - 1];
        if (!latest) {
          ctx.ui.notify("No previous session found — starting session-1.", "info");
          return;
        }
        const sessionDir = path.join(ctx.cwd, ".ruta", specUuid, latest);
        const state = await loadProjectState(sessionDir);
        if (!state) {
          ctx.ui.notify(`Active session state missing at ${sessionDir}`, "error");
          return;
        }
        await writeActiveEntry(ctx.cwd, specUuid, latest, meta.source_spec_path);
        rutaActive = true;
        await refreshUi(ctx, ctx.cwd, state, sessionDir);
        await maybeWarnAboutPromptBundleHash(ctx, ctx.cwd, state);
        return;
      }

      const sessions = await listAllSessions(ctx.cwd);
      if (sessions.length === 0) {
        ctx.ui.notify("No sessions yet. Run `/ruta-init <path>` to start.", "info");
        return;
      }
      ctx.ui.notify(sessions.map((session, index) => `[${index + 1}] ${session.sourcePath}  ${session.sessionId}  (mode: ${session.mode})`).join("\n"), "info");
      const choice = Number((await ctx.ui.input("Pick a session: ")).trim());
      const picked = sessions[choice - 1];
      if (!picked) {
        ctx.ui.notify("Invalid session selection.", "error");
        return;
      }
      const state = await loadProjectState(picked.sessionDir);
      if (!state) {
        ctx.ui.notify(`Active session state missing at ${picked.sessionDir}`, "error");
        return;
      }
      await writeActiveEntry(ctx.cwd, picked.uuid, picked.sessionId, picked.sourcePath);
      rutaActive = true;
      await refreshUi(ctx, ctx.cwd, state, picked.sessionDir);
      await maybeWarnAboutPromptBundleHash(ctx, ctx.cwd, state);
    },
  });

  pi.registerCommand("ruta-switch", {
    description: "Switch the current terminal to another ruta session",
    handler: async (_args, ctx) => {
      const sessions = await listAllSessions(ctx.cwd);
      if (sessions.length === 0) {
        ctx.ui.notify("No sessions yet. Run `/ruta-init <path>` to start.", "info");
        return;
      }
      ctx.ui.notify(sessions.map((session, index) => `[${index + 1}] ${session.sourcePath}  ${session.sessionId}  (mode: ${session.mode})`).join("\n"), "info");
      const choice = Number((await ctx.ui.input("Pick a session: ")).trim());
      const picked = sessions[choice - 1];
      if (!picked) {
        ctx.ui.notify("Invalid session selection.", "error");
        return;
      }
      const state = await loadProjectState(picked.sessionDir);
      if (!state) {
        ctx.ui.notify(`Active session state missing at ${picked.sessionDir}`, "error");
        return;
      }
      await writeActiveEntry(ctx.cwd, picked.uuid, picked.sessionId, picked.sourcePath);
      rutaActive = true;
      await refreshUi(ctx, ctx.cwd, state, picked.sessionDir);
      await maybeWarnAboutPromptBundleHash(ctx, ctx.cwd, state);
    },
  });

  pi.registerCommand("ruta-mode", {
    description: "Show or change the current ruta mode",
    handler: async (args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const requested = args.trim() as RutaMode;
      if (!requested) {
        ctx.ui.notify(`Current mode: ${state.current_mode}`, "info");
        return;
      }
      if (!["read", "glossary", "reimplement"].includes(requested)) {
        ctx.ui.notify("Valid modes: read, glossary, reimplement", "error");
        return;
      }
      const transition = canTransition(state.current_mode, requested, state.gates);
      if (!transition.ok) {
        ctx.ui.notify(transition.reason, "warning");
        return;
      }
      const next = await updateMode(sessionDir, state, requested);
      await refreshUi(ctx, ctx.cwd, next, sessionDir);
      ctx.ui.notify(`Switched to ${requested}`, "success");
    },
  });

  pi.registerCommand("ruta-status", {
    description: "Show current ruta mode, gates, and artifact summary",
    handler: async (_args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const paths = artifactPaths(sessionDir);
      const glossaryEntries = await readGlossaryEntries(paths.glossary);
      const gapEntries = await readGapEntries(paths.gaps);
      const headings = await readMajorSectionHeadings(path.join(sessionDir, state.spec_path));
      const toolbar = `[${state.current_mode}] ${describeAccess(state.current_mode)}  ·  gates: read=${state.gates.read_unlocked} glossary=${state.gates.glossary_unlocked} reimpl=${state.gates.reimplement_unlocked}`;
      const summary = [
        `# ruta status`,
        "",
        toolbar,
        `spec: ${state.source_spec_path ?? state.spec_path}`,
        "",
        `- unity sentence: ${state.unity_sentence ?? "(missing)"}`,
        ...(state.scope ? [`- scope: ${state.scope}`] : []),
        "",
        "## Artifacts",
        "",
        `- glossary terms: ${glossaryEntries.length}`,
        `- gaps: ${gapEntries.length}`,
        `- major sections: ${headings.length}`,
      ].join("\n");
      await showScratch(ctx, "ruta status", summary);
    },
  });

  pi.registerCommand("ruta-tutorial", {
    description: "Show a mode-aware onboarding guide for the current ruta workflow",
    handler: async (_args, ctx) => {
      const active = await loadActiveSession(ctx.cwd);
      const state = active?.state ?? null;
      const specTitle = active && state ? await readSpecTitle(path.join(active.sessionDir, state.spec_path)) : undefined;
      await showScratch(ctx, "ruta tutorial", buildTutorialText(state, specTitle));
    },
  });

  pi.registerCommand("ruta-help", {
    description: "Explain a ruta concept or command — /ruta-help <topic> (e.g. unity, gap, probe, read, glossary)",
    getArgumentCompletions: async (argumentPrefix) => {
      return HELP_TOPIC_KEYS
        .filter((key) => key.startsWith(argumentPrefix.toLowerCase()))
        .map((key) => ({ value: key, description: key }));
    },
    handler: async (args, ctx) => {
      await showScratch(ctx, "ruta help", buildHelpText(args.trim() || null));
    },
  });

  pi.registerCommand("ruta-why", {
    description: "Explain why ruta restricts AI in the current mode",
    handler: async (_args, ctx) => {
      const active = await loadActiveSession(ctx.cwd);
      const state = active?.state ?? null;
      const text = state ? (WHY_TEXT[state.current_mode] ?? WHY_TEXT.default) : WHY_TEXT.default;
      await showScratch(ctx, "ruta why", text);
    },
  });

  pi.registerCommand("ruta-note", {
    description: "Append a note to notebook.md with timestamp",
    handler: async (args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      let text = args.trim();
      if (!text) {
        const edited = await ctx.ui.editor("New note", "");
        if (edited === undefined || !edited.trim()) {
          ctx.ui.notify("Cancelled", "info");
          return;
        }
        text = edited.trim();
      }
      const paths = artifactPaths(sessionDir);
      await appendMarkdown(paths.notebook, `- ${timestampPrefix()} ${text}\n`);
      ctx.ui.notify("Added note to notebook.md", "success");
      await refreshUi(ctx, ctx.cwd, state, sessionDir);
    },
  });

  pi.registerCommand("ruta-unity", {
    description: "Record your one-sentence summary of what the spec is trying to accomplish (Adler's test: restate it before you critique it)",
    handler: async (args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const sentence = args.trim();
      if (!sentence) {
        ctx.ui.notify("Usage: /ruta-unity <sentence>  —  A unity sentence states what the spec is trying to accomplish, in your own words.", "error");
        return;
      }
      const next = { ...state, unity_sentence: sentence };
      await saveProjectState(sessionDir, next);
      await refreshUi(ctx, ctx.cwd, next, sessionDir);
      ctx.ui.notify("Unity sentence saved", "success");
    },
  });

  pi.registerCommand("ruta-add-term", {
    description: "Append a scaffolded glossary entry",
    handler: async (args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const term = args.trim();
      if (!term) {
        ctx.ui.notify("Usage: /ruta-add-term <term>", "error");
        return;
      }
      const draft = formatGlossaryEntry(term);
      const edited = await ctx.ui.editor(`Glossary entry: ${term}`, draft);
      if (edited === undefined) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }
      const paths = artifactPaths(sessionDir);
      await appendMarkdown(paths.glossary, `\n${edited.trim()}\n`);
      ctx.ui.notify(`Added glossary entry for ${term}`, "success");
      await refreshUi(ctx, ctx.cwd, state, sessionDir);
    },
  });

  pi.registerCommand("ruta-probe-term", {
    description: "Check whether your paraphrase of a glossary term matches how the spec actually uses it (does not write the definition for you)",
    handler: async (args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { sessionDir } = active;
      const term = args.trim();
      if (!term) {
        ctx.ui.notify("Usage: /ruta-probe-term <term>", "error");
        return;
      }
      try {
        const sentence = await runParaphraseProbe(ctx, sessionDir, term);
        await showScratch(ctx, `Paraphrase probe: ${term}`, `${sentence}\n\nRevise your paraphrase in glossary.md if this sentence exposes a mismatch.`);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("ruta-scope", {
    description: "Narrow which sections to probe during reimplementation (useful when the spec is large and you want to focus on a chapter or section range)",
    handler: async (args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const scope = args.trim();
      if (!scope) {
        ctx.ui.notify(state.scope ? `Current scope: ${state.scope}` : "No scope declared", "info");
        return;
      }
      const next = { ...state, scope };
      await saveProjectState(sessionDir, next);
      await refreshUi(ctx, ctx.cwd, next, sessionDir);
      ctx.ui.notify(`Scope set to ${scope}`, "success");
    },
  });

  pi.registerCommand("ruta-probe", {
    description: "Scan a spec section for implementation gaps — decisions the spec leaves silent, ambiguous, or forced",
    handler: async (args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const section = args.trim();
      if (!section) {
        ctx.ui.notify("Usage: /ruta-probe <section>", "error");
        return;
      }
      try {
        const probe = await runGapProbe(ctx, sessionDir, section);
        makeTriageToken();
        const paths = artifactPaths(sessionDir);
        await refreshUi(ctx, ctx.cwd, state, sessionDir);
        await openTriageView(ctx, probe, section, paths.gaps, triageState, clearTriageToken);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        clearTriageToken();
      } finally {
        await refreshUi(ctx, ctx.cwd, state, sessionDir);
      }
    },
  });

  pi.registerCommand("ruta-add-gap", {
    description: "Append a manual gap entry to gaps.md",
    handler: async (_args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const paths = artifactPaths(sessionDir);
      const draft = formatGapEntry(await nextGapIndex(paths.gaps), { raisedInSession: new Date().toISOString().slice(0, 10) });
      const edited = await ctx.ui.editor("New gap entry", draft);
      if (edited === undefined) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }
      await appendMarkdown(paths.gaps, `\n${edited.trim()}\n`);
      ctx.ui.notify("Added gap entry", "success");
      await refreshUi(ctx, ctx.cwd, state, sessionDir);
    },
  });

  pi.registerCommand("ruta-open-spec", {
    description: "Open the current spec in a read-only viewer",
    handler: async (args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      if (!ctx.hasUI) {
        ctx.ui.notify("/ruta-open-spec requires interactive mode", "error");
        return;
      }
      try {
        await openSpecViewer(ctx, ctx.cwd, state, args.trim() || undefined);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("ruta-comments", {
    description: "List stored comments for the current spec",
    handler: async (_args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const comments = await listSpecComments(artifactPaths(sessionDir).comments, state.spec_path);
      if (comments.length === 0) {
        ctx.ui.notify("No comments stored for the current spec.", "info");
        return;
      }
      const body = [
        `# ruta comments`,
        "",
        `- spec: ${state.spec_path}`,
        `- count: ${comments.length}`,
        "",
        ...comments.flatMap((comment) => [
          `## L${comment.line}${comment.sectionRef ? ` — ${comment.sectionRef}` : ""}`,
          "",
          `${comment.text}`,
          "",
          `- excerpt: ${comment.excerpt || "(none)"}`,
          `- created: ${comment.createdAt}`,
          "",
        ]),
      ].join("\n");
      await showScratch(ctx, "ruta comments", body);
    },
  });

  pi.registerCommand("ruta-disagree", {
    description: "Get a second opinion from a different AI model on the last response (model musical chairs: surfaces where two models diverge)",
    handler: async (_args, ctx) => {
      if (!ctx.model) {
        ctx.ui.notify("No active model selected", "error");
        return;
      }
      const active = await loadActiveSession(ctx.cwd);
      const state = active?.state;
      const available = ctx.modelRegistry.getAvailable();
      const secondary = selectSecondaryModel(available, ctx.model, state?.secondary_model);
      if (!secondary) {
        ctx.ui.notify("No secondary provider-configured model available; /ruta-disagree requires two providers.", "warning");
        return;
      }
      const branch = ctx.sessionManager.getBranch();
      const lastUser = [...branch].reverse().find((entry: any) => entry.type === "message" && entry.message?.role === "user");
      const lastAssistant = [...branch].reverse().find((entry: any) => entry.type === "message" && entry.message?.role === "assistant");
      const userText = lastUser?.message?.content?.filter?.((part: any) => part.type === "text")?.map?.((part: any) => part.text)?.join?.("\n") ?? "";
      const assistantText = lastAssistant?.message?.content?.filter?.((part: any) => part.type === "text")?.map?.((part: any) => part.text)?.join?.("\n") ?? "";
      if (!userText) {
        ctx.ui.notify("No recent user prompt found to replay", "warning");
        return;
      }
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(secondary);
      if (!auth.ok || !auth.apiKey) {
        ctx.ui.notify(auth.ok ? `No API key for ${secondary.provider}` : auth.error, "error");
        return;
      }
      const response = await complete(
        secondary,
        {
          systemPrompt: composeSystemPrompt(modePrompt(state?.current_mode ?? "reimplement")),
          messages: [{
            role: "user",
            content: [{ type: "text", text: userText }],
            timestamp: Date.now(),
          }],
        },
        { apiKey: auth.apiKey, headers: auth.headers, signal: ctx.signal },
      );
      const secondaryText = response.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const disagrees = detectDisagreement(assistantText, secondaryText);
      const report = formatDisagreementReport({
        primary: assistantText,
        secondary: secondaryText,
        primaryId: ctx.model.id,
        secondaryId: secondary.id,
        disagrees,
        section: undefined,
      });
      await showScratch(ctx, "ruta disagree", report);
    },
  });

  pi.registerCommand("ruta-secondary-model", {
    description: "Set or show the secondary model for /ruta-disagree",
    handler: async (args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const modelId = args.trim();
      if (!modelId) {
        ctx.ui.notify(state.secondary_model ? `Secondary model: ${state.secondary_model}` : "No secondary model configured", "info");
        return;
      }
      const next = { ...state, secondary_model: modelId };
      await saveProjectState(sessionDir, next);
      ctx.ui.notify(`Secondary model set to ${modelId}`, "success");
    },
  });

  pi.registerCommand("ruta-relocate", {
    description: "Update spec path after moving the spec file",
    handler: async (args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const newSpecPath = args.trim();
      if (!newSpecPath) {
        ctx.ui.notify("Usage: /ruta-relocate <new-spec-path>", "error");
        return;
      }
      const next = {
        ...state,
        spec_path: newSpecPath,
      };
      await saveProjectState(sessionDir, next);
      await maybeWarnAboutSpecHash(ctx, ctx.cwd, sessionDir);
      await refreshUi(ctx, ctx.cwd, next, sessionDir);
      ctx.ui.notify(`Spec path updated to ${newSpecPath}`, "success");
    },
  });

  pi.registerCommand("ruta-done-reading", {
    description: "Check the read gate and optionally advance to glossary mode",
    handler: async (_args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const paths = artifactPaths(sessionDir);
      const ok = await readGateSatisfied(paths.notebook, state.unity_sentence);
      const next = { ...state, gates: { ...state.gates, read_unlocked: ok || state.gates.read_unlocked } };
      await saveProjectState(sessionDir, next);
      if (!ok && !state.gates.read_unlocked) {
        ctx.ui.notify("Read gate not satisfied: add a notebook entry and set a unity sentence.", "warning");
        await refreshUi(ctx, ctx.cwd, next, sessionDir);
        return;
      }
      await refreshUi(ctx, ctx.cwd, next, sessionDir);
      const advance = await ctx.ui.confirm("Reading complete", "Advance to glossary mode?");
      if (advance) {
        const moved = await updateMode(sessionDir, next, "glossary");
        await refreshUi(ctx, ctx.cwd, moved, sessionDir);
      }
    },
  });

  pi.registerCommand("ruta-done-glossary", {
    description: "Check the glossary gate and optionally advance to reimplement mode",
    handler: async (_args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const paths = artifactPaths(sessionDir);
      const ok = await glossaryGateSatisfied(paths.glossary);
      const next = { ...state, gates: { ...state.gates, glossary_unlocked: ok || state.gates.glossary_unlocked } };
      await saveProjectState(sessionDir, next);
      if (!ok && !state.gates.glossary_unlocked) {
        ctx.ui.notify("Glossary gate not satisfied: add at least one term with a non-empty paraphrase.", "warning");
        await refreshUi(ctx, ctx.cwd, next, sessionDir);
        return;
      }
      await refreshUi(ctx, ctx.cwd, next, sessionDir);
      const advance = await ctx.ui.confirm("Glossary complete", "Advance to reimplement mode?");
      if (advance) {
        const moved = await updateMode(sessionDir, next, "reimplement");
        await refreshUi(ctx, ctx.cwd, moved, sessionDir);
      }
    },
  });

  pi.registerCommand("ruta-done-reimplement", {
    description: "Check the reimplement gate",
    handler: async (_args, ctx) => {
      const active = await loadStateOrNotify(ctx.cwd, ctx);
      if (!active) return;
      const { state, sessionDir } = active;
      const paths = artifactPaths(sessionDir);
      const ok = await reimplementGateSatisfied(path.join(sessionDir, state.spec_path), paths.gaps, state.scope);
      const next = { ...state, gates: { ...state.gates, reimplement_unlocked: ok || state.gates.reimplement_unlocked } };
      await saveProjectState(sessionDir, next);
      await refreshUi(ctx, ctx.cwd, next, sessionDir);
      if (!ok && !state.gates.reimplement_unlocked) {
        ctx.ui.notify("Reimplement gate not satisfied: gaps.md needs at least one entry per major section (heuristic).", "warning");
        return;
      }
      ctx.ui.notify("Reimplement gate satisfied.", "success");
    },
  });
}
