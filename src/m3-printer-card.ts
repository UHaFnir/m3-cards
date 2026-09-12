import { LitElement, html, css, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HaActionConfig,
  HomeAssistant,
  LovelaceCard,
  LovelaceGridOptions,
  M3PrinterCardConfig,
  PrinterSecondaryAction,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_PRINTER_ICON,
  DEFAULT_PRINTER_RADIUS,
  PRINTER_BUTTON_HEIGHT,
  PRINTER_BUTTON_PRESS_MS,
  PRINTER_BUTTON_RADIUS_PRESSED,
  PRINTER_ICON_TINT,
  PRINTER_OPTIMISTIC_MS,
  PRINTER_PENDING_OPACITY,
  PRINTER_PRIMARY_RADIUS,
  PRINTER_SECONDARY_RADIUS,
  PRINTER_SECONDARY_TINT,
  PRINTER_STOP_TINT,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { STANDARD_EASING } from "./shared/animation";
import { runHaAction, isActionable } from "./shared/actions";
import { cardHeaderStyles, renderCardHeader } from "./shared/card-header";
import { inkOn, resolveCommonColors, resolveThemeColor, tintOn } from "./shared/color-config";
import { formatNumber } from "./shared/formatting";
import { glassCardClass, glassCardStyles, renderMissingEntity } from "./shared/glass-card";
import { OptimisticState } from "./shared/optimistic-state";
import { hassChangeMatters } from "./shared/should-update";
import { TemplatedCard } from "./shared/templated-card";
import {
  discoverPrinter,
  isRunning,
  optimisticPrinterState,
  primaryIntent,
  printerStateColor,
  printerStateIcon,
  resolvePrinterState,
  type DiscoveredPrinter,
  type PrinterState,
} from "./shared/printer";

/**
 * A 3D printer as one card instead of sixteen tiles.
 *
 * Built against Bambu Lab's integration and deliberately not tied to it: every
 * block beyond the header and the buttons is optional, and the one thing that
 * would otherwise hard-code a vendor — what "printing" is called — is a
 * configurable `state_map` with a table of known values behind it.
 *
 * THE STATE IS THE LAYOUT
 *
 * The reason this card exists is that a printer spends most of its life idle,
 * and sixteen tiles reporting "unavailable" is what a dashboard looks like
 * when nobody thought about that. So the state decides what is drawn: a
 * printing machine shows its job, an idle one shows what it last did, an
 * offline one shows almost nothing — except the socket switch, because that is
 * the one control that can bring it back.
 */
@customElement("m3-printer-card")
export class M3PrinterCard extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3PrinterCardConfig;
  @state() private _tick = 0;
  @state() private _pendingStop = false;

  private _optimistic = new OptimisticState<PrinterState>({
    ttlMs: PRINTER_OPTIMISTIC_MS,
    // An error or a disconnect always wins: those are the two a user must not
    // be kept from seeing for the sake of a smooth animation.
    overriding: ["error", "offline"],
    onExpire: () => {
      this._tick++;
    },
  });
  private _stopTimer?: number;
  private _discovered?: DiscoveredPrinter;
  private _discoveredFor?: string;

  public static getStubConfig(hass: HomeAssistant): M3PrinterCardConfig {
    const entity =
      Object.keys(hass.states).find((e) => /printer|_3d|bambu/i.test(e) && e.startsWith("sensor.")) ??
      Object.keys(hass.states).find((e) => /printer/i.test(e));
    return { type: "custom:m3-printer-card", entity: entity ?? "" };
  }

  public setConfig(config: M3PrinterCardConfig): void {
    if (!config.entity) throw new Error("m3-printer-card: 'entity' is required");
    this._config = config;
    this._discovered = undefined;
    this._discoveredFor = undefined;
    this._optimistic.clear();
  }

  public getCardSize(): number {
    return 6;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 6, min_rows: 3 };
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._optimistic.clear();
    if (this._stopTimer) clearTimeout(this._stopTimer);
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, this._watched());
  }

  private _watched(): (string | undefined)[] {
    const d = this._entities();
    return [
      this._config?.entity,
      this._entity("stage_entity", "stage"),
      this._entity("progress_entity", "progress"),
      this._entity("job_name_entity", "jobName"),
      this._entity("layer_entity", "layer"),
      d?.online,
      d?.error,
    ];
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private get _t() {
    return (key: TranslationKey): string => localize(key, this._language);
  }

  /**
   * Companion entities, cached per printer. The walk is over the whole entity
   * registry, so doing it on every `hass` tick would be wasteful — and the
   * result only changes when the device's entities do.
   */
  private _entities(): DiscoveredPrinter | undefined {
    const entity = this._config?.entity;
    if (!entity || !this.hass) return undefined;
    if (this._discoveredFor !== entity || !this._discovered) {
      this._discovered = discoverPrinter(this.hass, entity);
      this._discoveredFor = entity;
    }
    return this._discovered;
  }

  /** An explicit override always wins over what was found on the device. */
  private _entity(
    override: keyof M3PrinterCardConfig,
    found: keyof DiscoveredPrinter,
  ): string | undefined {
    const explicit = this._config?.[override];
    if (typeof explicit === "string" && explicit) return explicit;
    const value = this._entities()?.[found];
    return typeof value === "string" ? value : undefined;
  }

  private _stateOf(entityId: string | undefined): string | undefined {
    if (!entityId) return undefined;
    const raw = this.hass?.states[entityId]?.state;
    return raw === "unknown" || raw === "unavailable" ? undefined : raw;
  }

  private _numeric(entityId: string | undefined): number | undefined {
    if (!entityId) return undefined;
    const value = parseFloat(this.hass?.states[entityId]?.state ?? "");
    return isNaN(value) ? undefined : value;
  }

  // ---- state ------------------------------------------------------------------

  /**
   * The printer's state.
   *
   * Read from the stage entity when there is one and from the card's own
   * entity otherwise — a stage sensor says "heatbed_preheating" where a status
   * sensor says "printing", and the finer word makes the better status line
   * without changing which of the six states it maps to.
   */
  private _resolve(): { state: PrinterState; pending: boolean; actual: PrinterState } {
    const raw =
      this._stateOf(this._entity("stage_entity", "stage")) ??
      this.hass?.states[this._config!.entity]?.state;
    const actual = resolvePrinterState(raw, this._config?.state_map);
    // An explicit offline signal beats whatever the stage still reports: a
    // printer that has been unplugged often leaves its last stage behind.
    const online = this._entity("online_entity", "online");
    const offline = online ? this.hass?.states[online]?.state === "off" : false;
    const settled = offline ? "offline" : actual;
    const { value, pending } = this._optimistic.resolve(settled);
    return { state: value, pending, actual: settled };
  }

  // ---- actions ----------------------------------------------------------------

  private _run(action: HaActionConfig | undefined, fallback?: () => void): void {
    if (!action) {
      fallback?.();
      return;
    }
    if (!isActionable(action) || !this.hass) return;
    runHaAction(this.hass, action, {
      entityId: this._config!.entity,
      openPopup: () => this._fireMoreInfo(this._config?.entity),
      fireMoreInfo: (id) => this._fireMoreInfo(id),
      navigate: (path) => {
        window.history.pushState(null, "", path);
        this.dispatchEvent(
          new CustomEvent("location-changed", {
            bubbles: true,
            composed: true,
            detail: { replace: false },
          }),
        );
      },
    });
  }

  private _fireMoreInfo(entityId: string | undefined): void {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId },
      }),
    );
  }

  /**
   * Runs the primary command and paints its outcome at once.
   *
   * The optimistic state is set before the call, so the button has already
   * changed by the time the round-trip starts — setting it afterwards would
   * put a frame of the old state on screen.
   */
  private _primary(): void {
    const { state } = this._resolve();
    const intent = primaryIntent(state);
    if (intent === "none") return;
    if (intent === "confirm") {
      this._fireMoreInfo(this._entity("error_entity", "error") ?? this._config?.entity);
      return;
    }
    this._optimistic.set(optimisticPrinterState(intent, state));
    this.requestUpdate();
    const cfg = this._config!;
    if (intent === "pause") this._run(cfg.pause_action);
    else if (intent === "resume") this._run(cfg.resume_action);
    else this._run(cfg.start_action, () => this._fireMoreInfo(cfg.entity));
  }

  /**
   * Stopping asks twice by default.
   *
   * A stop on a printer throws away hours of work and a spool's worth of
   * filament, and the button sits next to Pause. The second tap has to land
   * within a few seconds, so an ignored first tap does not leave the card
   * armed indefinitely.
   */
  private _stop(): void {
    const cfg = this._config!;
    if (cfg.confirm_stop === false || this._pendingStop) {
      this._pendingStop = false;
      if (this._stopTimer) clearTimeout(this._stopTimer);
      this._run(cfg.stop_action, () => this._fireMoreInfo(cfg.entity));
      return;
    }
    this._pendingStop = true;
    if (this._stopTimer) clearTimeout(this._stopTimer);
    this._stopTimer = setTimeout(() => {
      this._pendingStop = false;
    }, 4000) as unknown as number;
  }

  // ---- render -----------------------------------------------------------------

  protected render() {
    if (!this._config || !this.hass) return nothing;
    if (!this.hass.states[this._config.entity]) {
      return renderMissingEntity(this._config.entity);
    }

    const { state, pending } = this._resolve();
    const colors = resolveCommonColors(this._config);
    const accent = this._config.accent_color
      ? resolveThemeColor(this._config.accent_color)
      : printerStateColor(state);
    const radius = `${this._config.radius ?? DEFAULT_PRINTER_RADIUS}px`;

    return html`
      <ha-card
        class=${state === "offline" ? "offline" : state === "error" ? "errored" : ""}
        style=${(() => {
          const iconBg = tintOn(this, accent, this._config!.accent_opacity, PRINTER_ICON_TINT);
          return (
            `--m3pr-accent: ${accent}; --m3pr-ink: ${inkOn(accent, this)}; ` +
            `--m3p-icon-bg: ${iconBg}; --m3p-icon-color: ${accent}; ` +
            `border-radius: ${radius};`
          );
        })()}
      >
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)}"
          style=${`border-radius: ${radius};${
            colors.cardBackgroundCss ? ` background: ${colors.cardBackgroundCss};` : ""
          }`}
        >
          ${this._renderHeader(state)} ${this._renderControls(state, pending)}
          ${this._config.card_version ? html`<div class="version">${CARD_VERSION}</div>` : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderHeader(state: PrinterState) {
    const cfg = this._config!;
    const running = isRunning(state);

    let name = cfg.name ?? this._stateOf(this._entity("job_name_entity", "jobName")) ?? "";
    if (!name) name = this._t("printer_no_job");
    if (cfg.strip_extension !== false) name = name.replace(/\.(3mf|gcode|gco|bgcode)$/i, "");

    // The status line prefers the printer's own stage wording — "heatbed
    // preheating" says more than "printing" — and falls back to the generic
    // state when there is none.
    const stageEntity = this._entity("stage_entity", "stage");
    const stageState = stageEntity ? this.hass?.states[stageEntity] : undefined;
    const stageText =
      stageState && this._stateOf(stageEntity)
        ? (this.hass?.formatEntityState?.(stageState) ?? stageState.state)
        : this._t(`printer_${state}` as TranslationKey);

    const layer = this._numeric(this._entity("layer_entity", "layer"));
    const total = this._numeric(this._entity("total_layers_entity", "totalLayers"));
    let subtitle = stageText;
    if (running && layer !== undefined) {
      const layerText =
        total !== undefined && total > 0
          ? this._t("printer_layer_of")
              .replace("{n}", String(Math.round(layer)))
              .replace("{total}", String(Math.round(total)))
          : this._t("printer_layer").replace("{n}", String(Math.round(layer)));
      subtitle = `${stageText} · ${layerText}`;
    }

    const progress = this._numeric(this._entity("progress_entity", "progress"));
    const remaining = this._stateOf(this._entity("remaining_entity", "remaining"));
    // `undefined` rather than `nothing`: the shared header types its trailing
    // slot as an optional template, and Lit's `nothing` is a symbol.
    const trailing =
      running && progress !== undefined
        ? html`
            <div class="progress-readout">
              <div class="percent">
                ${formatNumber(this._language, progress, { maximumFractionDigits: 0 })}<span
                  class="percent-unit"
                  >%</span
                >
              </div>
              ${remaining ? html`<div class="remaining">${remaining}</div>` : nothing}
            </div>
          `
        : undefined;

    return renderCardHeader({
      icon: cfg.icon ?? printerStateIcon(state) ?? DEFAULT_PRINTER_ICON,
      name,
      subtitle,
      onClick: () => this._run(cfg.tap_action, () => this._fireMoreInfo(cfg.entity)),
      right: trailing,
    });
  }

  private _renderControls(state: PrinterState, pending: boolean) {
    const cfg = this._config!;
    const intent = primaryIntent(state);
    // Offline is the one state with no controls at all — nothing the card can
    // send will reach the machine. The socket switch lives in the details
    // block, which stays live, and that is the way back.
    if (state === "offline") return nothing;

    const label =
      intent === "pause"
        ? this._t("printer_pause")
        : intent === "resume"
          ? this._t("printer_resume")
          : intent === "confirm"
            ? this._t("printer_confirm_error")
            : this._t("printer_start");
    const icon =
      intent === "pause"
        ? "mdi:pause"
        : intent === "confirm"
          ? "mdi:alert-circle-outline"
          : "mdi:play";

    const secondary = cfg.secondary_actions ?? (["stop", "files", "filament"] as const);

    return html`
      <div class="controls">
        <button
          class="primary ${pending ? "pending" : ""}"
          ?disabled=${intent === "none"}
          @click=${() => this._primary()}
        >
          <ha-icon icon=${icon}></ha-icon>
          <span>${label}</span>
        </button>
        ${(secondary as readonly PrinterSecondaryAction[])
          .filter((action) => this._secondaryApplies(action, state))
          .map((action) => this._renderSecondary(action))}
      </div>
    `;
  }

  /** A control that cannot do anything in this state is not drawn. */
  private _secondaryApplies(action: PrinterSecondaryAction, state: PrinterState): boolean {
    switch (action) {
      case "stop":
        return isRunning(state);
      case "preheat":
        return !isRunning(state);
      default:
        return true;
    }
  }

  private _renderSecondary(action: PrinterSecondaryAction) {
    const cfg = this._config!;
    const spec: Record<
      PrinterSecondaryAction,
      { icon: string; key: TranslationKey; run: () => void }
    > = {
      stop: { icon: "mdi:stop", key: "printer_stop", run: () => this._stop() },
      files: {
        icon: "mdi:file-document-outline",
        key: "printer_files",
        run: () => this._run(cfg.files_action, () => this._fireMoreInfo(cfg.entity)),
      },
      filament: {
        icon: "mdi:swap-horizontal",
        key: "printer_filament",
        run: () => this._run(cfg.filament_action, () => this._fireMoreInfo(cfg.entity)),
      },
      preheat: {
        icon: "mdi:fire",
        key: "printer_preheat",
        run: () => this._run(cfg.preheat_action, () => this._fireMoreInfo(cfg.entity)),
      },
    };
    const { icon, key, run } = spec[action];
    const armed = action === "stop" && this._pendingStop;
    const label = armed ? this._t("printer_stop_confirm") : this._t(key);

    return html`
      <button
        class="secondary ${action === "stop" ? "stop" : ""} ${armed ? "armed" : ""}"
        aria-label=${label}
        title=${label}
        @click=${run}
      >
        <ha-icon icon=${armed ? "mdi:alert-outline" : icon}></ha-icon>
      </button>
    `;
  }

  static styles = [
    glassCardStyles,
    cardHeaderStyles,
    css`
      ha-card {
        color: var(--m3p-text, var(--primary-text-color));
        overflow: hidden;
      }

      /* Grey, not red: a printer at the wall socket is a normal state, not a
         fault, and painting it as one trains people to ignore red. */
      ha-card.offline .card-inner {
        opacity: 0.4;
      }

      ha-card.errored {
        outline: 2px solid var(--m3pr-accent);
        outline-offset: -2px;
      }

      .card-inner {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px;
        box-sizing: border-box;
      }

      .progress-readout {
        flex: 0 0 auto;
        text-align: right;
        line-height: 1.1;
      }

      .percent {
        font-size: 22px;
        font-weight: 700;
        color: var(--m3pr-accent);
      }

      .percent-unit {
        font-size: 12px;
        font-weight: 600;
        margin-left: 1px;
      }

      .remaining {
        font-size: 10px;
        opacity: 0.55;
        white-space: nowrap;
      }

      .controls {
        display: flex;
        align-items: stretch;
        gap: 8px;
      }

      .primary {
        flex: 2;
        min-width: 0;
        height: ${unsafeCSS(PRINTER_BUTTON_HEIGHT)}px;
        border: none;
        border-radius: ${unsafeCSS(PRINTER_PRIMARY_RADIUS)}px;
        background: var(--m3pr-accent);
        color: var(--m3pr-ink);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: inherit;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        --mdc-icon-size: 20px;
        transition:
          border-radius ${unsafeCSS(PRINTER_BUTTON_PRESS_MS)}ms ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)},
          opacity 0.2s linear;
      }

      /* Showing something the printer has not confirmed yet. Dimmed, not
         disabled: tapping again should work if the first one was lost. */
      .primary.pending {
        opacity: ${unsafeCSS(PRINTER_PENDING_OPACITY)};
      }

      .primary:active,
      .secondary:active {
        border-radius: ${unsafeCSS(PRINTER_BUTTON_RADIUS_PRESSED)}px;
      }

      .primary:disabled {
        cursor: default;
        opacity: 0.4;
      }

      .secondary {
        flex: 1;
        min-width: 0;
        height: ${unsafeCSS(PRINTER_BUTTON_HEIGHT)}px;
        border: none;
        border-radius: ${unsafeCSS(PRINTER_SECONDARY_RADIUS)}px;
        background: color-mix(
          in srgb,
          var(--m3p-text, currentColor) ${unsafeCSS(PRINTER_SECONDARY_TINT)}%,
          transparent
        );
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        --mdc-icon-size: 22px;
        transition:
          border-radius ${unsafeCSS(PRINTER_BUTTON_PRESS_MS)}ms ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)},
          color 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .secondary.stop {
        background: color-mix(in srgb, #e57368 ${unsafeCSS(PRINTER_STOP_TINT)}%, transparent);
        color: #e57368;
      }

      /* Armed for the second tap. Filled rather than merely tinted, so it is
         plainly a different button from the one just pressed. */
      .secondary.armed {
        background: #e57368;
        color: #1c1c1c;
        border-radius: ${unsafeCSS(PRINTER_BUTTON_RADIUS_PRESSED)}px;
      }

      .version {
        font-size: 10px;
        opacity: 0.4;
        text-align: right;
      }

      @media (prefers-reduced-motion: reduce) {
        .primary,
        .secondary {
          transition: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-printer-card": M3PrinterCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-printer-card",
  name: "M3 Printer Card",
  description:
    "A 3D printer as one card instead of sixteen tiles: state, job, controls, and every companion entity found on the device. Built for Bambu Lab, usable with OctoPrint, Moonraker and Prusa via a configurable state map.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
