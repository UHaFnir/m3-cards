import { html, css, nothing, type TemplateResult } from "lit";
import type { PopupSize } from "../types";

// A card-defined popup: holding a tile opens a `<dialog>` containing another
// instance of the *same* card, re-scoped to just that tile (e.g. one room's
// lights). Any overview-grid card can compose this — it owns only the dialog
// chrome and the nested-element lifecycle, not any card-specific state; the
// host keeps `tile`/`cardEl`/`cardKey`/`openedAt` as its own `@state` fields
// and calls these functions from setConfig-equivalents/updated()/render().

export const POPUP_CLICK_GUARD_MS = 250;

// A tap that opens the popup can bubble to the backdrop under the same
// click/pointerup — without this guard that closes the dialog the instant it
// opens.
export function shouldCloseOnBackdropClick(event: Event, openedAt: number, now: number = Date.now()): boolean {
  return event.target === event.currentTarget && now - openedAt >= POPUP_CLICK_GUARD_MS;
}

export interface PopupCardHandle {
  hass?: unknown;
  setConfig?: (config: unknown) => void;
}

// Creates (or reuses) the nested card element a popup shows. Replaced only
// when the scoped config actually changes (by JSON identity) — not on every
// render, which would otherwise remount the popup's card (and lose its own
// internal state) on every hass tick.
export function syncPopupCardElement<Config>(params: {
  tagName: string;
  config: Config | undefined;
  hass: unknown;
  existingEl: (HTMLElement & PopupCardHandle) | undefined;
  existingKey: string | undefined;
}): { el: (HTMLElement & PopupCardHandle) | undefined; key: string | undefined } {
  const { tagName, config, hass, existingEl, existingKey } = params;
  if (!config) return { el: undefined, key: undefined };
  const key = JSON.stringify(config);
  if (existingEl && key === existingKey) {
    existingEl.hass = hass;
    return { el: existingEl, key: existingKey };
  }
  const el = document.createElement(tagName) as HTMLElement & PopupCardHandle;
  el.setConfig?.(config);
  el.hass = hass;
  return { el, key };
}

// Opens/closes the native <dialog> to match `open`. Call from the host's
// updated() once its popup-tile state has changed — showModal()/close() throw
// if called while already in that state, hence the guards.
export function syncDialogOpenState(dialog: HTMLDialogElement | null | undefined, open: boolean): void {
  if (!dialog) return;
  if (open && !dialog.open) dialog.showModal();
  if (!open && dialog.open) dialog.close();
}

// `content` is the nested card element itself (a live DOM node — Lit renders
// a Node placed in a template expression as-is), not a re-rendered template,
// so the popup's own card keeps its identity/state across the host's renders.
export function renderPopupDialog(params: {
  content: HTMLElement | undefined;
  onClose: () => void;
  onBackdropClick: (e: Event) => void;
  closeLabel: string;
  /** Optional heading in the top bar, beside the close button. Without one the
   * bar stays the narrow close-button strip it has always been. */
  title?: string;
  /** Defaults to `normal`, which is the width every popup had before this was
   * configurable. */
  size?: PopupSize;
}): TemplateResult {
  return html`
    <dialog data-size=${params.size ?? "normal"} @close=${params.onClose} @click=${params.onBackdropClick}>
      <div class="popup-chrome">
        <div class="popup-topbar ${params.title ? "has-title" : ""}">
          ${params.title ? html`<h2 class="popup-title">${params.title}</h2>` : nothing}
          <button class="popup-close" @click=${params.onClose} aria-label=${params.closeLabel}>
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
        <div class="popup-body">${params.content}</div>
      </div>
    </dialog>
  `;
}

export const popupCardStyles = css`
  dialog {
    border: none;
    padding: 0;
    background: transparent;
    max-width: min(560px, 92vw);
    width: 100%;
    /* A room with a dozen lights is taller than a phone screen. */
    max-height: 85dvh;
    overflow: visible;
  }

  /* Content that needs more room than the default sheet. "normal" is left to
     the rule above, so nothing that never sets a size changes. */
  dialog[data-size="wide"] {
    max-width: min(860px, 94vw);
  }

  dialog[data-size="fullscreen"] {
    max-width: 100vw;
    max-height: 100dvh;
  }

  @media (max-width: 600px) {
    dialog:not([data-size="fullscreen"]) {
      max-width: 94vw;
    }
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
  }

  /* A dedicated strip for the close button, reserved above the card content
     rather than floated over it — a card with no header of its own (e.g. a
     bare custom popup.card) would otherwise have the button sit right on
     top of its content instead of in whitespace. Narrow on purpose: it's a
     small close icon, not a header bar. */
  .popup-chrome {
    display: flex;
    flex-direction: column;
    /* Inherited rather than repeated, so a fullscreen dialog's chrome grows
       with it instead of staying capped at the default sheet height. */
    max-height: inherit;
    border-radius: 24px;
    overflow: hidden;
    /* Without this the topbar is transparent, so the close button reads as
       a separate floating circle instead of part of the same sheet as the
       card below it. */
    background: var(--card-background-color, #fff);
  }

  .popup-topbar {
    flex: 0 0 auto;
    display: flex;
    justify-content: flex-end;
    padding: 6px 6px 0;
  }

  /* With a title the strip becomes a real header row: the title takes the
     space and the close button stays pinned to its end. */
  .popup-topbar.has-title {
    align-items: center;
    gap: 8px;
    padding: 10px 6px 2px 16px;
  }

  .popup-title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--primary-text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .popup-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* A little breathing room around the embedded card — not flush with
       the sheet's edges, and not the topbar's own padding either. */
    padding: 0 12px 12px;
  }

  /* Flat, part of the same sheet as .popup-chrome's background — not a
     separate floating circle with its own shadow. */
  .popup-close {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: grid;
    place-items: center;
    background: transparent;
    color: var(--secondary-text-color, var(--primary-text-color));
  }

  .popup-close:hover {
    background: rgba(127, 127, 127, 0.14);
  }

  .popup-close ha-icon {
    --mdc-icon-size: 18px;
  }
`;
