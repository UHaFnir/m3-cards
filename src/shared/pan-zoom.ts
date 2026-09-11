import { stopSwipe } from "./swipe";

// Pinch, drag and wheel zoom for a picture inside a card.
//
// WHY THIS IS NOT `touch-action: pinch-zoom`
//
// The browser's own pinch zooms the *page*, not the element, and on a
// dashboard that means zooming the whole Lovelace view. What is wanted here is
// the picture getting bigger inside a box that stays put, which is a transform
// this has to own.
//
// WHY IT SHOUTS ABOUT THE SWIPE PLUGIN
//
// `hass-swipe-navigation` listens for touch and mouse drags on an ancestor, in
// the bubble phase, and turns a horizontal one into a page change. Dragging a
// map sideways is exactly that gesture. Every pointer this class handles is
// therefore also passed to `stopSwipe` — the same shield the light card's
// slider and the chip row use — and the element takes `touch-action: none` so
// the browser does not pan the page underneath as well. Both are needed: the
// CSS stops the browser, `stopSwipe` stops the plugin's own JS listeners.

export interface PanZoomState {
  scale: number;
  x: number;
  y: number;
}

export const PAN_ZOOM_IDENTITY: PanZoomState = { scale: 1, x: 0, y: 0 };

export interface PanZoomOptions {
  min?: number;
  max?: number;
  onChange: (state: PanZoomState) => void;
  /** Told whether a gesture actually moved, so a tap can be told from a drag. */
  onGestureEnd?: (moved: boolean) => void;
}

/**
 * Clamps the offset so the picture can never be dragged completely out of the
 * frame. At scale 1 there is nothing to pan, and the offset is pinned to zero
 * rather than left wherever the last gesture put it.
 */
export function clampPan(state: PanZoomState, width: number, height: number): PanZoomState {
  if (state.scale <= 1) return { scale: state.scale, x: 0, y: 0 };
  const maxX = ((state.scale - 1) * width) / 2;
  const maxY = ((state.scale - 1) * height) / 2;
  return {
    scale: state.scale,
    x: Math.max(-maxX, Math.min(maxX, state.x)),
    y: Math.max(-maxY, Math.min(maxY, state.y)),
  };
}

export class PanZoom {
  private _pointers = new Map<number, { x: number; y: number }>();
  private _state: PanZoomState = { ...PAN_ZOOM_IDENTITY };
  private _startDistance = 0;
  private _startScale = 1;
  private _moved = false;
  private _min: number;
  private _max: number;

  public constructor(private readonly _opts: PanZoomOptions) {
    this._min = _opts.min ?? 1;
    this._max = _opts.max ?? 4;
  }

  public get state(): PanZoomState {
    return this._state;
  }

  public get zoomed(): boolean {
    return this._state.scale > 1.001;
  }

  public reset(): void {
    this._state = { ...PAN_ZOOM_IDENTITY };
    this._opts.onChange(this._state);
  }

  /** Jumps between 1× and `to`, which is what a double tap should do. */
  public toggle(to = 2): void {
    this._state = this.zoomed ? { ...PAN_ZOOM_IDENTITY } : { scale: to, x: 0, y: 0 };
    this._opts.onChange(this._state);
  }

  private _emit(el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    this._state = clampPan(this._state, rect.width, rect.height);
    this._opts.onChange(this._state);
  }

  public onPointerDown = (e: PointerEvent): void => {
    stopSwipe(e);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._moved = false;
    if (this._pointers.size === 2) {
      this._startDistance = this._distance();
      this._startScale = this._state.scale;
    }
  };

  public onPointerMove = (e: PointerEvent): void => {
    if (!this._pointers.has(e.pointerId)) return;
    stopSwipe(e);
    const previous = this._pointers.get(e.pointerId)!;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = e.currentTarget as HTMLElement;

    if (this._pointers.size >= 2) {
      const distance = this._distance();
      if (this._startDistance > 0) {
        const next = (this._startScale * distance) / this._startDistance;
        this._state = {
          ...this._state,
          scale: Math.max(this._min, Math.min(this._max, next)),
        };
        this._moved = true;
        this._emit(el);
      }
      return;
    }

    // One finger pans, but only once there is something to pan to. At 1× a
    // drag is left alone so the card scrolls the way the dashboard does.
    if (!this.zoomed) return;
    const dx = e.clientX - previous.x;
    const dy = e.clientY - previous.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._moved = true;
    this._state = { ...this._state, x: this._state.x + dx, y: this._state.y + dy };
    this._emit(el);
  };

  public onPointerUp = (e: PointerEvent): void => {
    if (!this._pointers.has(e.pointerId)) return;
    stopSwipe(e);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    this._pointers.delete(e.pointerId);
    if (this._pointers.size === 0) {
      this._opts.onGestureEnd?.(this._moved);
      this._moved = false;
    }
  };

  public onWheel = (e: WheelEvent): void => {
    // Only when the picture is the thing being pointed at; without the
    // preventDefault the page scrolls instead and the zoom feels ignored.
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this._state = {
      ...this._state,
      scale: Math.max(this._min, Math.min(this._max, this._state.scale * factor)),
    };
    this._emit(el);
  };

  private _distance(): number {
    const [a, b] = [...this._pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
