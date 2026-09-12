import { html, css, unsafeCSS, type TemplateResult } from "lit";
import { HEADING_ARROW, HEADING_ARROW_RADIUS, HEADING_ARROW_RADIUS_COLLAPSED, HEADING_ARROW_TINT, HEADING_COLLAPSE_MS } from "../const";
import { STANDARD_EASING } from "./animation";
import { foregroundOn, tintOn } from "./color-config";

// The chevron that says "this card folds".
//
// The heading card drew it first, the room card copied it, and the two vacuum
// cards made three — at which point a fourth hand-rolled copy is how a suite
// stops looking like one thing. It is a small shape, but it is a shape people
// learn: a 26px tinted square that becomes a circle when the card is folded,
// with the chevron turning to point the way it will move.
//
// The radius morph is the part worth keeping honest. Folded is the *circle*,
// not the square: a folded card is a closed thing, and the roundest shape
// reads that way without needing a second colour.

export interface FoldArrowOptions {
  folded: boolean;
  /** Tinted from this, so the arrow belongs to whatever the card is showing. */
  accent: string;
  /** The element resolving the tint — needed for the theme-aware mix. */
  host: HTMLElement;
  label: string;
  onToggle: (e: Event) => void;
}

export function renderFoldArrow(options: FoldArrowOptions): TemplateResult {
  const background = tintOn(options.host, options.accent, undefined, HEADING_ARROW_TINT);
  return html`
    <button
      class="m3-fold ${options.folded ? "folded" : ""}"
      style=${`background: ${background}; color: ${foregroundOn(options.accent, background, 3, options.host)};`}
      aria-expanded=${String(!options.folded)}
      aria-label=${options.label}
      @click=${options.onToggle}
    >
      <ha-icon icon="mdi:chevron-down"></ha-icon>
    </button>
  `;
}

export const foldArrowStyles = css`
  .m3-fold {
    flex: 0 0 auto;
    width: ${HEADING_ARROW}px;
    height: ${HEADING_ARROW}px;
    border: none;
    border-radius: ${HEADING_ARROW_RADIUS}px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    --mdc-icon-size: 18px;
    transition: border-radius ${HEADING_COLLAPSE_MS}ms ${unsafeCSS(STANDARD_EASING)};
  }

  /* The icon turns, not the button — rotating the whole thing would carry the
     square's corners round with it and read as a spin rather than a fold. */
  .m3-fold ha-icon {
    transition: transform ${HEADING_COLLAPSE_MS}ms ${unsafeCSS(STANDARD_EASING)};
  }

  .m3-fold.folded {
    border-radius: ${HEADING_ARROW_RADIUS_COLLAPSED}px;
  }

  .m3-fold.folded ha-icon {
    transform: rotate(-90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .m3-fold,
    .m3-fold ha-icon {
      transition: none;
    }
  }
`;
