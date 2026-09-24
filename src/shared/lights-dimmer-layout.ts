export interface ViewportSizeInput {
  orientation: "horizontal" | "vertical";
  /** Visible tiles; undefined/0 means "show everything, don't cap the viewport". */
  maxItems?: number;
  /** Horizontal only — ignored (as 1) for vertical, which is always a single row. */
  columns: number;
  /** Tile thickness (horizontal rows) or length (vertical columns), in px. */
  tileSize: number;
  gap: number;
}

export interface ViewportSizeResult {
  /** CSS max-height for the horizontal scroll container; unset = unbounded (card grows). */
  maxHeight?: string;
  /** CSS width for each vertical tile; unset = let flex-basis/min-width size it. */
  columnWidth?: string;
}

// Both branches are expressible as plain CSS (a row count times a known tile
// size, or a percentage split of the container) — no ResizeObserver/JS
// measurement needed. That keeps the "exactly n visible" guarantee exact even
// while the card is resizing, instead of chasing a stale measurement.
export function viewportSize(input: ViewportSizeInput): ViewportSizeResult {
  const { orientation, maxItems, columns, tileSize, gap } = input;
  if (!maxItems || maxItems <= 0) return {};
  if (orientation === "horizontal") {
    const cols = Math.max(1, columns);
    const rows = Math.ceil(maxItems / cols);
    return { maxHeight: `${rows * tileSize + (rows - 1) * gap}px` };
  }
  return { columnWidth: `calc((100% - ${(maxItems - 1) * gap}px) / ${maxItems})` };
}
