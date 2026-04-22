import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

export function makeTextViewerFrame(
  content: string,
  options: { scrollTop: number; bodyHeight: number; width: number },
): string[] {
  const lines = content.split("\n");
  const bodyHeight = Math.max(1, options.bodyHeight);
  const maxScrollTop = Math.max(1, lines.length - bodyHeight + 1);
  const scrollTop = Math.max(1, Math.min(options.scrollTop, maxScrollTop));
  return lines
    .slice(scrollTop - 1, scrollTop - 1 + bodyHeight)
    .map((line) => truncateToWidth(line, Math.max(0, options.width)));
}

class RutaTextViewer {
  private readonly lines: string[];
  private scrollTop = 1;

  constructor(
    private readonly tui: { requestRender: () => void },
    private readonly theme: any,
    private readonly title: string,
    content: string,
    private readonly done: (value: undefined) => void,
  ) {
    this.lines = content.split("\n");
  }

  handleInput(data: string): void {
    const bodyHeight = this.bodyHeight();
    const maxScrollTop = Math.max(1, this.lines.length - bodyHeight + 1);

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
    const frame = makeTextViewerFrame(this.lines.join("\n"), {
      scrollTop: this.scrollTop,
      bodyHeight,
      width,
    });

    const maxScrollTop = Math.max(1, this.lines.length - bodyHeight + 1);

    return [
      truncateToWidth(this.theme.fg("accent", this.theme.bold(this.title)), width),
      truncateToWidth(this.theme.fg("dim", "↑↓ scroll • pgup/pgdn • home/end • enter/esc/q close"), width),
      ...frame,
      truncateToWidth(this.theme.fg("muted", `lines ${Math.min(this.scrollTop, this.lines.length)}-${Math.min(this.scrollTop + bodyHeight - 1, this.lines.length)} of ${this.lines.length} • scroll ${this.scrollTop}/${maxScrollTop}`), width),
    ];
  }

  invalidate(): void {}

  private bodyHeight(): number {
    const rows = process.stdout.rows ?? 24;
    return Math.max(6, rows - 4);
  }
}

export async function openTextViewer(ctx: any, title: string, content: string): Promise<void> {
  if (!ctx.hasUI) return;
  await ctx.ui.custom((tui: any, theme: any, _keybindings: any, done: (value: undefined) => void) => (
    new RutaTextViewer(tui, theme, title, content, done)
  ));
}
