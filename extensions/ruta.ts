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
  describeAccess,
  formatGapEntry,
  formatGlossaryEntry,
  getSpecSectionByRef,
  glossaryGateSatisfied,
  loadProjectState,
  modeFragment,
  nextGapIndex,
  readGapEntries,
  readGateSatisfied,
  readGlossaryEntries,
  readMajorSectionHeadings,
  readText,
  reimplementGateSatisfied,
  resetModeStateForSpecMismatch,
  saveProjectState,
  scaffoldProject,
  timestampPrefix,
  type RutaMode,
  type RutaProjectState,
  updateMode,
  verifySpecHash,
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

interface TriageState {
  token: string;
  issuedAt: number;
}

const WHY_TEXT = `ruta exists to keep AI from substituting fluency for comprehension. The restrictions are not missing features; they are the product. In read mode, AI is disabled so you have to form your own unity sentence and ignorance list. In glossary mode, AI is narrowed so it can test a paraphrase without writing one for you. In reimplement mode, AI can surface ambiguities, but it must not resolve them for you.`;

export default function ruta(pi: ExtensionAPI) {
  let triageState: TriageState | null = null;

  async function loadStateOrNotify(cwd: string, ctx: { ui: { notify: (message: string, level: "info" | "warning" | "error" | "success") => void } }): Promise<RutaProjectState | null> {
    const state = await loadProjectState(cwd);
    if (!state) {
      ctx.ui.notify("No ruta project found. Run /ruta-init <spec-path> first.", "warning");
      return null;
    }
    return state;
  }

  function modePrompt(mode: RutaMode): string {
    if (mode === "read") return READ_MODE_PROMPT;
    if (mode === "glossary") return GLOSSARY_MODE_PROMPT;
    return REIMPLEMENT_MODE_PROMPT;
  }

  async function refreshUi(ctx: any, cwd: string, state?: RutaProjectState | null) {
    const project = state ?? (await loadProjectState(cwd));
    if (!project) {
      ctx.ui.setStatus("ruta", undefined);
      ctx.ui.setWidget("ruta", undefined);
      return;
    }
    const paths = artifactPaths(cwd);
    const glossaryEntries = await readGlossaryEntries(paths.glossary);
    const status = `[${project.current_mode}] ${describeAccess(project.current_mode)} · gates: read=${project.gates.read_unlocked ? "✓" : "×"} glossary=${project.gates.glossary_unlocked ? "✓" : "×"} reimpl=${project.gates.reimplement_unlocked ? "✓" : "×"}`;
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

  async function maybeWarnAboutSpecHash(ctx: any, cwd: string) {
    const state = await loadProjectState(cwd);
    if (!state) return;
    const { matches, actual } = await verifySpecHash(cwd, state);
    if (!matches) {
      const shouldReset = await ctx.ui.confirm(
        "ruta: spec changed",
        "The canonicalized spec hash no longer matches this project's recorded hash. Reset mode state to read while preserving artifacts?",
      );
      const next = await resetModeStateForSpecMismatch(cwd, state, actual, !shouldReset);
      if (!shouldReset) {
        ctx.ui.notify("Spec hash updated without reset; recorded in mode history.", "warning");
      } else {
        ctx.ui.notify("Mode state reset to read due to spec change.", "warning");
      }
      await refreshUi(ctx, cwd, next);
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

  async function runParaphraseProbe(ctx: any, cwd: string, term: string): Promise<string> {
    const paths = artifactPaths(cwd);
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

  async function runGapProbe(ctx: any, cwd: string, sectionRef: string): Promise<string> {
    const state = await loadProjectState(cwd);
    if (!state) throw new Error("No ruta project loaded");
    const specPath = path.join(cwd, state.spec_path);
    const sectionText = await getSpecSectionByRef(specPath, sectionRef);
    const prompt = REIMPL_GAP_PROBE_PROMPT.replace("{section_text}", sectionText);
    return runCompletion(ctx, prompt);
  }

  async function showScratch(ctx: any, title: string, content: string) {
    await ctx.ui.editor(title, content);
  }

  function makeTriageToken(): string {
    triageState = {
      token: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      issuedAt: Date.now(),
    };
    return triageState.token;
  }

  function clearTriageToken() {
    triageState = null;
  }

  pi.on("session_start", async (_event, ctx) => {
    await refreshUi(ctx, ctx.cwd);
    await maybeWarnAboutSpecHash(ctx, ctx.cwd);
    const state = await loadProjectState(ctx.cwd);
    if (state?.prompt_bundle_hash) {
      const paths = artifactPaths(ctx.cwd);
      try {
        const shippedPromptHash = (await readText(path.join(ctx.cwd, "prompts-version.txt"))).trim();
        if (shippedPromptHash !== state.prompt_bundle_hash) {
          ctx.ui.notify("Prompt bundle hash differs from the one recorded when this project started.", "warning");
        }
      } catch {
        void paths;
      }
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearTriageToken();
    ctx.ui.setStatus("ruta", undefined);
    ctx.ui.setWidget("ruta", undefined);
  });

  pi.on("input", async (event, ctx) => {
    const state = await loadProjectState(ctx.cwd);
    if (!state) return { action: "continue" };
    if (event.text.startsWith("/")) return { action: "continue" };

    if (state.current_mode === "read") {
      ctx.ui.notify("AI is disabled in read mode. Use /ruta-why or /ruta-mode glossary after you finish reading.", "info");
      return { action: "handled" };
    }

    if (state.current_mode === "glossary") {
      ctx.ui.notify("Glossary mode blocks free-form chat. Use /ruta-add-term, /ruta-test, or /ruta-done-glossary.", "info");
      return { action: "handled" };
    }

    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const state = await loadProjectState(ctx.cwd);
    if (!state) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n${composeSystemPrompt(modePrompt(state.current_mode))}`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
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
      if (!triageState || token !== triageState.token) {
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
      const text = await runParaphraseProbe(ctx, ctx.cwd, params.term);
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
      const text = await runGapProbe(ctx, ctx.cwd, params.section_ref);
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
      if (!triageState || params.triage_token !== triageState.token) {
        throw new Error("ruta_add_gap requires a live triage token");
      }
      const paths = artifactPaths(ctx.cwd);
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

  pi.registerCommand("ruta-init", {
    description: "Initialize a ruta project in the current directory",
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
      const state = await scaffoldProject(ctx.cwd, specPath, disclosureAck);
      await refreshUi(ctx, ctx.cwd, state);
      ctx.ui.notify(`Initialized ruta project for ${state.spec_path}`, "success");
    },
  });

  pi.registerCommand("ruta-mode", {
    description: "Show or change the current ruta mode",
    handler: async (args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
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
      const next = await updateMode(ctx.cwd, state, requested);
      await refreshUi(ctx, ctx.cwd, next);
      ctx.ui.notify(`Switched to ${requested}`, "success");
    },
  });

  pi.registerCommand("ruta-status", {
    description: "Show current ruta mode, gates, and artifact summary",
    handler: async (_args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const paths = artifactPaths(ctx.cwd);
      const glossaryEntries = await readGlossaryEntries(paths.glossary);
      const gapEntries = await readGapEntries(paths.gaps);
      const headings = await readMajorSectionHeadings(path.join(ctx.cwd, state.spec_path));
      const summary = [
        `# ruta status`,
        "",
        `- mode: ${state.current_mode}`,
        `- access: ${describeAccess(state.current_mode)}`,
        `- spec: ${state.spec_path}`,
        `- read gate: ${state.gates.read_unlocked}`,
        `- glossary gate: ${state.gates.glossary_unlocked}`,
        `- reimplement gate: ${state.gates.reimplement_unlocked}`,
        `- glossary terms: ${glossaryEntries.length}`,
        `- gaps: ${gapEntries.length}`,
        `- major sections: ${headings.length}`,
        `- unity sentence: ${state.unity_sentence ?? "(missing)"}`,
      ].join("\n");
      await showScratch(ctx, "ruta status", summary);
    },
  });

  pi.registerCommand("ruta-why", {
    description: "Explain why ruta restricts AI in the current mode",
    handler: async (_args, ctx) => {
      await showScratch(ctx, "ruta why", WHY_TEXT);
    },
  });

  pi.registerCommand("ruta-note", {
    description: "Append a note to notebook.md with timestamp",
    handler: async (args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const text = args.trim();
      if (!text) {
        ctx.ui.notify("Usage: /ruta-note <text>", "error");
        return;
      }
      const paths = artifactPaths(ctx.cwd);
      await appendMarkdown(paths.notebook, `- ${timestampPrefix()} ${text}\n`);
      ctx.ui.notify("Added note to notebook.md", "success");
      await refreshUi(ctx, ctx.cwd, state);
    },
  });

  pi.registerCommand("ruta-unity", {
    description: "Set the unity sentence in .ruta/ruta.json",
    handler: async (args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const sentence = args.trim();
      if (!sentence) {
        ctx.ui.notify("Usage: /ruta-unity <sentence>", "error");
        return;
      }
      const next = { ...state, unity_sentence: sentence };
      await saveProjectState(ctx.cwd, next);
      await refreshUi(ctx, ctx.cwd, next);
      ctx.ui.notify("Unity sentence saved", "success");
    },
  });

  pi.registerCommand("ruta-add-term", {
    description: "Append a scaffolded glossary entry",
    handler: async (args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
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
      const paths = artifactPaths(ctx.cwd);
      await appendMarkdown(paths.glossary, `\n${edited.trim()}\n`);
      ctx.ui.notify(`Added glossary entry for ${term}`, "success");
      await refreshUi(ctx, ctx.cwd, state);
    },
  });

  pi.registerCommand("ruta-test", {
    description: "Run the paraphrase-adequacy probe for a glossary term",
    handler: async (args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const term = args.trim();
      if (!term) {
        ctx.ui.notify("Usage: /ruta-test <term>", "error");
        return;
      }
      try {
        const sentence = await runParaphraseProbe(ctx, ctx.cwd, term);
        await showScratch(ctx, `Paraphrase probe: ${term}`, `${sentence}\n\nRevise your paraphrase in glossary.md if this sentence exposes a mismatch.`);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("ruta-scope", {
    description: "Set or show the reimplementation scope",
    handler: async (args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const scope = args.trim();
      if (!scope) {
        ctx.ui.notify(state.scope ? `Current scope: ${state.scope}` : "No scope declared", "info");
        return;
      }
      const next = { ...state, scope };
      await saveProjectState(ctx.cwd, next);
      await refreshUi(ctx, ctx.cwd, next);
      ctx.ui.notify(`Scope set to ${scope}`, "success");
    },
  });

  pi.registerCommand("ruta-probe", {
    description: "Run a gap probe against a spec section",
    handler: async (args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const section = args.trim();
      if (!section) {
        ctx.ui.notify("Usage: /ruta-probe <section>", "error");
        return;
      }
      try {
        const probe = await runGapProbe(ctx, ctx.cwd, section);
        const token = makeTriageToken();
        await refreshUi(ctx, ctx.cwd, state);
        await showScratch(
          ctx,
          `Gap probe: ${section}`,
          `${probe}\n\nTriage token active for /ruta_add_gap: ${token}\nUse /ruta-add-gap to convert accepted lines into structured entries.`,
        );
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      } finally {
        clearTriageToken();
        await refreshUi(ctx, ctx.cwd, state);
      }
    },
  });

  pi.registerCommand("ruta-add-gap", {
    description: "Append a manual gap entry to gaps.md",
    handler: async (_args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const paths = artifactPaths(ctx.cwd);
      const draft = formatGapEntry(await nextGapIndex(paths.gaps), { raisedInSession: new Date().toISOString().slice(0, 10) });
      const edited = await ctx.ui.editor("New gap entry", draft);
      if (edited === undefined) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }
      await appendMarkdown(paths.gaps, `\n${edited.trim()}\n`);
      ctx.ui.notify("Added gap entry", "success");
      await refreshUi(ctx, ctx.cwd, state);
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

  pi.registerCommand("ruta-disagree", {
    description: "Re-run the latest user prompt against a secondary model when available",
    handler: async (_args, ctx) => {
      if (!ctx.model) {
        ctx.ui.notify("No active model selected", "error");
        return;
      }
      const available = ctx.modelRegistry.getAvailable();
      const secondary = available.find((candidate) => candidate.provider !== ctx.model?.provider);
      if (!secondary) {
        ctx.ui.notify("No secondary provider-configured model available; /ruta-disagree is disabled.", "warning");
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
          systemPrompt: composeSystemPrompt(modePrompt((await loadProjectState(ctx.cwd))?.current_mode ?? "reimplement")),
          messages: [{
            role: "user",
            content: [{ type: "text", text: userText }],
            timestamp: Date.now(),
          }],
        },
        { apiKey: auth.apiKey, headers: auth.headers },
      );
      const secondaryText = response.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      const diffText = [
        `# ruta disagree`,
        "",
        `## Primary (${ctx.model.id})`,
        assistantText || "(no prior assistant text found)",
        "",
        `## Secondary (${secondary.id})`,
        secondaryText,
        "",
        "Reminder: agreement between models is not evidence of spec clarity.",
      ].join("\n");
      await showScratch(ctx, "ruta disagree", diffText);
    },
  });

  pi.registerCommand("ruta-relocate", {
    description: "Update spec path after moving the spec file",
    handler: async (args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const newSpecPath = args.trim();
      if (!newSpecPath) {
        ctx.ui.notify("Usage: /ruta-relocate <new-spec-path>", "error");
        return;
      }
      const next = {
        ...state,
        spec_path: newSpecPath,
      };
      await saveProjectState(ctx.cwd, next);
      await maybeWarnAboutSpecHash(ctx, ctx.cwd);
      await refreshUi(ctx, ctx.cwd);
      ctx.ui.notify(`Spec path updated to ${newSpecPath}`, "success");
    },
  });

  pi.registerCommand("ruta-done-reading", {
    description: "Check the read gate and optionally advance to glossary mode",
    handler: async (_args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const paths = artifactPaths(ctx.cwd);
      const ok = await readGateSatisfied(paths.notebook, state.unity_sentence);
      const next = { ...state, gates: { ...state.gates, read_unlocked: ok || state.gates.read_unlocked } };
      await saveProjectState(ctx.cwd, next);
      if (!ok && !state.gates.read_unlocked) {
        ctx.ui.notify("Read gate not satisfied: add a notebook entry and set a unity sentence.", "warning");
        await refreshUi(ctx, ctx.cwd, next);
        return;
      }
      await refreshUi(ctx, ctx.cwd, next);
      const advance = await ctx.ui.confirm("Reading complete", "Advance to glossary mode?");
      if (advance) {
        const moved = await updateMode(ctx.cwd, next, "glossary");
        await refreshUi(ctx, ctx.cwd, moved);
      }
    },
  });

  pi.registerCommand("ruta-done-glossary", {
    description: "Check the glossary gate and optionally advance to reimplement mode",
    handler: async (_args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const paths = artifactPaths(ctx.cwd);
      const ok = await glossaryGateSatisfied(paths.glossary);
      const next = { ...state, gates: { ...state.gates, glossary_unlocked: ok || state.gates.glossary_unlocked } };
      await saveProjectState(ctx.cwd, next);
      if (!ok && !state.gates.glossary_unlocked) {
        ctx.ui.notify("Glossary gate not satisfied: add at least one term with a non-empty paraphrase.", "warning");
        await refreshUi(ctx, ctx.cwd, next);
        return;
      }
      await refreshUi(ctx, ctx.cwd, next);
      const advance = await ctx.ui.confirm("Glossary complete", "Advance to reimplement mode?");
      if (advance) {
        const moved = await updateMode(ctx.cwd, next, "reimplement");
        await refreshUi(ctx, ctx.cwd, moved);
      }
    },
  });

  pi.registerCommand("ruta-done-reimplement", {
    description: "Check the reimplement gate",
    handler: async (_args, ctx) => {
      const state = await loadStateOrNotify(ctx.cwd, ctx);
      if (!state) return;
      const paths = artifactPaths(ctx.cwd);
      const ok = await reimplementGateSatisfied(path.join(ctx.cwd, state.spec_path), paths.gaps, state.scope);
      const next = { ...state, gates: { ...state.gates, reimplement_unlocked: ok || state.gates.reimplement_unlocked } };
      await saveProjectState(ctx.cwd, next);
      await refreshUi(ctx, ctx.cwd, next);
      if (!ok && !state.gates.reimplement_unlocked) {
        ctx.ui.notify("Reimplement gate not satisfied: gaps.md needs at least one entry per major section (heuristic).", "warning");
        return;
      }
      ctx.ui.notify("Reimplement gate satisfied.", "success");
    },
  });
}
