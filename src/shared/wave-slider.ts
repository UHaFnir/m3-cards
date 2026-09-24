import { LitElement, html, css, svg, unsafeCSS, nothing, type PropertyValues } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";
import type { WaveStyle } from "../types";
import {
  LIGHT_WAVE_AMPLITUDE,
  LIGHT_WAVE_WAVELENGTH,
  LIGHT_WAVE_PHASE_SPEED,
  LIGHT_WAVE_STROKE,
  LIGHT_WAVE_GAP,
  LIGHT_WAVE_AMPLITUDE_LERP,
  LIGHT_WAVE_HEIGHT,
  LIGHT_HANDLE_WIDTH,
  LIGHT_HANDLE_HEIGHT,
  LIGHT_HANDLE_RADIUS,
  LIGHT_MIN_BRIGHTNESS_PCT,
  LIGHT_DRAG_SETTLE_MS,
  NAV_DRAG_THRESHOLD_PX,
} from "../const";
import { buildWavePath } from "./wave";
import { stopSwipe } from "./swipe";
import { shouldAnimate, isReducedMotion, STANDARD_EASING } from "./animation";
import { TapHold } from "./tap-hold";

// A custom element, not a render function like level-slider.ts, because this
// is the first shared piece that carries real runtime state across renders:
// a RAF-driven phase/amplitude animation loop, a ResizeObserver for its own
// length, an IntersectionObserver to pause animating off-screen, and a
// drag/settle state machine. A render function would make every host keep
// all of that itself — the light card would still have it, and the next
// host (the lights dimmer overview) would have to reinvent or copy it. One
// element owns the animation and gesture handling once; hosts only listen
// for its events and decide what to do with the value.
//
// The element never calls a service itself. It fires `slider-input` /
// `slider-commit` and leaves the host (light card, dimmer overview, …) to
// throttle and call `hass.callService` with whatever domain/service is
// right for it — brightness here, humidity or cover position elsewhere.

export type WaveSliderOrientation = "horizontal" | "vertical";
export type WaveSliderGestures = "slider" | "tile";
export type WaveSliderAnimationMode = "auto" | "on" | "off";

export interface WaveSliderRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Which value a pointer at (clientX, clientY) maps to, clamped to [min, max].
 * Vertical is inverted: the bottom edge of `rect` is `min`, the top is `max`.
 */
export function valueFromPointer(
  rect: WaveSliderRect,
  clientX: number,
  clientY: number,
  orientation: WaveSliderOrientation,
  min: number,
  max: number,
): number {
  const fraction =
    orientation === "horizontal"
      ? rect.width > 0
        ? (clientX - rect.left) / rect.width
        : 0
      : rect.height > 0
        ? (rect.top + rect.height - clientY) / rect.height
        : 0;
  return Math.min(max, Math.max(min, Math.round(fraction * 100)));
}

/**
 * Handle position and the active/track split either side of it, in slider-
 * length pixels. `handleSize` is the handle's extent along the slider axis
 * (its "width" when horizontal) — the gap on each side is measured from
 * there, same as the light card's original wave slider.
 */
export function handleGeometry(
  lengthPx: number,
  pct: number,
  handleSize: number,
  gap: number,
): { handlePos: number; activeEnd: number; trackStart: number } {
  const handlePos = handleSize / 2 + (pct / 100) * Math.max(0, lengthPx - handleSize);
  const gapHalf = gap / 2;
  const activeEnd = Math.max(0, handlePos - gapHalf - handleSize / 2);
  const trackStart = Math.min(lengthPx, handlePos + gapHalf + handleSize / 2);
  return { handlePos, activeEnd, trackStart };
}

/**
 * Whether a pointer move of (dx, dy) counts as the start of a drag along the
 * slider's axis, as opposed to a scroll/pan across it.
 */
export function isDragIntent(
  dx: number,
  dy: number,
  orientation: WaveSliderOrientation,
  thresholdPx: number,
): boolean {
  const along = orientation === "horizontal" ? Math.abs(dx) : Math.abs(dy);
  const cross = orientation === "horizontal" ? Math.abs(dy) : Math.abs(dx);
  return along > thresholdPx && along > cross;
}

const EASING = unsafeCSS(STANDARD_EASING);
const DEFAULT_LENGTH = 220;

@customElement("m3-wave-slider")
export class M3WaveSlider extends LitElement {
  @property({ type: Number }) value = 0;
  @property({ type: Number }) min = LIGHT_MIN_BRIGHTNESS_PCT;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) step = 5;
  @property({ type: String, reflect: true }) orientation: WaveSliderOrientation = "horizontal";
  @property({ type: Boolean }) active = false;
  @property({ type: String }) animation: WaveSliderAnimationMode = "auto";
  @property({ attribute: "wave-style" }) waveStyle: WaveStyle = "wavy";
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: String }) label = "";
  @property({ type: String, reflect: true }) gestures: WaveSliderGestures = "slider";
  @property({ type: Boolean }) hasHold = false;
  @property({ type: Boolean }) hasDoubleTap = false;

  @state() private _dragging = false;
  @state() private _settling = false;
  @state() private _dragValue?: number;
  @state() private _measuredLength = DEFAULT_LENGTH;
  @state() private _measuredThickness = LIGHT_WAVE_HEIGHT;

  // `.root` is the full tile — pointer capture, value-from-pointer and the
  // slotted content all measure/listen against it. `.wave` is the thinner
  // (or, for vertical, full-height but narrow) strip the wave/handle
  // actually draw in — see the CSS comment on `.wave` for why it's a
  // separate box instead of `.root` itself.
  @query(".root") private _rootEl?: HTMLDivElement;
  @query(".wave") private _waveEl?: HTMLDivElement;

  private _committedValue?: number;
  private _settleTimer?: number;

  // Deliberately not @state — see m3-light-card.ts for why: both advance
  // every animation frame and feed a single SVG path, so making them
  // reactive would re-render the whole element (and its slotted tile
  // content) at frame rate instead of one attribute write.
  private _phase = 0;
  private _displayAmplitude = 0;
  private _targetAmplitude = 0;
  private _phaseAnimating = false;
  private _waveGeom?: { activeEnd: number; midY: number };

  private _rafId?: number;
  private _resizeObserver?: ResizeObserver;
  private _intersectionObserver?: IntersectionObserver;
  private _isIntersecting = true;

  private _tileStartX = 0;
  private _tileStartY = 0;
  private _tileDragActive = false;
  // Tile mode decides "is this a drag?" from pointermove alone (no drag
  // starts on pointerdown the way slider mode's does), so it has to know
  // whether a pointer is actually down — a mouse fires pointermove on plain
  // hover too, and without this guard that hover would diff against the
  // stale _tileStartX/Y default (0,0) and read as a huge, spurious drag.
  private _tilePointerActive = false;

  private readonly _tapHold = new TapHold({
    hasHold: () => this.hasHold,
    hasDoubleTap: () => this.hasDoubleTap,
    onTap: () => this._fire("slider-tap", {}),
    onHold: () => this._fire("slider-hold", {}),
    onDoubleTap: () => this._fire("slider-double-tap", {}),
  });

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._handleVisibilityChange);
    this._intersectionObserver = new IntersectionObserver((entries) => {
      this._isIntersecting = entries.some((e) => e.isIntersecting);
      this.requestUpdate();
    });
    this._intersectionObserver.observe(this);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this._handleVisibilityChange);
    this._intersectionObserver?.disconnect();
    this._resizeObserver?.disconnect();
    this._stopAnimationLoop();
    this._tapHold.destroy();
    if (this._settleTimer !== undefined) clearTimeout(this._settleTimer);
  }

  protected willUpdate(changed: PropertyValues): void {
    // The settle window normally runs its full LIGHT_DRAG_SETTLE_MS out, but
    // ends early the moment the host's own value confirms the commit — no
    // need to keep pinning the display once the real state agrees with it.
    if (
      changed.has("value") &&
      this._settling &&
      this._committedValue !== undefined &&
      Math.abs(this.value - this._committedValue) <= 1
    ) {
      this._endSettle();
    }
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    if (this._waveEl && !this._resizeObserver) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect) this._applyMeasuredRect(rect.width, rect.height);
      });
      this._resizeObserver.observe(this._waveEl);
      const rect = this._waveEl.getBoundingClientRect();
      this._applyMeasuredRect(rect.width, rect.height);
    }
  }

  private _applyMeasuredRect(width: number, height: number): void {
    const length = this.orientation === "vertical" ? height : width;
    const thickness = this.orientation === "vertical" ? width : height;
    if (length && Math.abs(length - this._measuredLength) > 0.5) this._measuredLength = length;
    if (thickness && Math.abs(thickness - this._measuredThickness) > 0.5) this._measuredThickness = thickness;
  }

  private _handleVisibilityChange = (): void => {
    if (document.hidden) {
      this._stopAnimationLoop();
    } else {
      this.requestUpdate();
    }
  };

  // ---- Animation loop --------------------------------------------------

  private _startAnimationLoop(): void {
    if (this._rafId !== undefined) return;
    const step = () => {
      this._rafId = requestAnimationFrame(step);
      this._tick();
    };
    this._rafId = requestAnimationFrame(step);
  }

  private _stopAnimationLoop(): void {
    if (this._rafId !== undefined) {
      cancelAnimationFrame(this._rafId);
      this._rafId = undefined;
    }
  }

  private _tick(): void {
    if (document.hidden || !this._isIntersecting) {
      this._stopAnimationLoop();
      return;
    }
    let changed = false;
    const ampDelta = this._targetAmplitude - this._displayAmplitude;
    if (Math.abs(ampDelta) > 0.01) {
      this._displayAmplitude += ampDelta * LIGHT_WAVE_AMPLITUDE_LERP;
      changed = true;
    } else if (this._displayAmplitude !== this._targetAmplitude) {
      this._displayAmplitude = this._targetAmplitude;
      changed = true;
    }
    if (this._phaseAnimating) {
      this._phase -= LIGHT_WAVE_PHASE_SPEED;
      changed = true;
    }
    if (!changed) {
      this._stopAnimationLoop();
      return;
    }
    this._repaintWave();
  }

  // Repaints only the wave path, same trick as the light card: one attribute
  // write per frame instead of a full element re-render.
  private _repaintWave(): void {
    const geom = this._waveGeom;
    if (!geom) return;
    const path = this.renderRoot?.querySelector(".wave-active");
    if (!path) return;
    path.setAttribute(
      "d",
      buildWavePath(0, geom.activeEnd, this._displayAmplitude, LIGHT_WAVE_WAVELENGTH, this._phase, geom.midY),
    );
  }

  // ---- Drag / settle state machine --------------------------------------

  private _beginDrag(value: number): void {
    this._dragging = true;
    this._dragValue = value;
    this._fire("slider-drag", { dragging: true });
    this._fire("slider-input", { value });
  }

  private _updateDrag(value: number): void {
    if (value === this._dragValue) return;
    this._dragValue = value;
    this._fire("slider-input", { value });
  }

  private _commitDrag(value: number): void {
    this._dragging = false;
    this._dragValue = value;
    this._committedValue = value;
    this._fire("slider-commit", { value });
    this._startSettle();
  }

  private _startSettle(delay = LIGHT_DRAG_SETTLE_MS): void {
    this._settling = true;
    if (this._settleTimer !== undefined) clearTimeout(this._settleTimer);
    this._settleTimer = window.setTimeout(() => this._endSettle(), delay);
  }

  private _endSettle(): void {
    this._settling = false;
    this._dragValue = undefined;
    this._committedValue = undefined;
    if (this._settleTimer !== undefined) {
      clearTimeout(this._settleTimer);
      this._settleTimer = undefined;
    }
    this._fire("slider-drag", { dragging: false });
  }

  private _fire(
    name: "slider-input" | "slider-commit" | "slider-drag" | "slider-tap" | "slider-hold" | "slider-double-tap",
    detail: Record<string, unknown>,
  ): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _valueFromEvent(e: PointerEvent): number {
    const rect = this._rootEl?.getBoundingClientRect();
    if (!rect) return this.min;
    return valueFromPointer(rect, e.clientX, e.clientY, this.orientation, this.min, this.max);
  }

  // ---- Pointer / gesture handling ----------------------------------------

  private _swipeGuard = (e: Event): void => {
    // Tile mode running vertically scrolls the page horizontally across the
    // tiles, so it must not shield hass-swipe-navigation from that drag —
    // every other combination is the slider's own drag and does shield it.
    if (this.gestures === "slider" || this.orientation === "horizontal") stopSwipe(e);
  };

  private _handlePointerDown = (e: PointerEvent): void => {
    if (this.disabled) return;
    e.preventDefault();
    this._rootEl?.setPointerCapture(e.pointerId);
    if (this.gestures === "slider") {
      this._beginDrag(this._valueFromEvent(e));
      return;
    }
    this._tileStartX = e.clientX;
    this._tileStartY = e.clientY;
    this._tileDragActive = false;
    this._tilePointerActive = true;
    this._tapHold.down(e);
  };

  private _handlePointerMove = (e: PointerEvent): void => {
    if (this.disabled) return;
    if (this.gestures === "slider") {
      if (!this._dragging) return;
      this._updateDrag(this._valueFromEvent(e));
      return;
    }
    if (!this._tilePointerActive) return;
    this._tapHold.move(e);
    if (!this._tileDragActive) {
      const dx = e.clientX - this._tileStartX;
      const dy = e.clientY - this._tileStartY;
      if (!isDragIntent(dx, dy, this.orientation, NAV_DRAG_THRESHOLD_PX)) return;
      this._tileDragActive = true;
      this._beginDrag(this._valueFromEvent(e));
      return;
    }
    this._updateDrag(this._valueFromEvent(e));
  };

  private _handlePointerUp = (e: PointerEvent): void => {
    if (this.gestures === "slider") {
      if (!this._dragging) return;
      this._commitDrag(this._dragValue ?? this._valueFromEvent(e));
      return;
    }
    this._tapHold.up();
    if (this._tileDragActive) {
      this._commitDrag(this._dragValue ?? this._valueFromEvent(e));
    }
    this._tileDragActive = false;
    this._tilePointerActive = false;
  };

  private _handlePointerCancel = (e: PointerEvent): void => {
    // Slider gesture: identical to the light card, which commits on cancel
    // same as on release. Tile gesture: the browser has taken over to pan
    // the list, so the drag is discarded with no commit and no tap.
    if (this.gestures === "slider") {
      this._handlePointerUp(e);
      return;
    }
    this._tapHold.up();
    if (this._tileDragActive) {
      this._dragging = false;
      this._dragValue = undefined;
      this._fire("slider-drag", { dragging: false });
    }
    this._tileDragActive = false;
    this._tilePointerActive = false;
  };

  private _handleClick = (): void => {
    if (this.gestures === "tile") this._tapHold.click();
  };

  private _handleKeydown = (e: KeyboardEvent): void => {
    if (this.disabled) return;
    const dirByKey: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    };
    const dir = dirByKey[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    const step = e.shiftKey ? 1 : this.step;
    const current = this._dragging || this._settling ? (this._dragValue ?? this.value) : this.value;
    const next = Math.min(this.max, Math.max(this.min, current + dir * step));
    // A key press is a discrete action, not a continuous drag: it is its own
    // input and its own commit, then settles like any other commit.
    this._beginDrag(next);
    this._commitDrag(next);
  };

  private _handleStyle(handlePos: number, handleAlong: number, handleAcross: number): string {
    if (this.orientation === "vertical") {
      return `width: ${handleAcross}px; height: ${handleAlong}px; left: 50%; transform: translateX(-50%); bottom: ${handlePos - handleAlong / 2}px;`;
    }
    return `width: ${handleAlong}px; height: ${handleAcross}px; top: 50%; transform: translateY(-50%); left: ${handlePos - handleAlong / 2}px;`;
  }

  protected render() {
    const mode = this.animation;
    const wavyStyle = this.waveStyle !== "flat";
    const reducedMotion = isReducedMotion();
    const forceFlatShape = reducedMotion || (mode === "off" && !wavyStyle);
    this._phaseAnimating = !forceFlatShape && mode !== "off" && this.active && !this.disabled;
    this._targetAmplitude = this.disabled || !this.active || forceFlatShape ? 0 : LIGHT_WAVE_AMPLITUDE;
    if (this._phaseAnimating || this._targetAmplitude !== this._displayAmplitude) {
      this._startAnimationLoop();
    }

    const showValue = this._dragging || this._settling ? (this._dragValue ?? this.value) : this.value;
    const length = this._measuredLength;
    const thickness = this._measuredThickness;
    const midThickness = thickness / 2;
    const handleAlong = LIGHT_HANDLE_WIDTH;
    const handleAcross = thickness * (LIGHT_HANDLE_HEIGHT / LIGHT_WAVE_HEIGHT);
    const { handlePos, activeEnd, trackStart } = handleGeometry(length, showValue, handleAlong, LIGHT_WAVE_GAP);
    const hasActive = activeEnd > 1;
    const hasTrack = trackStart < length - 1;
    this._waveGeom = hasActive ? { activeEnd, midY: midThickness } : undefined;
    const activePath = hasActive
      ? buildWavePath(0, activeEnd, this._displayAmplitude, LIGHT_WAVE_WAVELENGTH, this._phase, midThickness)
      : "";

    const vertical = this.orientation === "vertical";
    const viewBoxW = vertical ? thickness : length;
    const viewBoxH = vertical ? length : thickness;
    const gTransform = vertical ? `translate(0 ${length}) rotate(-90)` : "translate(0 0)";

    return html`
      <div
        class="root ${this.disabled ? "disabled" : ""} ${this._dragging || this._settling ? "dragging" : ""} ${shouldAnimate(this.animation) ? "" : "no-animations"}"
        role="slider"
        aria-label=${this.label}
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
        aria-valuenow=${showValue}
        aria-valuetext="${Math.round(showValue)} %"
        aria-disabled=${this.disabled ? "true" : "false"}
        tabindex=${this.disabled ? -1 : 0}
        @pointerdown=${this._handlePointerDown}
        @pointermove=${this._handlePointerMove}
        @pointerup=${this._handlePointerUp}
        @pointercancel=${this._handlePointerCancel}
        @click=${this._handleClick}
        @touchstart=${this._swipeGuard}
        @touchmove=${this._swipeGuard}
        @mousedown=${this._swipeGuard}
        @mousemove=${this._swipeGuard}
        @keydown=${this._handleKeydown}
      >
        <div class="wave">
          <svg class="wave-svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}" preserveAspectRatio="none">
            <g transform=${gTransform}>
              ${hasActive ? svg`<path class="wave-active" d=${activePath} fill="none"></path>` : nothing}
              ${hasTrack
                ? svg`<line class="wave-track" x1=${trackStart} y1=${midThickness} x2=${length} y2=${midThickness}></line>`
                : nothing}
            </g>
          </svg>
          <div class="handle" style=${this._handleStyle(handlePos, handleAlong, handleAcross)}></div>
        </div>
        <div class="content"><slot></slot></div>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      outline: none;
      /* Sizes the element when nothing else does (the light card's slider
         mode drops it straight into a flex column with no explicit height) —
         same fallback .wave itself falls back to below, so the two agree. */
      min-height: var(--wave-slider-thickness, ${LIGHT_WAVE_HEIGHT}px);
    }

    :host([orientation="vertical"]) {
      min-height: 0;
      min-width: var(--wave-slider-thickness, ${LIGHT_WAVE_HEIGHT}px);
    }

    .root {
      position: relative;
      width: 100%;
      height: 100%;
      cursor: pointer;
      touch-action: none;
      outline: none;
    }

    /* The wave/handle only ever draw in a thickness-sized strip — a fixed
       height (or width, vertical) within .root, not the whole tile. In
       slider mode .root IS exactly that size (see the :host fallback
       above), so this is a no-op there. In tile mode .root is the whole
       tile and .content (the slotted icon/name/%, below) needs the full
       box to lay out in without the wave/handle cutting through it — hence
       .wave is its own bottom-anchored (horizontal) / full-height
       (vertical) box instead of sizing .root itself down to it. */
    .wave {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: var(--wave-slider-thickness, ${LIGHT_WAVE_HEIGHT}px);
    }

    :host([orientation="vertical"]) .wave {
      left: 50%;
      right: auto;
      bottom: auto;
      top: 0;
      transform: translateX(-50%);
      width: var(--wave-slider-thickness, ${LIGHT_WAVE_HEIGHT}px);
      height: 100%;
    }

    :host([gestures="tile"][orientation="horizontal"]) .root {
      touch-action: pan-y;
    }

    :host([gestures="tile"][orientation="vertical"]) .root {
      touch-action: pan-x;
    }

    .root:focus-visible {
      outline: 2px solid var(--wave-slider-accent, var(--primary-color));
      outline-offset: 2px;
      border-radius: 8px;
    }

    .root.disabled {
      cursor: default;
      pointer-events: none;
    }

    .wave-svg {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }

    .wave-active {
      stroke: var(--wave-slider-accent, var(--primary-color));
      stroke-width: var(--wave-slider-stroke, ${LIGHT_WAVE_STROKE}px);
      stroke-linecap: round;
    }

    .wave-track {
      stroke: var(--wave-slider-track, rgba(127, 127, 127, 0.13));
      stroke-width: var(--wave-slider-stroke, ${LIGHT_WAVE_STROKE}px);
      stroke-linecap: round;
    }

    .handle {
      position: absolute;
      border-radius: ${LIGHT_HANDLE_RADIUS}px;
      background: var(--wave-slider-handle, var(--wave-slider-accent, var(--primary-color)));
      pointer-events: none;
      transition:
        left 150ms ${EASING},
        bottom 150ms ${EASING};
    }

    .root.dragging .handle,
    .root.no-animations .handle {
      transition: none;
    }

    .content {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: flex;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-wave-slider": M3WaveSlider;
  }
}
