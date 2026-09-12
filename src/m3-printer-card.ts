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
  PRINTER_AMS_BAR_HEIGHT,
  PRINTER_AMS_PADDING,
  PRINTER_AMS_RADIUS,
  PRINTER_AMS_SWATCH,
  PRINTER_AMS_SWATCH_RADIUS,
  PRINTER_AMS_TINT,
  PRINTER_CAMERA_ASPECT,
  PRINTER_CAMERA_BADGE_RADIUS,
  PRINTER_CAMERA_BUTTON,
  PRINTER_CAMERA_BUTTON_RADIUS,
  PRINTER_CAMERA_BUTTON_RADIUS_ACTIVE,
  PRINTER_CAMERA_RADIUS,
  PRINTER_CAMERA_REFRESH_S,
  PRINTER_FILAMENT_WARN,
  PRINTER_HEATING_DELTA,
  PRINTER_NARROW_PX,
  PRINTER_SPEED_HEIGHT,
  PRINTER_SPEED_RADIUS,
  PRINTER_SPEED_RADIUS_ACTIVE,
  PRINTER_TEMP_LABEL_SIZE,
  PRINTER_TEMP_PADDING,
  PRINTER_TEMP_RADIUS,
  PRINTER_TEMP_TINT,
  PRINTER_TEMP_VALUE_SIZE,
  PRINTER_WAVE_AMPLITUDE,
  PRINTER_WAVE_GAP,
  PRINTER_WAVE_STROKE,
  PRINTER_WAVE_SVG_HEIGHT,
  PRINTER_WAVE_WAVELENGTH,
  PRINTER_ACCESSORY_HEIGHT,
  PRINTER_ACCESSORY_ICON,
  PRINTER_ACCESSORY_ICON_RADIUS,
  PRINTER_ACCESSORY_ICON_RADIUS_ON,
  PRINTER_ACCESSORY_RADIUS,
  PRINTER_DETAIL_CHIP_HEIGHT,
  PRINTER_DETAIL_CHIP_RADIUS,
  PRINTER_DETAILS_HEIGHT,
  PRINTER_DETAILS_RADIUS,
  PRINTER_DETAILS_RADIUS_OPEN,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { STANDARD_EASING } from "./shared/animation";
import { runHaAction, isActionable } from "./shared/actions";
import { cardHeaderStyles, renderCardHeader } from "./shared/card-header";
import { inkOn, resolveCommonColors, resolveThemeColor, tintOn } from "./shared/color-config";
import { formatNumber } from "./shared/formatting";
import { buildWavePath } from "./shared/wave";
import { VisibleTicker } from "./shared/visible-ticker";
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
  /** Bumped by the ticker so the camera still gets a fresh URL. */
  @state() private _cameraTick = 0;
  @state() private _detailsOpen?: boolean;
  private _ticker = new VisibleTicker(this, () => {
    this._cameraTick++;
  });

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

  public static async getConfigElement(): Promise<import("./types").LovelaceCardEditor> {
    await import("./m3-printer-card-editor");
    return document.createElement(
      "m3-printer-card-editor",
    ) as unknown as import("./types").LovelaceCardEditor;
  }

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

  public connectedCallback(): void {
    super.connectedCallback();
    this._ticker.setCadence("second");
    this._ticker.connect();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ticker.disconnect();
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

  // ---- camera -----------------------------------------------------------------

  /**
   * The chamber view.
   *
   * A still by default, not a stream. A printer's camera runs on the printer's
   * own CPU and bandwidth, and a dashboard left open on a wall tablet would
   * hold that open for hours while the machine has better uses for it —
   * `camera_live` opts in.
   *
   * The refresh is driven by VisibleTicker, so it stops when the card scrolls
   * off screen or the tab is hidden. A layer takes longer than the interval
   * anyway, so there is nothing to miss.
   */
  private _renderCamera(state: PrinterState) {
    if (this._config?.show_camera === false) return nothing;
    const entityId = this._entity("camera_entity", "camera");
    if (!entityId) return nothing;
    const cameraState = this.hass?.states[entityId];
    const picture = cameraState?.attributes.entity_picture as string | undefined;
    if (!picture) return nothing;

    const live = this._config?.camera_live === true && entityId.startsWith("camera.");
    const refresh = (this._config?.camera_refresh ?? PRINTER_CAMERA_REFRESH_S) * 1000;
    // An image entity's state is the timestamp of the picture, so it is the
    // better cache key than a clock: it changes exactly when there is
    // something new. A camera entity has no such state, hence the bucket.
    const bucket =
      entityId.startsWith("image.")
        ? (cameraState!.state ?? "")
        : String(Math.floor((this._cameraTick * 1000) / Math.max(1000, refresh)));

    const lightEntity = this._entity("light_entity", "light");
    const lightOn = lightEntity ? this.hass?.states[lightEntity]?.state === "on" : false;
    const running = isRunning(state);

    return html`
      <div class="camera">
        <img
          class=${lightEntity && !lightOn ? "dim" : ""}
          src=${`${picture}${picture.includes("?") ? "&" : "?"}m3=${bucket}`}
          alt=""
        />
        <div class="cam-badge">
          <span class="dot ${running && live ? "live" : ""}"></span>
          ${this._t("printer_live")}
        </div>
        <div class="cam-actions">
          ${lightEntity
            ? html`
                <button
                  class="cam-btn ${lightOn ? "on" : ""}"
                  aria-pressed=${lightOn ? "true" : "false"}
                  aria-label=${this._t("printer_light")}
                  title=${this._t("printer_light")}
                  @click=${() =>
                    this.hass?.callService(lightEntity.split(".")[0], "toggle", {
                      entity_id: lightEntity,
                    })}
                >
                  <ha-icon icon=${lightOn ? "mdi:lightbulb-on" : "mdi:lightbulb-outline"}></ha-icon>
                </button>
              `
            : nothing}
          <button
            class="cam-btn"
            aria-label=${this._t("printer_fullscreen")}
            title=${this._t("printer_fullscreen")}
            @click=${() => this._fireMoreInfo(entityId)}
          >
            <ha-icon icon="mdi:fullscreen"></ha-icon>
          </button>
        </div>
      </div>
    `;
  }

  // ---- progress ---------------------------------------------------------------

  /** Only while a job exists. An idle printer has no progress to report, and a
   *  bar sitting at zero is worse than no bar. */
  private _renderProgress(state: PrinterState) {
    if (this._config?.show_progress === false) return nothing;
    if (!isRunning(state)) return nothing;
    const percent = this._numeric(this._entity("progress_entity", "progress"));
    if (percent === undefined) return nothing;

    const clamped = Math.max(0, Math.min(100, percent));
    const width = 100;
    const mid = PRINTER_WAVE_SVG_HEIGHT / 2;
    const filled = (clamped / 100) * width;
    // The wave flattens when paused: the shape says "stopped" before the word
    // does, and a wave that keeps rolling on a paused printer is a lie.
    const amplitude = state === "paused" ? 0 : PRINTER_WAVE_AMPLITUDE;
    const path = buildWavePath(0, Math.max(0, filled - PRINTER_WAVE_GAP / 2), amplitude, PRINTER_WAVE_WAVELENGTH, 0, mid);

    return html`
      <svg class="wave" viewBox=${`0 0 ${width} ${PRINTER_WAVE_SVG_HEIGHT}`} preserveAspectRatio="none">
        <line
          class="wave-rest"
          x1=${Math.min(width, filled + PRINTER_WAVE_GAP / 2)}
          y1=${mid}
          x2=${width}
          y2=${mid}
        ></line>
        <path class="wave-fill" d=${path}></path>
      </svg>
    `;
  }

  // ---- temperatures -----------------------------------------------------------

  private _renderTemps() {
    if (this._config?.show_temps === false) return nothing;
    const tiles = [
      {
        key: "printer_nozzle" as TranslationKey,
        icon: "mdi:thermometer",
        color: "#e57368",
        value: this._numeric(this._entity("nozzle_temp_entity", "nozzleTemp")),
        target: this._numeric(this._entity("nozzle_target_entity", "nozzleTarget")),
      },
      {
        key: "printer_bed" as TranslationKey,
        icon: "mdi:grill",
        color: "#f0a24a",
        value: this._numeric(this._entity("bed_temp_entity", "bedTemp")),
        target: this._numeric(this._entity("bed_target_entity", "bedTarget")),
      },
      {
        key: "printer_chamber" as TranslationKey,
        icon: "mdi:cube-outline",
        color: "#5dcaa5",
        value: this._numeric(this._entity("chamber_temp_entity", "chamberTemp")),
        target: undefined,
      },
    ].filter((t) => t.value !== undefined);
    if (!tiles.length) return nothing;

    return html`
      <div class="temps">
        ${tiles.map((tile) => {
          // Still heating: the value pulses rather than a second badge
          // appearing, because the number is already the thing being watched.
          const heating =
            tile.target !== undefined && tile.target > 0 && tile.value! < tile.target - PRINTER_HEATING_DELTA;
          return html`
            <div
              class="temp"
              style=${`background: color-mix(in srgb, ${tile.color} ${PRINTER_TEMP_TINT}%, transparent);`}
            >
              <ha-icon style=${`color: ${tile.color};`} icon=${tile.icon}></ha-icon>
              <div class="temp-value ${heating ? "heating" : ""}" style=${`color: ${tile.color};`}>
                ${formatNumber(this._language, tile.value!, { maximumFractionDigits: 0 })}<span
                  class="temp-unit"
                  >°C</span
                >
              </div>
              <div class="temp-label">
                ${this._t(tile.key)}${tile.target !== undefined && tile.target > 0
                  ? ` · ${this._t("printer_target").replace("{n}", String(Math.round(tile.target)))}`
                  : ""}
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  // ---- speed profile ----------------------------------------------------------

  private _renderSpeed(state: PrinterState) {
    if (this._config?.show_speed === false) return nothing;
    const entityId = this._entity("speed_entity", "speed");
    if (!entityId) return nothing;
    const entity = this.hass?.states[entityId];
    const options = entity?.attributes.options as string[] | undefined;
    if (!options || options.length < 2) return nothing;

    const icons: Record<string, string> = {
      silent: "mdi:volume-off",
      quiet: "mdi:volume-off",
      standard: "mdi:speedometer",
      normal: "mdi:speedometer",
      sport: "mdi:rocket-launch-outline",
      ludicrous: "mdi:fire",
      extreme: "mdi:fire",
    };

    return html`
      <div class="section-label">${this._t("printer_speed")}</div>
      <div class="speed-row">
        ${options.map((option) => {
          const active = entity!.state === option;
          const key = option.toLowerCase();
          const translated = this._t(`printer_speed_${key}` as TranslationKey);
          const label = translated === `printer_speed_${key}` ? option : translated;
          return html`
            <button
              class="speed ${active ? "active" : ""}"
              ?disabled=${state === "offline"}
              aria-pressed=${active ? "true" : "false"}
              @click=${() =>
                this.hass?.callService("select", "select_option", {
                  entity_id: entityId,
                  option,
                })}
            >
              <ha-icon icon=${icons[key] ?? "mdi:speedometer"}></ha-icon>
              <span class="speed-label">${label}</span>
            </button>
          `;
        })}
      </div>
    `;
  }

  // ---- AMS --------------------------------------------------------------------

  /**
   * The filament trays.
   *
   * The swatch is filled with the tray's own colour, which is the one piece of
   * information here that a label cannot carry: "PLA" is four characters, but
   * which of the two PLA spools is the blue one is a question only the colour
   * answers.
   */
  private _renderAms() {
    if (this._config?.show_ams === false) return nothing;
    const configured = this._config?.ams_slots;
    const slots = configured?.length
      ? configured.map((slot) => ({
          type: slot.type_entity,
          color: slot.color_entity,
          remaining: slot.remaining_entity,
          entity: slot.type_entity ?? slot.color_entity,
        }))
      : (this._entities()?.amsSlots ?? []);
    if (!slots.length) return nothing;

    const warn = this._config?.filament_warn ?? PRINTER_FILAMENT_WARN;

    return html`
      <div class="section-label">${this._t("printer_ams")}</div>
      <div class="ams">
        ${slots.map((slot) => {
          const material = this._stateOf(slot.type);
          const colour = this._stateOf(slot.color);
          const remaining = this._numeric(slot.remaining);
          const empty = !material || material.toLowerCase() === "empty";
          // A colour sensor reports a hex, sometimes with an alpha byte the
          // browser would read as a fifth digit; the first six are the colour.
          const swatch = colour
            ? colour.startsWith("#")
              ? colour.slice(0, 7)
              : `#${colour.slice(0, 6)}`
            : undefined;

          return html`
            <div
              class="ams-slot ${empty ? "empty" : ""}"
              role=${slot.entity ? "button" : nothing}
              tabindex=${slot.entity ? "0" : nothing}
              @click=${() => this._fireMoreInfo(slot.entity)}
            >
              <div
                class="ams-swatch ${empty ? "empty" : ""}"
                style=${!empty && swatch ? `background: ${swatch};` : ""}
              ></div>
              <div class="ams-name">${empty ? this._t("printer_ams_empty") : material}</div>
              ${!empty && remaining !== undefined
                ? html`
                    <div class="ams-track">
                      <div
                        class="ams-fill ${remaining < warn ? "low" : ""}"
                        style=${`width: ${Math.max(0, Math.min(100, remaining))}%;`}
                      ></div>
                    </div>
                  `
                : nothing}
            </div>
          `;
        })}
      </div>
    `;
  }

  // ---- details ----------------------------------------------------------------

  /**
   * The drawer: everything true but not urgent.
   *
   * It stays closed by default because none of it changes what you would do
   * next — and it is the one block that survives `offline`, because the socket
   * switch lives in it and that is the only control that can bring the printer
   * back.
   */
  private _renderDetails(state: PrinterState) {
    if (this._config?.show_details === false) return nothing;
    const chips = this._detailChips(state);
    const accessories = this._config?.accessories ?? [];
    if (!chips.length && !accessories.length) return nothing;

    const open = this._detailsOpen ?? this._config?.details_default_open ?? false;

    return html`
      <div class="details">
        <button
          class="details-toggle ${open ? "open" : ""}"
          aria-expanded=${String(open)}
          @click=${() => {
            this._detailsOpen = !open;
          }}
        >
          <span class="details-icon"><ha-icon icon="mdi:information-outline"></ha-icon></span>
          <span class="details-label">${this._t("printer_details")}</span>
          <ha-icon class="details-chevron" icon="mdi:chevron-down"></ha-icon>
        </button>
        ${open
          ? html`
              ${chips.length
                ? html`<div class="detail-chips">
                    ${chips.map(
                      (chip) => html`
                        <span class="detail-chip ${chip.tone}">
                          <ha-icon icon=${chip.icon}></ha-icon>
                          <span>${chip.text}</span>
                        </span>
                      `,
                    )}
                  </div>`
                : nothing}
              ${accessories.length
                ? html`<div class="accessories">
                    ${accessories.map((a) => this._renderAccessory(a))}
                  </div>`
                : nothing}
            `
          : nothing}
      </div>
    `;
  }

  private _detailChips(
    state: PrinterState,
  ): { icon: string; text: string; tone: "plain" | "ok" | "error" }[] {
    const chips: { icon: string; text: string; tone: "plain" | "ok" | "error" }[] = [];
    const fmt = (entityId: string | undefined) => {
      if (!entityId) return undefined;
      const entity = this.hass?.states[entityId];
      if (!entity || !this._stateOf(entityId)) return undefined;
      return this.hass?.formatEntityState?.(entity) ?? entity.state;
    };

    const start = fmt(this._entity("start_time_entity", "startTime"));
    if (start && isRunning(state)) {
      chips.push({
        icon: "mdi:clock-start",
        text: this._t("printer_started").replace("{when}", start),
        tone: "plain",
      });
    }
    const end = fmt(this._entity("end_time_entity", "endTime"));
    if (end && isRunning(state)) {
      chips.push({
        icon: "mdi:clock-end",
        text: this._t("printer_ends").replace("{when}", end),
        tone: "plain",
      });
    }
    const power = this._numeric(this._entity("power_entity", "power"));
    if (power !== undefined) {
      chips.push({
        icon: "mdi:flash",
        text: `${formatNumber(this._language, power, { maximumFractionDigits: 0 })} W`,
        tone: "plain",
      });
    }
    const onlineEntity = this._entity("online_entity", "online");
    if (onlineEntity) {
      const online = this.hass?.states[onlineEntity]?.state === "on";
      chips.push({
        icon: online ? "mdi:wifi" : "mdi:wifi-off",
        text: this._t(online ? "printer_online" : "printer_offline_chip"),
        tone: online ? "plain" : "error",
      });
    }
    // The error chip is the one that earns the drawer: "no errors" is worth
    // saying once you have opened it, and an actual fault is shown in full
    // rather than as a count.
    const errorEntity = this._entity("error_entity", "error");
    if (errorEntity) {
      const raw = this.hass?.states[errorEntity];
      const value = this._stateOf(errorEntity);
      const clean = !value || value === "off" || value === "0" || value === "none";
      chips.push({
        icon: clean ? "mdi:check-circle-outline" : "mdi:alert-circle-outline",
        text: clean
          ? this._t("printer_no_errors")
          : (this.hass?.formatEntityState?.(raw!) ?? value!),
        tone: clean ? "ok" : "error",
      });
    }
    return chips;
  }

  private _renderAccessory(accessory: import("./types").PrinterAccessoryConfig) {
    const entity = this.hass?.states[accessory.entity];
    const on = entity?.state === "on";
    const name = accessory.name ?? entity?.attributes.friendly_name ?? accessory.entity;
    const power = this._numeric(accessory.power_entity);
    const colour = accessory.color ? resolveThemeColor(accessory.color) : "var(--m3pr-accent)";
    const right =
      power !== undefined && on
        ? `${formatNumber(this._language, power, { maximumFractionDigits: 0 })} W`
        : this._t(on ? "printer_online" : "printer_off");

    return html`
      <button
        class="accessory ${on ? "on" : ""}"
        ?disabled=${!entity}
        style=${on ? `--m3pr-acc: ${colour};` : ""}
        @click=${() =>
          this.hass?.callService(accessory.entity.split(".")[0], "toggle", {
            entity_id: accessory.entity,
          })}
      >
        <span class="accessory-icon">
          <ha-icon icon=${accessory.icon ?? "mdi:power-plug-outline"}></ha-icon>
        </span>
        <span class="accessory-name">${name}</span>
        <span class="accessory-value">${right}</span>
      </button>
    `;
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
          ${this._renderCamera(state)} ${this._renderHeader(state)}
          ${this._renderProgress(state)} ${this._renderTemps()}
          ${this._renderControls(state, pending)} ${this._renderSpeed(state)}
          ${this._renderAms()} ${this._renderDetails(state)}
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
        /* The narrow-layout rules below measure the card's own column, not the
           viewport — a printer card in a two-column grid on a desktop is as
           narrow as one on a phone. Without this the @container rules would
           silently never match. */
        container-type: inline-size;
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

      .camera {
        position: relative;
        aspect-ratio: ${unsafeCSS(PRINTER_CAMERA_ASPECT)};
        border-radius: ${unsafeCSS(PRINTER_CAMERA_RADIUS)}px;
        overflow: hidden;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 6%, transparent);
        line-height: 0;
      }

      .camera img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: filter 0.3s ${unsafeCSS(STANDARD_EASING)};
      }

      /* With the chamber light off the picture is dark anyway; dimming it
         further makes the light button's effect obvious before it is pressed. */
      .camera img.dim {
        filter: brightness(0.55);
      }

      .cam-badge {
        position: absolute;
        top: 8px;
        left: 8px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 24px;
        padding: 0 9px;
        border-radius: ${unsafeCSS(PRINTER_CAMERA_BADGE_RADIUS)}px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        line-height: 1;
        color: #fff;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(6px);
      }

      .cam-badge .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #8a8a8a;
      }

      /* Red only while a stream is actually live — a still image is not. */
      .cam-badge .dot.live {
        background: #e57368;
      }

      .cam-actions {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        gap: 6px;
      }

      .cam-btn {
        width: ${unsafeCSS(PRINTER_CAMERA_BUTTON)}px;
        height: ${unsafeCSS(PRINTER_CAMERA_BUTTON)}px;
        border: none;
        border-radius: ${unsafeCSS(PRINTER_CAMERA_BUTTON_RADIUS)}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #fff;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(6px);
        --mdc-icon-size: 18px;
        transition: border-radius 0.35s ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .cam-btn.on {
        border-radius: ${unsafeCSS(PRINTER_CAMERA_BUTTON_RADIUS_ACTIVE)}px;
        background: #f0c46e;
        color: #1c1c1c;
      }

      .wave {
        width: 100%;
        height: ${unsafeCSS(PRINTER_WAVE_SVG_HEIGHT)}px;
        display: block;
        overflow: visible;
      }

      .wave-fill {
        fill: none;
        stroke: var(--m3pr-accent);
        stroke-width: ${unsafeCSS(PRINTER_WAVE_STROKE)};
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }

      .wave-rest {
        stroke: color-mix(in srgb, var(--m3p-text, currentColor) 12%, transparent);
        stroke-width: ${unsafeCSS(PRINTER_WAVE_STROKE)};
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }

      .temps {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        gap: 6px;
      }

      .temp {
        padding: ${unsafeCSS(PRINTER_TEMP_PADDING)}px;
        border-radius: ${unsafeCSS(PRINTER_TEMP_RADIUS)}px;
        text-align: center;
        --mdc-icon-size: 14px;
      }

      .temp-value {
        font-size: ${unsafeCSS(PRINTER_TEMP_VALUE_SIZE)}px;
        font-weight: 700;
        line-height: 1.2;
      }

      .temp-unit {
        font-size: 10px;
        font-weight: 600;
        opacity: 0.7;
        margin-left: 1px;
      }

      .temp-value.heating {
        animation: m3pr-pulse 1.6s ease-in-out infinite;
      }

      @keyframes m3pr-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.45; }
      }

      .temp-label {
        font-size: ${unsafeCSS(PRINTER_TEMP_LABEL_SIZE)}px;
        opacity: 0.5;
      }

      .section-label {
        font-size: 11px;
        font-weight: 600;
        opacity: 0.55;
        margin-bottom: -6px;
      }

      .speed-row {
        display: flex;
        gap: 6px;
      }

      .speed {
        flex: 1;
        min-width: 0;
        height: ${unsafeCSS(PRINTER_SPEED_HEIGHT)}px;
        border: none;
        border-radius: ${unsafeCSS(PRINTER_SPEED_RADIUS)}px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 7%, transparent);
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        padding: 0 4px;
        font-family: inherit;
        cursor: pointer;
        --mdc-icon-size: 16px;
        transition: border-radius 0.35s ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)},
          color 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .speed.active {
        border-radius: ${unsafeCSS(PRINTER_SPEED_RADIUS_ACTIVE)}px;
        background: var(--m3pr-accent);
        color: var(--m3pr-ink);
      }

      .speed-label {
        font-size: 8px;
        font-weight: 600;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ams {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
        gap: 6px;
      }

      .ams-slot {
        padding: ${unsafeCSS(PRINTER_AMS_PADDING)}px;
        border-radius: ${unsafeCSS(PRINTER_AMS_RADIUS)}px;
        background: color-mix(
          in srgb,
          var(--m3p-text, currentColor) ${unsafeCSS(PRINTER_AMS_TINT)}%,
          transparent
        );
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        cursor: pointer;
      }

      .ams-swatch {
        width: ${unsafeCSS(PRINTER_AMS_SWATCH)}px;
        height: ${unsafeCSS(PRINTER_AMS_SWATCH)}px;
        border-radius: ${unsafeCSS(PRINTER_AMS_SWATCH_RADIUS)}px;
        border: 1.5px solid color-mix(in srgb, var(--m3p-text, currentColor) 22%, transparent);
        box-sizing: border-box;
      }

      /* An empty tray is drawn as an outline, not as a grey fill: grey is a
         filament colour, and a dashed hole is not. */
      .ams-swatch.empty {
        border-style: dashed;
        background: transparent;
      }

      .ams-name {
        font-size: 9px;
        font-weight: 700;
        opacity: 0.85;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      .ams-slot.empty .ams-name {
        font-weight: 500;
        opacity: 0.45;
      }

      .ams-track {
        width: 100%;
        height: ${unsafeCSS(PRINTER_AMS_BAR_HEIGHT)}px;
        border-radius: ${unsafeCSS(PRINTER_AMS_BAR_HEIGHT)}px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 10%, transparent);
        overflow: hidden;
      }

      .ams-fill {
        height: 100%;
        border-radius: inherit;
        background: #81c784;
      }

      .ams-fill.low {
        background: #f0a24a;
      }

      /* Narrow column: the temperatures stack and the speed pills lose their
         labels rather than truncating them to two characters. */
      @container (max-width: ${unsafeCSS(PRINTER_NARROW_PX)}px) {
        .temps {
          grid-template-columns: 1fr;
        }
        .speed-label {
          display: none;
        }
      }

      .details {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .details-toggle {
        height: ${unsafeCSS(PRINTER_DETAILS_HEIGHT)}px;
        border: none;
        border-radius: ${unsafeCSS(PRINTER_DETAILS_RADIUS)}px;
        padding: 0 12px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 6%, transparent);
        color: var(--m3p-text, var(--primary-text-color));
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: border-radius 0.35s ${unsafeCSS(STANDARD_EASING)};
      }

      .details-toggle.open {
        border-radius: ${unsafeCSS(PRINTER_DETAILS_RADIUS_OPEN)}px;
      }

      .details-icon {
        width: 28px;
        height: 28px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 8%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: 16px;
      }

      .details-label {
        flex: 1;
        text-align: left;
      }

      .details-chevron {
        --mdc-icon-size: 20px;
        opacity: 0.5;
        transition: transform 0.35s ${unsafeCSS(STANDARD_EASING)};
      }

      /* Points the way it will move, like every other fold in the suite. */
      .details-toggle:not(.open) .details-chevron {
        transform: rotate(-90deg);
      }

      .detail-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .detail-chip {
        height: ${unsafeCSS(PRINTER_DETAIL_CHIP_HEIGHT)}px;
        border-radius: ${unsafeCSS(PRINTER_DETAIL_CHIP_RADIUS)}px;
        padding: 0 10px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        --mdc-icon-size: 14px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 7%, transparent);
        color: var(--m3p-secondary-text, var(--secondary-text-color));
      }

      .detail-chip.ok {
        background: color-mix(in srgb, #81c784 14%, transparent);
        color: #81c784;
      }

      .detail-chip.error {
        background: color-mix(in srgb, #e57368 16%, transparent);
        color: #e57368;
      }

      .accessories {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .accessory {
        height: ${unsafeCSS(PRINTER_ACCESSORY_HEIGHT)}px;
        border: none;
        border-radius: ${unsafeCSS(PRINTER_ACCESSORY_RADIUS)}px;
        padding: 0 10px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 5%, transparent);
        color: var(--m3p-text, var(--primary-text-color));
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .accessory:disabled {
        cursor: default;
        opacity: 0.4;
      }

      .accessory-icon {
        flex: 0 0 auto;
        width: ${unsafeCSS(PRINTER_ACCESSORY_ICON)}px;
        height: ${unsafeCSS(PRINTER_ACCESSORY_ICON)}px;
        border-radius: ${unsafeCSS(PRINTER_ACCESSORY_ICON_RADIUS)}px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 8%, transparent);
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: 17px;
        transition: border-radius 0.35s ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)},
          color 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      /* Switched on, the icon's container tightens — the same shape-morph the
         station tiles and the fold arrow use, so "on" looks the same
         everywhere in the suite. */
      .accessory.on .accessory-icon {
        border-radius: ${unsafeCSS(PRINTER_ACCESSORY_ICON_RADIUS_ON)}px;
        background: color-mix(in srgb, var(--m3pr-acc, var(--m3pr-accent)) 20%, transparent);
        color: var(--m3pr-acc, var(--m3pr-accent));
      }

      .accessory-name {
        flex: 1;
        text-align: left;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .accessory-value {
        flex: 0 0 auto;
        font-size: 12px;
        font-weight: 700;
        opacity: 0.55;
      }

      .accessory.on .accessory-value {
        opacity: 1;
        color: var(--m3pr-acc, var(--m3pr-accent));
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
