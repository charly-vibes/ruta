import path from "node:path";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { readText, type RutaProjectState } from "./state.ts";

export function findSpecLineForSection(specText: string, section?: string): number {
  const query = section?.trim().toLowerCase();
  if (!query) return 1;

  const lines = splitSpecLines(specText);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line.startsWith("#")) continue;
    const heading = line.replace(/^#{1,6}\s+/, "").trim().toLowerCase();
    if (heading.includes(query)) return index + 1;
  }
  return 1;
}

export function makeSpecViewerFrame(
  specText: string,
  options: { cursorLine: number; scrollTop: number; bodyHeight: number; width: number },
): string[] {
  const lines = splitSpecLines(specText);
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
    return `${gutter}${truncatePlainText(line, contentWidth)}`;
  });
}

function splitSpecLines(specText: string): string[] {
  const lines = specText.split("\n");
  return lines.length > 0 ? lines : [""];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function truncatePlainText(input: string, width: number): string {
  if (width <= 0) return "";
  if (input.length <= width) return input;
  if (width === 1) return "…";
  return `${input.slice(0, width - 1)}…`;
}

class RutaSpecViewer {
  private readonly lines: string[];
  private readonly title: string;
  private cursorLine: number;
  private scrollTop: number;

  constructor(
    private readonly tui: { requestRender: () => void },
    private readonly theme: any,
    title: string,
    specText: string,
    initialLine: number,
    private readonly done: (value: undefined) => void,
  ) {
    this.lines = splitSpecLines(specText);
    this.title = title;
    this.cursorLine = clamp(initialLine, 1, this.lines.length);
    this.scrollTop = this.initialScrollTop();
  }

  handleInput(data: string): void {
    const bodyHeight = this.bodyHeight();

    if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || data === "q") {
      this.done(undefined);
      return;
    }
    if (matchesKey(data, Key.up)) this.cursorLine = clamp(this.cursorLine - 1, 1, this.lines.length);
    else if (matchesKey(data, Key.down)) this.cursorLine = clamp(this.cursorLine + 1, 1, this.lines.length);
    else if (matchesKey(data, Key.pageUp)) this.cursorLine = clamp(this.cursorLine - bodyHeight, 1, this.lines.length);
    else if (matchesKey(data, Key.pageDown)) this.cursorLine = clamp(this.cursorLine + bodyHeight, 1, this.lines.length);
    else if (matchesKey(data, Key.home)) this.cursorLine = 1;
    else if (matchesKey(data, Key.end)) this.cursorLine = this.lines.length;
    else return;

    this.ensureCursorVisible(bodyHeight);
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const bodyHeight = this.bodyHeight();
    this.ensureCursorVisible(bodyHeight);
    const frame = makeSpecViewerFrame(this.lines.join("\n"), {
      cursorLine: this.cursorLine,
      scrollTop: this.scrollTop,
      bodyHeight,
      width,
    });

    return [
      truncateToWidth(this.theme.fg("accent", this.theme.bold(this.title)), width),
      truncateToWidth(this.theme.fg("dim", "↑↓ move • pgup/pgdn scroll • home/end jump • enter/esc/q close"), width),
      ...frame.map((line) => line.startsWith("> ") ? this.theme.fg("accent", line) : line),
      truncateToWidth(this.theme.fg("muted", `line ${this.cursorLine}/${this.lines.length}`), width),
    ];
  }

  invalidate(): void {}

  private bodyHeight(): number {
    const rows = process.stdout.rows ?? 24;
    return Math.max(6, rows - 4);
  }

  private initialScrollTop(): number {
    const bodyHeight = this.bodyHeight();
    return clamp(this.cursorLine - Math.floor(bodyHeight / 3), 1, Math.max(1, this.lines.length - bodyHeight + 1));
  }

  private ensureCursorVisible(bodyHeight: number): void {
    const maxScrollTop = Math.max(1, this.lines.length - bodyHeight + 1);
    if (this.cursorLine < this.scrollTop) this.scrollTop = this.cursorLine;
    if (this.cursorLine >= this.scrollTop + bodyHeight) this.scrollTop = this.cursorLine - bodyHeight + 1;
    this.scrollTop = clamp(this.scrollTop, 1, maxScrollTop);
  }
}

export async function openSpecViewer(
  ctx: any,
  cwd: string,
  state: RutaProjectState,
  section?: string,
): Promise<void> {
  const specPath = path.join(cwd, state.spec_path);
  const specText = await readText(specPath);
  const initialLine = findSpecLineForSection(specText, section);
  await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: undefined) => void) => (
    new RutaSpecViewer(tui, theme, `ruta spec viewer — ${state.spec_path}`, specText, initialLine, done)
  ));
}
