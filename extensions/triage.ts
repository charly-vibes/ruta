import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { appendMarkdown, formatGapEntry, nextGapIndex, type TriageToken } from "./state.ts";

// ---------------------------------------------------------------------------
// Pure helpers (testable)
// ---------------------------------------------------------------------------

/**
 * Extract triage-able lines from a gap-probe response.
 * Drops blank lines and numbered section headers (e.g. "1. DECISIONS:").
 */
export function parseProbeLines(probeText: string): string[] {
  return probeText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^\d+\.\s+[A-Z ]+:?\s*$/.test(l));
}

export function makeTriageFrame(
  lines: string[],
  options: { cursorLine: number; scrollTop: number; bodyHeight: number; width: number },
): string[] {
  const gutterWidth = Math.max(2, String(lines.length).length);
  const bodyHeight = Math.max(1, options.bodyHeight);
  const maxScrollTop = Math.max(1, lines.length - bodyHeight + 1);
  let scrollTop = Math.max(1, Math.min(options.scrollTop, maxScrollTop));
  if (options.cursorLine < scrollTop) scrollTop = options.cursorLine;
  if (options.cursorLine >= scrollTop + bodyHeight) scrollTop = options.cursorLine - bodyHeight + 1;
  scrollTop = clamp(scrollTop, 1, maxScrollTop);

  const visible = lines.slice(scrollTop - 1, scrollTop - 1 + bodyHeight);
  return visible.map((line, offset) => {
    const lineNumber = scrollTop + offset;
    const prefix = lineNumber === options.cursorLine ? "> " : "  ";
    const gutter = `${prefix}${String(lineNumber).padStart(gutterWidth)}  `;
    const contentWidth = Math.max(0, options.width - gutter.length);
    return `${gutter}${truncateLine(line, contentWidth)}`;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function truncateLine(input: string, width: number): string {
  if (width <= 0) return "";
  if (input.length <= width) return input;
  if (width === 1) return "…";
  return `${input.slice(0, width - 1)}…`;
}

// ---------------------------------------------------------------------------
// Triage TUI component
// ---------------------------------------------------------------------------

class RutaTriageView {
  private cursorLine: number;
  private scrollTop: number;
  private accepted: Set<number> = new Set();
  private discarded: Set<number> = new Set();

  constructor(
    private readonly tui: { requestRender: () => void },
    private readonly theme: any,
    private readonly lines: string[],
    private readonly done: (value: undefined) => void,
  ) {
    this.cursorLine = 1;
    this.scrollTop = 1;
  }

  handleInput(data: string): void {
    const bodyHeight = this.bodyHeight();

    if (matchesKey(data, Key.escape) || data === "q") {
      this.done(undefined);
      return;
    }
    if (matchesKey(data, Key.up)) {
      this.cursorLine = clamp(this.cursorLine - 1, 1, this.lines.length);
    } else if (matchesKey(data, Key.down)) {
      this.cursorLine = clamp(this.cursorLine + 1, 1, this.lines.length);
    } else if (matchesKey(data, Key.pageUp)) {
      this.cursorLine = clamp(this.cursorLine - bodyHeight, 1, this.lines.length);
    } else if (matchesKey(data, Key.pageDown)) {
      this.cursorLine = clamp(this.cursorLine + bodyHeight, 1, this.lines.length);
    } else if (data === "a" || matchesKey(data, Key.enter)) {
      this.accepted.add(this.cursorLine);
      this.discarded.delete(this.cursorLine);
      this.cursorLine = clamp(this.cursorLine + 1, 1, this.lines.length);
    } else if (data === "d") {
      this.discarded.add(this.cursorLine);
      this.accepted.delete(this.cursorLine);
      this.cursorLine = clamp(this.cursorLine + 1, 1, this.lines.length);
    } else {
      return;
    }
    this.ensureCursorVisible(bodyHeight);
    this.tui.requestRender();
  }

  getAcceptedLines(): string[] {
    return [...this.accepted].sort((a, b) => a - b).map((i) => this.lines[i - 1]!);
  }

  render(width: number): string[] {
    const bodyHeight = this.bodyHeight();
    this.ensureCursorVisible(bodyHeight);

    const frame = makeTriageFrame(this.lines, {
      cursorLine: this.cursorLine,
      scrollTop: this.scrollTop,
      bodyHeight,
      width,
    }).map((line, offset) => {
      const lineNumber = this.scrollTop + offset;
      if (this.accepted.has(lineNumber)) return this.theme.fg("success", line);
      if (this.discarded.has(lineNumber)) return this.theme.fg("dim", line);
      return line.startsWith("> ") ? this.theme.fg("accent", line) : line;
    });

    const accepted = this.accepted.size;
    const total = this.lines.length;
    return [
      truncateToWidth(this.theme.fg("accent", this.theme.bold("Gap triage")), width),
      truncateToWidth(
        this.theme.fg("dim", "↑↓ move • a/enter accept • d discard • q done"),
        width,
      ),
      ...frame,
      truncateToWidth(
        this.theme.fg("muted", `${accepted} accepted · ${total - accepted - this.discarded.size} remaining · q to finish`),
        width,
      ),
    ];
  }

  invalidate(): void {}

  private bodyHeight(): number {
    const rows = process.stdout.rows ?? 24;
    return Math.max(6, rows - 4);
  }

  private ensureCursorVisible(bodyHeight: number): void {
    const maxScrollTop = Math.max(1, this.lines.length - bodyHeight + 1);
    if (this.cursorLine < this.scrollTop) this.scrollTop = this.cursorLine;
    if (this.cursorLine >= this.scrollTop + bodyHeight) this.scrollTop = this.cursorLine - bodyHeight + 1;
    this.scrollTop = clamp(this.scrollTop, 1, maxScrollTop);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function openTriageView(
  ctx: any,
  probeText: string,
  section: string,
  gapsPath: string,
  triageState: TriageToken | null,
  clearToken: () => void,
): Promise<void> {
  const lines = parseProbeLines(probeText);
  if (lines.length === 0) {
    ctx.ui.notify("Probe produced no triage-able items.", "info");
    clearToken();
    return;
  }

  let view!: RutaTriageView;
  await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: undefined) => void) => {
    view = new RutaTriageView(tui, theme, lines, done);
    return view;
  });

  const accepted = view.getAcceptedLines();
  if (accepted.length === 0) {
    ctx.ui.notify("No items accepted — nothing added to gaps.md.", "info");
    clearToken();
    return;
  }

  // At this point the token was validated by the triage UI — no external input involved.
  if (triageState === null) {
    ctx.ui.notify("Triage token expired — cannot append gaps.", "error");
    return;
  }

  let appended = 0;
  try {
    for (const line of accepted) {
      const index = await nextGapIndex(gapsPath);
      const draft = formatGapEntry(index, {
        citation: `§ ${section}`,
        decisionForced: line,
        raisedInSession: new Date().toISOString().slice(0, 10),
      });
      const edited = await ctx.ui.editor(`Gap entry from triage: ${section}`, draft);
      if (edited !== undefined && edited.trim()) {
        await appendMarkdown(gapsPath, `\n${edited.trim()}\n`);
        appended++;
      }
    }
  } finally {
    clearToken();
  }
  ctx.ui.notify(`${appended} gap(s) appended from triage.`, "success");
}
