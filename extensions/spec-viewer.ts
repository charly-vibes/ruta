import path from "node:path";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import {
  appendSpecComment,
  artifactPaths,
  createSpecComment,
  listSpecComments,
  readText,
  type RutaProjectState,
  type SpecComment,
} from "./state.ts";

export function findSpecLineForSection(specText: string, section?: string): number | null {
  const query = section?.trim().toLowerCase();
  if (!query) return 1;

  const lines = splitSpecLines(specText);
  const headings: Array<{ line: number; heading: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line.startsWith("#")) continue;
    headings.push({ line: index + 1, heading: line.replace(/^#{1,6}\s+/, "").trim().toLowerCase() });
  }

  const exact = headings.filter((h) => h.heading === query);
  if (exact.length > 0) return exact[0]!.line;

  const partial = headings.filter((h) => h.heading.includes(query));
  if (partial.length === 1) return partial[0]!.line;

  return null;
}

export function makeSpecViewerFrame(
  specText: string,
  options: { cursorLine: number; scrollTop: number; bodyHeight: number; width: number; commentLines?: Iterable<number> },
): string[] {
  const lines = splitSpecLines(specText);
  const commentLines = new Set(options.commentLines ?? []);
  const hasComments = commentLines.size > 0;
  const gutterWidth = hasComments ? String(lines.length).length : Math.max(2, String(lines.length).length);
  const bodyHeight = Math.max(1, options.bodyHeight);
  const maxScrollTop = Math.max(1, lines.length - bodyHeight + 1);
  let scrollTop = Math.max(1, Math.min(options.scrollTop, maxScrollTop));
  if (options.cursorLine < scrollTop) scrollTop = options.cursorLine;
  if (options.cursorLine >= scrollTop + bodyHeight) scrollTop = options.cursorLine - bodyHeight + 1;
  scrollTop = clamp(scrollTop, 1, maxScrollTop);
  const visible = lines.slice(scrollTop - 1, scrollTop - 1 + bodyHeight);

  return visible.map((line, offset) => {
    const lineNumber = scrollTop + offset;
    const gutter = hasComments
      ? `${lineNumber === options.cursorLine ? ">" : " "}${commentLines.has(lineNumber) ? "*" : " "} ${String(lineNumber).padStart(gutterWidth)}  `
      : `${lineNumber === options.cursorLine ? "> " : "  "}${String(lineNumber).padStart(gutterWidth)}  `;
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
  private comments: SpecComment[];
  private statusMessage = "";
  private savingComment = false;

  constructor(
    private readonly tui: { requestRender: () => void },
    private readonly theme: any,
    title: string,
    specText: string,
    initialLine: number,
    initialComments: SpecComment[],
    private readonly addCommentAtLine: (lineNumber: number) => Promise<SpecComment | null>,
    private readonly done: (value: undefined) => void,
  ) {
    this.lines = splitSpecLines(specText);
    this.title = title;
    this.cursorLine = clamp(initialLine, 1, this.lines.length);
    this.scrollTop = this.initialScrollTop();
    this.comments = initialComments;
  }

  handleInput(data: string): void {
    const bodyHeight = this.bodyHeight();

    if (matchesKey(data, Key.alt("c"))) {
      if (!this.savingComment) void this.handleAddComment();
      return;
    }
    if (this.savingComment) return;
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
      commentLines: this.comments.map((comment) => comment.line),
    });

    return [
      truncateToWidth(this.theme.fg("accent", this.theme.bold(this.title)), width),
      truncateToWidth(this.theme.fg("dim", "↑↓ move • alt+c comment • pgup/pgdn scroll • home/end jump • enter/esc/q close"), width),
      ...frame.map((line) => line.startsWith(">") ? this.theme.fg("accent", line) : line),
      truncateToWidth(this.theme.fg("muted", this.statusLine()), width),
    ];
  }

  invalidate(): void {}

  private async handleAddComment(): Promise<void> {
    this.savingComment = true;
    this.statusMessage = `adding comment at line ${this.cursorLine}`;
    this.tui.requestRender();
    try {
      const comment = await this.addCommentAtLine(this.cursorLine);
      if (comment) {
        this.comments = [...this.comments, comment];
        this.statusMessage = `comment saved at line ${comment.line}`;
      } else {
        this.statusMessage = "comment cancelled";
      }
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.savingComment = false;
      this.tui.requestRender();
    }
  }

  private statusLine(): string {
    const commentCount = this.comments.length;
    const commentText = `${commentCount} comment${commentCount === 1 ? "" : "s"}`;
    const suffix = this.statusMessage ? ` • ${this.statusMessage}` : "";
    return `line ${this.cursorLine}/${this.lines.length} • ${commentText}${suffix}`;
  }

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
  const resolved = findSpecLineForSection(specText, section);
  if (section && resolved === null) {
    ctx.ui.notify(`Section not found or ambiguous: "${section}". Use an exact heading name.`, "warning");
    return;
  }
  const initialLine = resolved ?? 1;
  const commentsPath = artifactPaths(cwd).comments;
  const initialComments = await listSpecComments(commentsPath, state.spec_path);
  await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: undefined) => void) => (
    new RutaSpecViewer(
      tui,
      theme,
      `ruta spec viewer — ${state.spec_path}`,
      specText,
      initialLine,
      initialComments,
      async (lineNumber: number) => {
        const draft = await ctx.ui.editor(`Comment for ${state.spec_path}:${lineNumber}`, "");
        const text = draft?.trim();
        if (!text) return null;
        const comment = createSpecComment(specText, state.spec_path, lineNumber, text);
        await appendSpecComment(commentsPath, comment);
        ctx.ui.notify(`Comment saved at ${state.spec_path}:${comment.line}`, "success");
        return comment;
      },
      done,
    )
  ));
}
