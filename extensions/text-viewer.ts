import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

function wrapLine(line: string, width: number): string[] {
  if (width <= 0 || line.length <= width) return [line];
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > width) {
    // prefer breaking at a space
    let breakAt = remaining.lastIndexOf(" ", width);
    if (breakAt <= 0) breakAt = width;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).replace(/^ /, "");
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export function makeTextViewerFrame(
  content: string,
  options: { scrollTop: number; bodyHeight: number; width: number },
): string[] {
  const lines = content.split("\n");
  const bodyHeight = Math.max(1, options.bodyHeight);
  const maxScrollTop = Math.max(1, lines.length - bodyHeight + 1);
  const scrollTop = Math.max(1, Math.min(options.scrollTop, maxScrollTop));
  const wrappedLines = lines.flatMap((line) => wrapLine(line, options.width));
  const maxScrollTopWrapped = Math.max(1, wrappedLines.length - bodyHeight + 1);
  const clampedScrollTop = Math.max(1, Math.min(scrollTop, maxScrollTopWrapped));
  return wrappedLines.slice(clampedScrollTop - 1, clampedScrollTop - 1 + bodyHeight);
}

class RutaTextViewer {
  private readonly rawLines: string[];
  private scrollTop = 1;

  constructor(
    private readonly tui: { requestRender: () => void },
    private readonly theme: any,
    private readonly title: string,
    content: string,
    private readonly done: (value: undefined) => void,
  ) {
    this.rawLines = content.split("\n");
  }

  handleInput(data: string): void {
    const width = process.stdout.columns ?? 80;
    const bodyHeight = this.bodyHeight();
    const wrapped = this.rawLines.flatMap((l) => wrapLine(l, width));
    const maxScrollTop = Math.max(1, wrapped.length - bodyHeight + 1);

    if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || data === "q") {
      this.done(undefined);
      return;
    }

    if (matchesKey(data, Key.up)) this.scrollTop = Math.max(1, this.scrollTop - 1);
    else if (matchesKey(data, Key.down)) this.scrollTop = Math.min(maxScrollTop, this.scrollTop + 1);
    else if (matchesKey(data, Key.pageUp)) this.scrollTop = Math.max(1, this.scrollTop - bodyHeight);
    else if (matchesKey(data, Key.pageDown)) this.scrollTop = Math.min(maxScrollTop, this.scrollTop + bodyHeight);
    else if (matchesKey(data, Key.home)) this.scrollTop = 1;
    else if (matchesKey(data, Key.end)) this.scrollTop = maxScrollTop;
    else return;

    this.tui.requestRender();
  }

  render(width: number): string[] {
    const bodyHeight = this.bodyHeight();
    const wrapped = this.rawLines.flatMap((l) => wrapLine(l, width));
    const maxScrollTop = Math.max(1, wrapped.length - bodyHeight + 1);
    const clampedScrollTop = Math.max(1, Math.min(this.scrollTop, maxScrollTop));
    const frame = wrapped.slice(clampedScrollTop - 1, clampedScrollTop - 1 + bodyHeight);

    const canScroll = maxScrollTop > 1;
    const hint = canScroll
      ? "↑↓ scroll • pgup/pgdn • home/end • enter/esc/q close"
      : "enter/esc/q close";

    return [
      truncateToWidth(this.theme.fg("accent", this.theme.bold(this.title)), width),
      truncateToWidth(this.theme.fg("dim", hint), width),
      ...frame,
      truncateToWidth(this.theme.fg("muted", `lines ${clampedScrollTop}-${Math.min(clampedScrollTop + bodyHeight - 1, wrapped.length)} of ${wrapped.length}`), width),
    ];
  }

  invalidate(): void {}

  private bodyHeight(): number {
    const rows = process.stdout.rows ?? 24;
    return Math.max(6, Math.min(rows - 4, 20));
  }
}

export async function openTextViewer(ctx: any, title: string, content: string): Promise<void> {
  if (!ctx.hasUI) return;
  await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: undefined) => void) => (
    new RutaTextViewer(tui, theme, title, content, done)
  ));
}
