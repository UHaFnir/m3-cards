import { LitElement, html, css, svg, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceGridOptions,
  M3VacuumCardConfig,
  VacuumSecondaryAction,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_VACUUM_ICON,
  DEFAULT_VACUUM_RADIUS,
  VACUUM_BATTERY_HEIGHT,
  VACUUM_BATTERY_LOW,
  VACUUM_BATTERY_OK,
  VACUUM_BATTERY_RADIUS,
  VACUUM_FAN_BAR_RADIUS,
  VACUUM_FAN_BAR_WIDTH,
  VACUUM_FAN_HEIGHT,
  VACUUM_FAN_LABEL_SIZE,
  VACUUM_FAN_RADIUS,
  VACUUM_FAN_RADIUS_ACTIVE,
  VACUUM_FAN_TINT,
  VACUUM_ICON_RADIUS,
  VACUUM_ICON_SIZE,
  VACUUM_ICON_TINT,
  VACUUM_NAME_SIZE,
  VACUUM_OPTIMISTIC_MS,
  VACUUM_PENDING_OPACITY,
  VACUUM_PRIMARY_HEIGHT,
  VACUUM_PRIMARY_RADIUS,
  VACUUM_PRIMARY_RADIUS_PAUSED,
  VACUUM_SECONDARY_RADIUS,
  VACUUM_SECONDARY_TINT,
  VACUUM_SECONDARY_WIDTH,
  VACUUM_STATUS_SIZE,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { activateOnKey } from "./shared/a11y";
import { STANDARD_EASING } from "./shared/animation";
import { glassCardClass, glassCardStyles, renderMissingEntity } from "./shared/glass-card";
import { resolveCommonColors, resolveThemeColor, tintOn, inkOn } from "./shared/color-config";
import { hassChangeMatters } from "./shared/should-update";
import { TemplatedCard } from "./shared/templated-card";
import {
  FAN_BAR_HEIGHTS,
  OptimisticActivity,
  activityColor,
  activityIcon,
  discoverVacuum,
  fanBarsLit,
  fanSpeedKey,
  optimisticActivity,
  primaryIntent,
  resolveActivity,
  type DiscoveredVacuum,
  type VacuumActivity,
} from "./shared/vacuum";

/**
 * A Material 3 control surface for a robot vacuum.
 *
 * Built against the Roborock integration but not tied to it: everything
 * beyond `vacuum.start`/`pause`/`return_to_base`/`locate` and the entity's own
 * `fan_speed_list` is discovered on the device and simply left out when it is
 * not there, so a Valetudo or Dreame vacuum gets the header, the buttons and
 * the suction row and nothing it cannot support.
 *
 * The one thing worth knowing before reading further: **the integration polls
 * every 30 seconds and pushes nothing.** Every control on this card therefore
 * paints the state it just asked for and reconciles on the next poll — see
 * `OptimisticActivity` in shared/vacuum.ts. Without that, every button feels
 * broken for half a minute.
 */
@customElement("m3-vacuum-card")
export class M3VacuumCard extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3VacuumCardConfig;
  /** Bumped when the optimistic state expires, to force one more render. */
  @state() private _tick = 0;

  private _optimistic = new OptimisticActivity(VACUUM_OPTIMISTIC_MS, () => {
    this._tick++;
  });
  private _discovered?: DiscoveredVacuum;
  private _discoveredFor?: string;

  // getConfigElement() lands with the editor in step 5; until then Home
  // Assistant falls back to its own YAML editor for this card.

  public static getStubConfig(hass: HomeAssistant): M3VacuumCardConfig {
    const entity = Object.keys(hass.states).find((e) => e.startsWith("vacuum."));
    return { type: "custom:m3-vacuum-card", entity: entity ?? "" };
  }

  public setConfig(config: M3VacuumCardConfig): void {
    if (!config.entity) throw new Error("m3-vacuum-card: 'entity' is required");
    if (!config.entity.startsWith("vacuum.")) {
      throw new Error("m3-vacuum-card: 'entity' must be a vacuum entity");
    }
    this._config = config;
    // A different vacuum means a different device; drop what was found for the
    // old one rather than mixing two robots' entities.
    this._discovered = undefined;
    this._discoveredFor = undefined;
    this._optimistic.clear();
  }

  public getCardSize(): number {
    return 5;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 6, min_rows: 4 };
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._optimistic.clear();
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, this._watched());
  }

  /** Every entity the card reads, in one place, for `shouldUpdate`. */
  private _watched(): (string | undefined)[] {
    const d = this._entities();
    return [this._config?.entity, d?.progress, d?.area, d?.time, d?.status];
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private get _t() {
    return (key: TranslationKey): string => localize(key, this._language);
  }

  /**
   * Companion entities, cached per vacuum. The walk is over the whole entity
   * registry, so doing it on every `hass` tick would be wasteful — and the
   * result only changes when the device's entities do, which is a restart.
   */
  private _entities(): DiscoveredVacuum | undefined {
    const entity = this._config?.entity;
    if (!entity || !this.hass) return undefined;
    if (this._discoveredFor !== entity || !this._discovered) {
      this._discovered = discoverVacuum(this.hass, entity);
      this._discoveredFor = entity;
    }
    return this._discovered;
  }

  /** An explicit override always wins over what was found on the device. */
  private _entity(
    override: keyof M3VacuumCardConfig,
    found: keyof DiscoveredVacuum,
  ): string | undefined {
    const explicit = this._config?.[override];
    if (typeof explicit === "string" && explicit) return explicit;
    const value = this._entities()?.[found];
    return typeof value === "string" ? value : undefined;
  }

  // ---- actions --------------------------------------------------------------

  private _call(service: string, data: Record<string, unknown> = {}): void {
    this.hass?.callService("vacuum", service, {
      entity_id: this._config!.entity,
      ...data,
    });
  }

  /**
   * Runs a command and paints its outcome immediately.
   *
   * The order matters: the optimistic state is set *before* the service call,
   * so the button has already changed by the time the websocket round-trip
   * starts. Setting it afterwards would put a frame of the old state on screen.
   */
  private _command(intent: "start" | "pause" | "resume" | "return" | "stop"): void {
    const current = this._activity().activity;
    this._optimistic.set(optimisticActivity(intent, current));
    this.requestUpdate();
    switch (intent) {
      case "start":
      case "resume":
        this._call("start");
        break;
      case "pause":
        this._call("pause");
        break;
      case "return":
        this._call("return_to_base");
        break;
      case "stop":
        this._call("stop");
        break;
    }
  }

  private _setFanSpeed(speed: string): void {
    this._call("set_fan_speed", { fan_speed: speed });
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

  // ---- state ----------------------------------------------------------------

  private _activity(): { activity: VacuumActivity; pending: boolean; actual: VacuumActivity } {
    const state = this.hass?.states[this._config!.entity];
    const actual = resolveActivity(state?.state);
    const resolved = this._optimistic.resolve(actual);
    return { ...resolved, actual };
  }

  /**
   * The status line's text. The integration's own `status` sensor is preferred
   * when it exists — it says "Emptying dustbin" where the vacuum entity only
   * says "docked" — and the generic state is the fallback for everything else.
   */
  private _statusText(activity: VacuumActivity, pending: boolean): string {
    if (pending) {
      // Mid-command the status sensor still describes the old state, so the
      // generic label is the honest one to show.
      return this._t(`vacuum_${activity}` as TranslationKey);
    }
    const statusEntity = this._entity("status_entity", "status");
    const raw = statusEntity ? this.hass?.states[statusEntity]?.state : undefined;
    if (raw && raw !== "unknown" && raw !== "unavailable") {
      const localised = this.hass?.formatEntityState?.(this.hass.states[statusEntity!]);
      if (localised) return localised;
    }
    return this._t(`vacuum_${activity}` as TranslationKey);
  }

  private _battery(): { level?: number; charging: boolean } {
    const state = this.hass?.states[this._config!.entity];
    // `battery_level` on the vacuum entity was deprecated in favour of a
    // separate sensor, so both are read and whichever exists wins.
    const attr = state?.attributes.battery_level;
    let level = typeof attr === "number" ? attr : undefined;
    if (level === undefined) {
      const found = Object.keys(this.hass?.states ?? {}).find(
        (e) =>
          e.startsWith("sensor.") &&
          this.hass!.states[e].attributes.device_class === "battery" &&
          (this.hass!.entities as Record<string, { device_id?: string | null }> | undefined)?.[e]
            ?.device_id === this._entities()?.deviceId,
      );
      const value = found ? parseFloat(this.hass!.states[found].state) : NaN;
      if (!isNaN(value)) level = value;
    }
    const chargingEntity = this._entities()?.binary.charging;
    const charging =
      (chargingEntity ? this.hass?.states[chargingEntity]?.state === "on" : false) ||
      this._activity().activity === "docked";
    return { level, charging };
  }

  private _batteryColor(level: number | undefined): string {
    if (level === undefined) return "var(--secondary-text-color)";
    if (level > VACUUM_BATTERY_OK) return activityColor("docked");
    if (level > VACUUM_BATTERY_LOW) return activityColor("paused");
    return activityColor("error");
  }

  private _batteryIcon(level: number | undefined, charging: boolean): string {
    if (charging) return "mdi:battery-charging";
    if (level === undefined) return "mdi:battery-unknown";
    const step = Math.max(0, Math.min(10, Math.round(level / 10))) * 10;
    return step >= 100 ? "mdi:battery" : step <= 0 ? "mdi:battery-outline" : `mdi:battery-${step}`;
  }

  // ---- render ---------------------------------------------------------------

  protected render() {
    if (!this._config || !this.hass) return nothing;
    const state = this.hass.states[this._config.entity];
    if (!state) return renderMissingEntity(this._config.entity);

    const { activity, pending } = this._activity();
    const unavailable = activity === "unavailable";
    const colors = resolveCommonColors(this._config);
    // A configured accent pins the card to one colour; without one the state
    // is the colour, which is the whole point of the header.
    const accent = this._config.accent_color
      ? resolveThemeColor(this._config.accent_color)
      : activityColor(activity);
    const radius = `${this._config.radius ?? DEFAULT_VACUUM_RADIUS}px`;

    return html`
      <ha-card
        class=${unavailable ? "unavailable" : activity === "error" ? "errored" : ""}
        style=${`--m3v-accent: ${accent}; --m3v-icon-bg: ${tintOn(
          this,
          accent,
          this._config.accent_opacity,
          VACUUM_ICON_TINT,
        )}; --m3v-ink: ${inkOn(accent, this)}; border-radius: ${radius};`}
      >
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)}"
          style=${`border-radius: ${radius};${
            colors.cardBackgroundCss ? ` background: ${colors.cardBackgroundCss};` : ""
          }`}
        >
          ${this._renderHeader(activity, pending)} ${this._renderPrimaryRow(activity, pending)}
          ${this._renderFanSpeed(state.attributes.fan_speed_list as string[] | undefined,
            state.attributes.fan_speed as string | undefined,
            unavailable)}
          ${this._config.card_version
            ? html`<div class="version">${CARD_VERSION}</div>`
            : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderHeader(activity: VacuumActivity, pending: boolean) {
    const cfg = this._config!;
    const state = this.hass!.states[cfg.entity];
    const name = cfg.name ?? state.attributes.friendly_name ?? cfg.entity;
    const { level, charging } = this._battery();

    return html`
      <div class="header">
        <div
          class="icon-swatch"
          role="button"
          tabindex="0"
          aria-label=${name}
          @click=${() => this._fireMoreInfo(cfg.entity)}
          @keydown=${activateOnKey(() => this._fireMoreInfo(cfg.entity))}
        >
          <ha-icon icon=${cfg.icon ?? activityIcon(activity) ?? DEFAULT_VACUUM_ICON}></ha-icon>
        </div>
        <div class="header-text">
          <div class="name">${name}</div>
          <div class="status">${this._statusText(activity, pending)}</div>
        </div>
        ${level !== undefined
          ? html`
              <div
                class="battery"
                style=${`color: ${this._batteryColor(level)};`}
                aria-label=${`${this._t("vacuum_battery")} ${Math.round(level)} %`}
              >
                <ha-icon icon=${this._batteryIcon(level, charging)}></ha-icon>
                <span>${Math.round(level)} %</span>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderPrimaryRow(activity: VacuumActivity, pending: boolean) {
    const cfg = this._config!;
    const unavailable = activity === "unavailable";
    const intent = primaryIntent(activity);
    const label =
      intent === "pause"
        ? this._t("vacuum_pause")
        : intent === "resume"
          ? this._t("vacuum_resume")
          : this._t("vacuum_start");
    const icon =
      intent === "pause" ? "mdi:pause" : intent === "resume" ? "mdi:play" : "mdi:play";

    // Paused morphs rounder: the shape carries the state, so the button still
    // reads as "held" at a glance from across the room.
    const radius = activity === "paused" ? VACUUM_PRIMARY_RADIUS_PAUSED : VACUUM_PRIMARY_RADIUS;
    const secondary = cfg.secondary_actions ?? (["return_to_base", "locate"] as const);

    return html`
      <div class="primary-row">
        <button
          class="primary ${pending ? "pending" : ""}"
          style=${`border-radius: ${radius}px;`}
          ?disabled=${unavailable || intent === "none"}
          @click=${() => {
            if (intent === "pause") this._command("pause");
            else if (intent === "resume") this._command("resume");
            else this._command("start");
          }}
        >
          <ha-icon icon=${icon}></ha-icon>
          <span>${label}</span>
        </button>
        ${(secondary as readonly VacuumSecondaryAction[])
          .slice(0, 2)
          .map((action) => this._renderSecondary(action, unavailable))}
      </div>
    `;
  }

  private _renderSecondary(action: VacuumSecondaryAction, unavailable: boolean) {
    const spec: Record<VacuumSecondaryAction, { icon: string; key: TranslationKey }> = {
      return_to_base: { icon: "mdi:home-import-outline", key: "vacuum_return" },
      locate: { icon: "mdi:map-marker-radius-outline", key: "vacuum_locate" },
      stop: { icon: "mdi:stop", key: "vacuum_stop" },
      // The rooms toggle lands in step 3, with the block it opens; until then
      // it is not offered rather than rendered as a button that does nothing.
      rooms: { icon: "mdi:view-grid-outline", key: "vacuum_rooms" },
    };
    if (action === "rooms") return nothing;
    const { icon, key } = spec[action];
    return html`
      <button
        class="secondary"
        ?disabled=${unavailable}
        aria-label=${this._t(key)}
        title=${this._t(key)}
        @click=${() => {
          if (action === "return_to_base") this._command("return");
          else if (action === "stop") this._command("stop");
          else this._call("locate");
        }}
      >
        <ha-icon icon=${icon}></ha-icon>
      </button>
    `;
  }

  private _renderFanSpeed(
    list: string[] | undefined,
    current: string | undefined,
    unavailable: boolean,
  ) {
    if (this._config?.show_fan_speed === false) return nothing;
    // Not every vacuum reports a list, and a row of one pill is not a choice.
    if (!list || list.length < 2) return nothing;

    return html`
      <div class="section-label">${this._t("vacuum_fan_speed")}</div>
      <div class="fan-row">
        ${list.map((speed, index) => {
          const active = speed === current;
          const key = fanSpeedKey(speed);
          const label = key ? this._t(`vacuum_fan_${key}` as TranslationKey) : speed;
          const lit = fanBarsLit(index, list.length);
          return html`
            <button
              class="fan ${active ? "active" : ""}"
              ?disabled=${unavailable}
              aria-pressed=${active ? "true" : "false"}
              @click=${() => this._setFanSpeed(speed)}
            >
              ${this._renderBars(lit)}
              <span class="fan-label">${label}</span>
            </button>
          `;
        })}
      </div>
    `;
  }

  /** Four rising bars, the lit ones in the pill's ink. */
  private _renderBars(lit: number) {
    const width = FAN_BAR_HEIGHTS.length * (VACUUM_FAN_BAR_WIDTH + 2) - 2;
    const height = Math.max(...FAN_BAR_HEIGHTS);
    return svg`
      <svg class="bars" width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`}>
        ${FAN_BAR_HEIGHTS.map(
          (h, i) => svg`
            <rect
              x=${i * (VACUUM_FAN_BAR_WIDTH + 2)}
              y=${height - h}
              width=${VACUUM_FAN_BAR_WIDTH}
              height=${h}
              rx=${VACUUM_FAN_BAR_RADIUS}
              opacity=${i < lit ? 1 : 0.28}
            ></rect>
          `,
        )}
      </svg>
    `;
  }

  static styles = [
    glassCardStyles,
    css`
      ha-card {
        color: var(--m3p-text, var(--primary-text-color));
        overflow: hidden;
      }

      ha-card.unavailable .card-inner {
        /* Grey, never red: a Roborock drops off the network briefly all the
           time, and painting that as an error trains the user to ignore red. */
        opacity: 0.4;
      }

      ha-card.errored {
        outline: 2px solid var(--m3v-accent);
        outline-offset: -2px;
      }

      .card-inner {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 14px;
        box-sizing: border-box;
        height: 100%;
      }

      .header {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .icon-swatch {
        flex: 0 0 auto;
        width: ${unsafeCSS(VACUUM_ICON_SIZE)}px;
        height: ${unsafeCSS(VACUUM_ICON_SIZE)}px;
        border-radius: ${unsafeCSS(VACUUM_ICON_RADIUS)}px;
        background: var(--m3v-icon-bg);
        color: var(--m3v-accent);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        --mdc-icon-size: 22px;
        transition:
          background 0.3s ${unsafeCSS(STANDARD_EASING)},
          color 0.3s ${unsafeCSS(STANDARD_EASING)};
      }

      .icon-swatch:focus-visible {
        outline: 2px solid var(--m3v-accent);
        outline-offset: 2px;
      }

      .header-text {
        flex: 1;
        min-width: 0;
      }

      .name {
        font-size: ${unsafeCSS(VACUUM_NAME_SIZE)}px;
        font-weight: 700;
        letter-spacing: -0.1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--m3p-text, var(--primary-text-color));
      }

      .status {
        font-size: ${unsafeCSS(VACUUM_STATUS_SIZE)}px;
        font-weight: 600;
        color: var(--m3v-accent);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: color 0.3s ${unsafeCSS(STANDARD_EASING)};
      }

      .battery {
        flex: 0 0 auto;
        height: ${unsafeCSS(VACUUM_BATTERY_HEIGHT)}px;
        border-radius: ${unsafeCSS(VACUUM_BATTERY_RADIUS)}px;
        padding: 0 10px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: color-mix(in srgb, currentColor 14%, transparent);
        font-size: 12px;
        font-weight: 700;
        --mdc-icon-size: 15px;
      }

      .primary-row {
        display: flex;
        align-items: stretch;
        gap: 8px;
      }

      .primary {
        flex: 1;
        min-width: 0;
        height: ${unsafeCSS(VACUUM_PRIMARY_HEIGHT)}px;
        border: none;
        background: var(--m3v-accent);
        color: var(--m3v-ink);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: inherit;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        --mdc-icon-size: 20px;
        /* Radius is the state signal, so it gets the longer, softer curve;
           colour follows it rather than leading. */
        transition:
          border-radius 0.35s ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)},
          opacity 0.2s linear;
      }

      /* Showing something the vacuum has not confirmed yet. Dimmed, not
         disabled: tapping again should still work if the first one was lost. */
      .primary.pending {
        opacity: ${unsafeCSS(VACUUM_PENDING_OPACITY)};
      }

      .primary:disabled,
      .secondary:disabled {
        cursor: default;
        opacity: 0.4;
      }

      .secondary {
        flex: 0 0 auto;
        width: ${unsafeCSS(VACUUM_SECONDARY_WIDTH)}px;
        height: ${unsafeCSS(VACUUM_PRIMARY_HEIGHT)}px;
        border: none;
        border-radius: ${unsafeCSS(VACUUM_SECONDARY_RADIUS)}px;
        background: color-mix(
          in srgb,
          var(--m3v-accent) ${unsafeCSS(VACUUM_SECONDARY_TINT)}%,
          transparent
        );
        color: var(--m3v-accent);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        --mdc-icon-size: 22px;
        transition: background 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .section-label {
        font-size: 11px;
        font-weight: 600;
        opacity: 0.55;
        margin-bottom: -6px;
      }

      .fan-row {
        display: flex;
        gap: 6px;
      }

      .fan {
        flex: 1;
        min-width: 0;
        height: ${unsafeCSS(VACUUM_FAN_HEIGHT)}px;
        border: none;
        border-radius: ${unsafeCSS(VACUUM_FAN_RADIUS)}px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 7%, transparent);
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 0 4px;
        font-family: inherit;
        cursor: pointer;
        transition:
          border-radius 0.35s ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)},
          color 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .fan.active {
        border-radius: ${unsafeCSS(VACUUM_FAN_RADIUS_ACTIVE)}px;
        background: color-mix(
          in srgb,
          var(--m3v-accent) ${unsafeCSS(VACUUM_FAN_TINT)}%,
          transparent
        );
        color: var(--m3v-accent);
      }

      .bars {
        display: block;
        fill: currentColor;
      }

      .fan-label {
        font-size: ${unsafeCSS(VACUUM_FAN_LABEL_SIZE)}px;
        font-weight: 600;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .version {
        font-size: 10px;
        opacity: 0.4;
        text-align: right;
      }

      @media (prefers-reduced-motion: reduce) {
        .primary,
        .fan,
        .icon-swatch,
        .status,
        .secondary {
          transition: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-vacuum-card": M3VacuumCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-vacuum-card",
  name: "M3 Vacuum Card",
  description:
    "A Material 3 control surface for a robot vacuum: state, battery, start/pause and suction, with every companion entity discovered on the device. Built for Roborock, usable with any vacuum entity.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
