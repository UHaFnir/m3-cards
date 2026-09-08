import {
  LitElement,
  html,
  css,
  nothing,
  unsafeCSS,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3ClimateCardConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  HvacMode,
  HassEntity,
  ClimateCardStyle,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_MODE_COLORS,
  MODE_ICONS,
  PRESET_ICONS,
  PRESET_ICON_FALLBACK,
  WINDOW_OPEN_COLOR,
  DEFAULT_BATTERY_THRESHOLD,
  DEFAULT_TEMP_STEP,
  DEFAULT_CLIMATE_RADIUS,
  MODE_PILL_BORDER_PX,
  MODE_PILL_LINE_PERCENT,
  MODE_PILL_WASH_PERCENT,
  SETPOINT_LINE_PERCENT,
  SETPOINT_WASH_PERCENT,
  resolveCornerRadius,
  THEME_COLOR_TOKENS,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import {
  resolveActionGlow,
  renderActionGlow,
  actionGlowStyles,
} from "./shared/action-glow";
import {
  resolveSetpointSurface,
  setpointSurfaceStyles,
  heroTempStyles,
} from "./shared/climate-surface";
import { hassChangeMatters } from "./shared/should-update";
import { formatNumber } from "./shared/formatting";
import { renderMissingEntity } from "./shared/glass-card";
import { tintOn } from "./shared/color-config";
import { shouldAnimate } from "./shared/animation";
import { migrateAnimationsField } from "./shared/config-migration";
import { activateOnKey } from "./shared/a11y";
import { openDropdownMenu, closeDropdownMenu } from "./shared/dropdown-menu";
import { TemplatedCard } from "./shared/templated-card";

console.info(
  `%c M3-CLIMATE-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #5dcaa5; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #5dcaa5; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

/** The per-render values both styles share — see `_resolveView`. */
type ClimateView = ReturnType<M3ClimateCard["_resolveView"]>;

@customElement("m3-climate-card")
export class M3ClimateCard extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3ClimateCardConfig;
  @state() private _presetMenuOpen = false;
  @state() private _modeMenuOpen = false;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement(
      "m3-climate-card-editor",
    ) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(
    hass: HomeAssistant,
  ): M3ClimateCardConfig {
    const climateEntity = Object.keys(hass?.states ?? {}).find((eid) =>
      eid.startsWith("climate."),
    );
    return {
      type: "custom:m3-climate-card",
      entity: climateEntity ?? "",
      show_presets: true,
      show_sensors: true,
      glass_background: true,
    };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, [
      this._config?.entity,
      this._config?.temperature_sensor,
      this._config?.humidity_sensor,
      this._config?.window_sensor,
      this._config?.battery_sensor,
    ]);
  }

  public setConfig(config: M3ClimateCardConfig): void {
    if (!config.entity) {
      throw new Error(
        "Bitte eine climate-Entität auswählen / Please select a climate entity",
      );
    }
    this._config = migrateAnimationsField({
      show_presets: true,
      show_sensors: true,
      glass_background: true,
      battery_threshold: DEFAULT_BATTERY_THRESHOLD,
      ...config,
    });
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: 6,
      rows: "auto",
      min_columns: 6,
      // The ecosee hero figure plus the setpoint row and the control row no
      // longer fit in three grid rows without clipping. `rows: "auto"` still
      // sizes the card to its content either way; this only stops a manual
      // resize below what fits.
      min_rows: this._style === "ecosee" ? 4 : 3,
    };
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    // The dropdown lives on document.body, so it would outlive a card removed
    // while its menu is open (view switch, editor preview).
    if (this._modeMenuOpen || this._presetMenuOpen) closeDropdownMenu();
  }

  private get _style(): ClimateCardStyle {
    return this._config?.style ?? "tiles";
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _modeColor(mode: string): string {
    const override = (
      this._config?.mode_colors as Record<string, string> | undefined
    )?.[mode];
    const resolved =
      override || DEFAULT_MODE_COLORS[mode as HvacMode] || DEFAULT_MODE_COLORS.off;
    return THEME_COLOR_TOKENS[resolved] ?? resolved;
  }

  private _modeIcon(mode: string): string {
    return MODE_ICONS[mode as HvacMode] ?? "mdi:thermostat";
  }

  private _resolveColor(value: string): string {
    return THEME_COLOR_TOKENS[value] ?? value;
  }

  private _defaultIcon(hvacModes: string[]): string {
    const canHeat = hvacModes.includes("heat");
    const canCool = hvacModes.includes("cool") || hvacModes.includes("heat_cool");
    if (canHeat && !canCool) return "mdi:radiator";
    return "mdi:air-conditioner";
  }

  private _formatNumber(value: number, digits = 1): string {
    return formatNumber(this._language, value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  private _fireMoreInfo(entityId?: string): void {
    if (!entityId) return;
    const event = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(event);
  }

  private _selectMode(mode: string, unavailable: boolean): void {
    if (unavailable || !this.hass || !this._config) return;
    this.hass.callService("climate", "set_hvac_mode", {
      entity_id: this._config.entity,
      hvac_mode: mode,
    });
  }

  private _selectPreset(preset: string, unavailable: boolean): void {
    if (unavailable || !this.hass || !this._config) return;
    this.hass.callService("climate", "set_preset_mode", {
      entity_id: this._config.entity,
      preset_mode: preset,
    });
  }

  // Style `ecosee` collapses the mode row into one button. It opens a picker
  // when there is a real choice to make; with exactly two modes left (say only
  // "auto" and "off" after hiding "heat") a menu is ceremony for a binary
  // switch, so a tap flips straight to the other one.
  private _handleModeButtonClick(
    event: Event,
    hvacModes: string[],
    currentMode: string,
    statusText: string,
    unavailable: boolean,
  ): void {
    if (unavailable || hvacModes.length === 0) return;
    if (hvacModes.length <= 2) {
      const next = hvacModes.find((m) => m !== currentMode) ?? hvacModes[0];
      this._selectMode(next, unavailable);
      return;
    }
    this._modeMenuOpen = true;
    openDropdownMenu({
      anchor: event.currentTarget as HTMLElement,
      label: statusText,
      items: hvacModes.map((mode) => ({
        value: mode,
        label: this._t(mode as TranslationKey) ?? mode,
        icon: this._modeIcon(mode),
        selected: mode === currentMode,
      })),
      onSelect: (mode) => this._selectMode(mode, unavailable),
      onClose: () => {
        this._modeMenuOpen = false;
      },
    });
  }

  private _openPresetMenu(
    event: Event,
    presetModes: string[],
    currentPreset: string | undefined,
    unavailable: boolean,
  ): void {
    if (unavailable || presetModes.length === 0) return;
    this._presetMenuOpen = true;
    openDropdownMenu({
      anchor: event.currentTarget as HTMLElement,
      label: this._t("select_preset"),
      items: presetModes.map((preset) => ({
        value: preset,
        label: this._presetPillLabel(preset),
        icon: this._presetIcon(preset),
        selected: preset === currentPreset,
      })),
      onSelect: (preset) => this._selectPreset(preset, unavailable),
      onClose: () => {
        this._presetMenuOpen = false;
      },
    });
  }

  // Style `ecosee` only: the ± buttons carry no value, so they default to a
  // hairline ring with no fill at all, leaving the setpoint pill beside them
  // as the only filled shape in the row. An explicit plus_opacity /
  // minus_opacity still gets its tint.
  private _stepperFill(color: string, opacity: number | undefined): string {
    if (opacity === undefined) return "transparent";
    return tintOn(this, color, opacity, 0);
  }

  // Style `tiles` keeps its single preset button cycling through the list.
  private _cyclePreset(
    presetModes: string[],
    currentPreset: string | undefined,
    unavailable: boolean,
  ): void {
    if (unavailable || !this.hass || !this._config || presetModes.length === 0)
      return;
    const currentIndex = currentPreset ? presetModes.indexOf(currentPreset) : -1;
    const next = presetModes[(currentIndex + 1) % presetModes.length];
    this._selectPreset(next, unavailable);
  }

  private _handleStep(
    direction: 1 | -1,
    currentTemp: number,
    step: number,
    min: number,
    max: number,
    unavailable: boolean,
  ): void {
    if (unavailable || !this.hass || !this._config) return;
    let next = currentTemp + direction * step;
    next = Math.min(max, Math.max(min, next));
    next = Math.round(next / step) * step;
    this.hass.callService("climate", "set_temperature", {
      entity_id: this._config.entity,
      temperature: next,
    });
  }

  /** Everything both styles read off `hass`, resolved once. The two render
   *  methods below are then pure markup — the only values they resolve for
   *  themselves are the ones whose defaults genuinely differ per style. */
  private _resolveView(entity: HassEntity) {
    const config = this._config!;
    const attrs = entity.attributes ?? {};
    const unavailable =
      entity.state === "unavailable" || entity.state === "unknown";
    const dimUnavailable = unavailable && config.unavailable_style !== "normal";
    const currentMode = entity.state as HvacMode;
    const modeColor = this._modeColor(unavailable ? "off" : currentMode);
    const offColor = this._modeColor("off");
    const active = !unavailable && currentMode !== "off";

    const iconActiveColor = config.icon_active_color
      ? this._resolveColor(config.icon_active_color)
      : "var(--primary-color)";
    const iconInactiveColor = config.icon_inactive_color
      ? this._resolveColor(config.icon_inactive_color)
      : "var(--primary-color)";
    const iconColor = active ? iconActiveColor : iconInactiveColor;

    const hvacModesRaw: string[] = Array.isArray(attrs.hvac_modes)
      ? attrs.hvac_modes
      : [];
    const hiddenModes = new Set(config.hidden_modes ?? []);
    const hvacModes = [
      ...hvacModesRaw.filter((m) => m === "off"),
      ...hvacModesRaw.filter((m) => m !== "off"),
    ].filter((m) => !hiddenModes.has(m));

    const name = config.name || attrs.friendly_name || config.entity;
    const icon = config.icon || this._defaultIcon(hvacModesRaw);
    const statusText = unavailable
      ? this._t("unavailable")
      : this._t(currentMode as TranslationKey) ?? currentMode;

    const windowEntity = config.window_sensor
      ? this.hass!.states[config.window_sensor]
      : undefined;
    const windowOpen = windowEntity?.state === "on";

    const batteryEntity = config.battery_sensor
      ? this.hass!.states[config.battery_sensor]
      : undefined;
    const batteryValue = batteryEntity ? parseFloat(batteryEntity.state) : NaN;
    const batteryThreshold =
      config.battery_threshold ?? DEFAULT_BATTERY_THRESHOLD;
    const batteryLow =
      !isNaN(batteryValue) && batteryValue <= batteryThreshold;

    const tempEntity = config.temperature_sensor
      ? this.hass!.states[config.temperature_sensor]
      : undefined;
    const currentTemperature =
      tempEntity !== undefined
        ? parseFloat(tempEntity.state)
        : typeof attrs.current_temperature === "number"
          ? attrs.current_temperature
          : undefined;

    const humidityEntity = config.humidity_sensor
      ? this.hass!.states[config.humidity_sensor]
      : undefined;
    const currentHumidity =
      humidityEntity !== undefined
        ? parseFloat(humidityEntity.state)
        : typeof attrs.current_humidity === "number"
          ? attrs.current_humidity
          : undefined;

    const tempUnit = this.hass!.config?.unit_system?.temperature ?? "°C";

    const presetModes: string[] = Array.isArray(attrs.preset_modes)
      ? attrs.preset_modes
      : [];

    const targetTemp: number | undefined =
      typeof attrs.temperature === "number"
        ? attrs.temperature
        : typeof attrs.target_temp_high === "number"
          ? attrs.target_temp_high
          : undefined;

    return {
      attrs,
      unavailable,
      dimUnavailable,
      currentMode,
      modeColor,
      offColor,
      active,
      iconColor,
      hvacModes,
      name,
      icon,
      statusText,
      windowOpen,
      batteryLow,
      batteryValue,
      currentTemperature,
      currentHumidity,
      tempUnit,
      presetModes,
      showPresets: config.show_presets !== false && presetModes.length > 0,
      showSensors: config.show_sensors !== false,
      presetStyle: config.preset_style ?? "chip",
      tempInHeader: config.temperature_chip_placement === "header",
      targetTemp,
      step: attrs.target_temp_step ?? DEFAULT_TEMP_STEP,
      minTemp: attrs.min_temp ?? 7,
      maxTemp: attrs.max_temp ?? 35,
      radius: resolveCornerRadius(
        config.radius ?? DEFAULT_CLIMATE_RADIUS,
        config.corners,
      ),
      heightStyle: config.height ? `min-height: ${config.height}px;` : "",
      animClass: shouldAnimate(config.animation) ? "" : "no-animations",
    };
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;

    const entity = this.hass.states[this._config.entity];

    if (!entity) {
      return renderMissingEntity(this._config.entity);
    }

    const unavailable =
      entity.state === "unavailable" || entity.state === "unknown";
    if (unavailable && this._config.unavailable_style === "hidden") {
      return nothing;
    }

    const view = this._resolveView(entity);
    return this._style === "ecosee"
      ? this._renderEcosee(view)
      : this._renderTiles(view);
  }

  /** The header is the one part both styles draw identically. */
  private _renderHeader(v: ClimateView): TemplateResult {
    return html`
      <div
        class="header"
        role="button"
        tabindex="0"
        aria-label=${v.name}
        @click=${() => this._fireMoreInfo(this._config?.entity)}
        @keydown=${activateOnKey(() => this._fireMoreInfo(this._config?.entity))}
      >
        <div class="icon-container">
          <ha-icon icon=${v.icon}></ha-icon>
        </div>
        <div class="header-text">
          <div class="name">${v.name}</div>
          ${this._config?.show_header_status !== false
            ? html`<div class="status">${v.statusText}</div>`
            : nothing}
        </div>
        <div class="header-chips">
          ${v.windowOpen
            ? html`
                <div class="status-chip window-chip">
                  <ha-icon icon="mdi:window-open-variant"></ha-icon>
                  <span>${this._t("open")}</span>
                </div>
              `
            : nothing}
          ${v.tempInHeader && v.currentTemperature !== undefined
            ? html`
                <div class="status-chip">
                  <ha-icon icon="mdi:thermometer"></ha-icon>
                  <span
                    >${v.unavailable
                      ? "–"
                      : `${this._formatNumber(v.currentTemperature)} ${v.tempUnit}`}</span
                  >
                </div>
              `
            : nothing}
          ${v.batteryLow
            ? html`
                <div class="status-chip battery-chip">
                  <ha-icon icon="mdi:battery-alert"></ha-icon>
                  <span>${Math.round(v.batteryValue)}%</span>
                </div>
              `
            : nothing}
        </div>
      </div>
    `;
  }

  // ---- style: tiles ---------------------------------------------------------
  // The original layout, unchanged: every mode as its own pill, a sensor row,
  // and a −/target/+ stepper under it.
  private _renderTiles(v: ClimateView) {
    const config = this._config!;

    const plusActiveColor = config.plus_active_color
      ? this._resolveColor(config.plus_active_color)
      : v.modeColor;
    const plusInactiveColor = config.plus_inactive_color
      ? this._resolveColor(config.plus_inactive_color)
      : v.offColor;
    const plusColor = v.active ? plusActiveColor : plusInactiveColor;

    const minusActiveColor = config.minus_active_color
      ? this._resolveColor(config.minus_active_color)
      : "var(--primary-text-color)";
    const minusInactiveColor = config.minus_inactive_color
      ? this._resolveColor(config.minus_inactive_color)
      : "var(--primary-text-color)";
    const minusColor = v.active ? minusActiveColor : minusInactiveColor;

    return html`
      <ha-card
        style=${`--m3-mode-color: ${v.modeColor}; --m3-icon-color: ${v.iconColor}; --m3-plus-color: ${plusColor}; --m3-minus-color: ${minusColor}; --m3-icon-bg: ${tintOn(this, v.iconColor, config.icon_opacity, 18)}; --m3-plus-bg: ${tintOn(this, plusColor, config.plus_opacity, 20)}; --m3-minus-bg: ${tintOn(this, minusColor, config.minus_opacity, 8)}; border-radius: ${v.radius};`}
        class=${v.dimUnavailable ? "unavailable" : ""}
      >
        <div
          class="card-inner style-tiles ${glassCardClass(config.glass_background)} ${v.animClass}"
          style=${`border-radius: ${v.radius}; ${v.heightStyle}`}
        >
          ${this._renderHeader(v)}

          <div class="mode-row">
            ${v.hvacModes.map((mode) => {
              const active = mode === v.currentMode && !v.unavailable;
              return html`
                <button
                  class="pill ${active ? "active" : ""}"
                  style=${`--pill-color: ${this._modeColor(mode)};`}
                  ?disabled=${v.dimUnavailable}
                  aria-label=${this._t(mode as TranslationKey)}
                  title=${this._t(mode as TranslationKey)}
                  @click=${() => this._selectMode(mode, v.dimUnavailable)}
                >
                  <ha-icon icon=${this._modeIcon(mode)}></ha-icon>
                </button>
              `;
            })}
            ${v.showPresets && v.presetStyle === "pill"
              ? html`
                  <button
                    class="pill"
                    ?disabled=${v.dimUnavailable}
                    aria-label=${this._presetPillLabel(v.attrs.preset_mode)}
                    title=${this._presetPillLabel(v.attrs.preset_mode)}
                    @click=${() =>
                      this._cyclePreset(
                        v.presetModes,
                        v.attrs.preset_mode,
                        v.dimUnavailable,
                      )}
                  >
                    <ha-icon
                      icon=${this._presetIcon(v.attrs.preset_mode)}
                    ></ha-icon>
                  </button>
                `
              : nothing}
          </div>

          ${v.showSensors &&
          ((v.currentTemperature !== undefined && !v.tempInHeader) ||
            v.currentHumidity !== undefined)
            ? html`
                <div class="info-row">
                  ${v.currentTemperature !== undefined && !v.tempInHeader
                    ? html`
                        <div class="sensor-chip">
                          <ha-icon icon="mdi:thermometer"></ha-icon>
                          <span
                            >${v.unavailable
                              ? "–"
                              : `${this._formatNumber(v.currentTemperature)} ${v.tempUnit}`}</span
                          >
                        </div>
                      `
                    : nothing}
                  ${v.currentHumidity !== undefined
                    ? html`
                        <div class="sensor-chip">
                          <ha-icon icon="mdi:water-percent"></ha-icon>
                          <span
                            >${v.unavailable
                              ? "–"
                              : `${this._formatNumber(v.currentHumidity, 0)} %`}</span
                          >
                        </div>
                      `
                    : nothing}
                </div>
              `
            : nothing}
          ${v.showPresets && v.presetStyle === "chip"
            ? html`
                <button
                  class="preset-chip"
                  ?disabled=${v.dimUnavailable}
                  @click=${() =>
                    this._cyclePreset(
                      v.presetModes,
                      v.attrs.preset_mode,
                      v.dimUnavailable,
                    )}
                >
                  ${this._presetLabel(v.attrs.preset_mode)}
                </button>
              `
            : nothing}

          <div class="stepper-row">
            <button
              class="stepper-btn minus"
              ?disabled=${v.dimUnavailable || v.targetTemp === undefined}
              @click=${() =>
                v.targetTemp !== undefined &&
                this._handleStep(
                  -1,
                  v.targetTemp,
                  v.step,
                  v.minTemp,
                  v.maxTemp,
                  v.dimUnavailable,
                )}
            >
              −
            </button>
            <div
              class="stepper-display"
              role="button"
              tabindex="0"
              aria-label=${this._t("target_temperature")}
              @click=${() => this._fireMoreInfo(this._config?.entity)}
              @keydown=${activateOnKey(() => this._fireMoreInfo(this._config?.entity))}
            >
              <div class="value">
                ${v.unavailable || v.targetTemp === undefined
                  ? "–"
                  : `${this._formatNumber(v.targetTemp)} ${v.tempUnit}`}
              </div>
              <div class="label">${this._t("target_temperature")}</div>
            </div>
            <button
              class="stepper-btn plus"
              ?disabled=${v.dimUnavailable || v.targetTemp === undefined}
              @click=${() =>
                v.targetTemp !== undefined &&
                this._handleStep(
                  1,
                  v.targetTemp,
                  v.step,
                  v.minTemp,
                  v.maxTemp,
                  v.dimUnavailable,
                )}
            >
              +
            </button>
          </div>
        </div>
      </ha-card>
    `;
  }

  // ---- style: ecosee --------------------------------------------------------
  // The current temperature becomes the card's one dominant figure; the
  // setpoint and the mode collapse into two outlined ovals under it, and the
  // heat/cool equipment frame is the only saturated element on the card.
  private _renderEcosee(v: ClimateView) {
    const config = this._config!;

    // Both steppers default to plain theme ink here (tiles defaults the plus
    // to the mode accent). Next to the much larger, calmer temperature figure
    // a coloured ± ring read as the loudest thing on the card;
    // `plus_active_color` still brings the colour back explicitly.
    const plusColor = config.plus_active_color
      ? this._resolveColor(config.plus_active_color)
      : "var(--primary-text-color)";
    const minusColor = config.minus_active_color
      ? this._resolveColor(config.minus_active_color)
      : "var(--primary-text-color)";

    // The setpoint pill and the mode pill share the reference card's oval
    // recipe: the mode colour as a thin outline over a faint same-colour wash,
    // never a solid fill. `resolveSetpointSurface` measures that wash against
    // the actual theme surface and hands back an ink colour that stays legible
    // on it.
    const setpoint = resolveSetpointSurface(
      this,
      v.modeColor,
      undefined,
      SETPOINT_WASH_PERCENT,
      SETPOINT_LINE_PERCENT,
    );
    const modePill = resolveSetpointSurface(
      this,
      v.modeColor,
      undefined,
      MODE_PILL_WASH_PERCENT,
      MODE_PILL_LINE_PERCENT,
    );

    // The dominant figure stays theme ink, not mode colour: the reference card
    // reserves its heat/cool language for setpoints and equipment status, so
    // the big number never turns amber just because the heating is switched on
    // — the setpoint pill and the glow say that instead.
    const heroInk = "var(--primary-text-color)";
    const showControlLabels = config.show_control_labels !== false;
    const glow = resolveActionGlow(v.attrs, v.currentMode, v.unavailable);

    return html`
      <ha-card
        style=${`--m3-mode-color: ${v.modeColor}; --m3-icon-color: ${v.iconColor}; --m3-plus-color: ${plusColor}; --m3-minus-color: ${minusColor}; --m3-icon-bg: ${tintOn(this, v.iconColor, config.icon_opacity, 8)}; --m3-plus-bg: ${this._stepperFill(plusColor, config.plus_opacity)}; --m3-minus-bg: ${this._stepperFill(minusColor, config.minus_opacity)}; --m3-setpoint-bg: ${setpoint.bg}; --m3-setpoint-ink: ${setpoint.ink}; --m3-setpoint-line: ${setpoint.line}; --m3-mode-pill-bg: ${modePill.bg}; --m3-mode-pill-ink: ${modePill.ink}; --m3-mode-pill-line: ${modePill.line}; --m3-hero-ink: ${heroInk}; border-radius: ${v.radius};`}
        class=${v.dimUnavailable ? "unavailable" : ""}
      >
        <div
          class="card-inner style-ecosee ${glassCardClass(config.glass_background)} ${v.animClass}"
          style=${`border-radius: ${v.radius}; ${v.heightStyle}`}
        >
          ${renderActionGlow(glow, config.show_action_glow)}
          ${this._renderHeader(v)}

          ${v.showSensors &&
          ((v.currentTemperature !== undefined && !v.tempInHeader) ||
            v.currentHumidity !== undefined)
            ? html`
                <div
                  class="hero ${v.currentTemperature === undefined ||
                  v.tempInHeader
                    ? "hum-only"
                    : ""}"
                >
                  ${v.currentHumidity !== undefined
                    ? html`
                        <div
                          class="hero-hum"
                          aria-label=${this._t("current_humidity")}
                        >
                          <ha-icon icon="mdi:water-outline"></ha-icon>
                          <span
                            >${v.unavailable
                              ? "–"
                              : `${this._formatNumber(v.currentHumidity, 0)} %`}</span
                          >
                        </div>
                      `
                    : nothing}
                  ${v.currentTemperature !== undefined && !v.tempInHeader
                    ? html`
                        <div
                          class="hero-temp"
                          role="button"
                          tabindex="0"
                          aria-label=${this._t("current_temperature")}
                          @click=${() => this._fireMoreInfo(this._config?.entity)}
                          @keydown=${activateOnKey(() =>
                            this._fireMoreInfo(this._config?.entity),
                          )}
                        >
                          <span class="value"
                            >${v.unavailable
                              ? "–"
                              : this._formatNumber(v.currentTemperature)}</span
                          ><span class="unit">${v.tempUnit}</span>
                        </div>
                      `
                    : nothing}
                </div>
              `
            : nothing}

          <div class="setpoint-row">
            <button
              class="stepper-btn minus"
              style=${`--m3-stepper-color: ${minusColor};`}
              ?disabled=${v.dimUnavailable || v.targetTemp === undefined}
              @click=${() =>
                v.targetTemp !== undefined &&
                this._handleStep(
                  -1,
                  v.targetTemp,
                  v.step,
                  v.minTemp,
                  v.maxTemp,
                  v.dimUnavailable,
                )}
            >
              <ha-icon icon="mdi:minus"></ha-icon>
            </button>
            <div
              class="setpoint setpoint-surface"
              role="button"
              tabindex="0"
              aria-label=${this._t("target_temperature")}
              @click=${() => this._fireMoreInfo(this._config?.entity)}
              @keydown=${activateOnKey(() => this._fireMoreInfo(this._config?.entity))}
            >
              ${v.active
                ? html`<ha-icon icon=${this._modeIcon(v.currentMode)}></ha-icon>`
                : nothing}
              <span class="value"
                >${v.unavailable || v.targetTemp === undefined
                  ? "–"
                  : `${this._formatNumber(v.targetTemp)}°`}</span
              >
            </div>
            <button
              class="stepper-btn plus"
              style=${`--m3-stepper-color: ${plusColor};`}
              ?disabled=${v.dimUnavailable || v.targetTemp === undefined}
              @click=${() =>
                v.targetTemp !== undefined &&
                this._handleStep(
                  1,
                  v.targetTemp,
                  v.step,
                  v.minTemp,
                  v.maxTemp,
                  v.dimUnavailable,
                )}
            >
              <ha-icon icon="mdi:plus"></ha-icon>
            </button>
          </div>

          <div class="control-row">
            ${v.hvacModes.length > 0
              ? html`
                  <button
                    class="mode-button setpoint-surface ${showControlLabels
                      ? ""
                      : "icon-only"}"
                    style="--m3-setpoint-bg: var(--m3-mode-pill-bg); --m3-setpoint-ink: var(--m3-mode-pill-ink); --m3-setpoint-line: var(--m3-mode-pill-line);"
                    ?disabled=${v.dimUnavailable}
                    aria-label=${v.statusText}
                    title=${v.statusText}
                    aria-haspopup=${v.hvacModes.length > 2 ? "listbox" : undefined}
                    aria-expanded=${v.hvacModes.length > 2
                      ? this._modeMenuOpen
                      : undefined}
                    @click=${(event: Event) =>
                      this._handleModeButtonClick(
                        event,
                        v.hvacModes,
                        v.currentMode,
                        v.statusText,
                        v.dimUnavailable,
                      )}
                  >
                    <ha-icon icon=${this._modeIcon(v.currentMode)}></ha-icon>
                    ${showControlLabels
                      ? html`<span>${v.statusText}</span>`
                      : nothing}
                  </button>
                `
              : nothing}
            ${v.showPresets
              ? html`
                  <button
                    class="preset-button ${v.presetStyle === "pill" ||
                    !showControlLabels
                      ? "icon-only"
                      : ""}"
                    ?disabled=${v.dimUnavailable}
                    aria-label=${this._presetPillLabel(v.attrs.preset_mode)}
                    title=${this._presetPillLabel(v.attrs.preset_mode)}
                    aria-haspopup="listbox"
                    aria-expanded=${this._presetMenuOpen}
                    @click=${(event: Event) =>
                      this._openPresetMenu(
                        event,
                        v.presetModes,
                        v.attrs.preset_mode,
                        v.dimUnavailable,
                      )}
                  >
                    ${v.presetStyle === "pill" || !showControlLabels
                      ? html`<ha-icon
                          icon=${this._presetIcon(v.attrs.preset_mode)}
                        ></ha-icon>`
                      : this._presetLabel(v.attrs.preset_mode)}
                  </button>
                `
              : nothing}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _presetLabel(currentPreset?: string): ReturnType<typeof html> {
    if (!currentPreset || currentPreset === "none") {
      return html`
        <ha-icon icon=${PRESET_ICON_FALLBACK}></ha-icon>
        <span>${this._t("select_preset")}</span>
      `;
    }
    const icon = PRESET_ICONS[currentPreset] ?? PRESET_ICON_FALLBACK;
    const label =
      currentPreset.charAt(0).toUpperCase() +
      currentPreset.slice(1).replace(/_/g, " ");
    return html`<ha-icon icon=${icon}></ha-icon>
      <span>${label}</span>`;
  }

  private _presetIcon(currentPreset?: string): string {
    if (!currentPreset || currentPreset === "none") return PRESET_ICON_FALLBACK;
    return PRESET_ICONS[currentPreset] ?? PRESET_ICON_FALLBACK;
  }

  private _presetPillLabel(currentPreset?: string): string {
    if (!currentPreset || currentPreset === "none")
      return this._t("select_preset");
    return (
      currentPreset.charAt(0).toUpperCase() +
      currentPreset.slice(1).replace(/_/g, " ")
    );
  }

  static styles = css`
    ${glassCardStyles}

    ha-card {
      border-radius: 32px;
    }

    /* .card-inner's glass/solid background and border come from
       glassCardStyles. Only the layout this card differs on is set here. */
    .card-inner {
      gap: 10px;
      border-radius: 32px;
    }

    ha-card.unavailable .mode-row,
    ha-card.unavailable .info-row,
    ha-card.unavailable .preset-chip,
    ha-card.unavailable .stepper-row {
      opacity: 0.4;
      pointer-events: none;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
    }

    .header:focus-visible {
      outline: 2px solid var(--m3-icon-active-color);
      outline-offset: 2px;
      border-radius: 8px;
    }

    .icon-container {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 17px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--m3-icon-bg);
      color: var(--m3-icon-color);
    }

    .icon-container ha-icon {
      --mdc-icon-size: 24px;
    }

    .header-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .name {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--primary-text-color);
    }

    .status {
      font-size: 13px;
      opacity: 0.7;
      color: var(--primary-text-color);
    }

    .header-chips {
      flex-shrink: 0;
      display: flex;
      gap: 6px;
    }

    .status-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
    }

    .status-chip ha-icon {
      --mdc-icon-size: 16px;
    }

    .window-chip {
      background: color-mix(
        in srgb,
        var(--m3-window-color, ${unsafeCSS(WINDOW_OPEN_COLOR)}) 16%,
        transparent
      );
      color: var(--m3-window-color, ${unsafeCSS(WINDOW_OPEN_COLOR)});
    }

    .battery-chip {
      background: color-mix(in srgb, var(--error-color, #eb5757) 16%, var(--ha-card-background, var(--card-background-color)));
      color: var(--error-color, #eb5757);
    }

    /* Mode pills */
    .mode-row {
      display: flex;
      gap: 8px;
    }

    .pill {
      flex: 1;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 26px;
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      cursor: pointer;
      padding: 0;
      transition: all 0.35s cubic-bezier(0.2, 0, 0, 1);
    }

    .pill:disabled {
      cursor: default;
    }

    .card-inner.no-animations .pill,
    .card-inner.no-animations .pill ha-icon,
    .card-inner.no-animations .stepper-btn {
      transition: none;
    }

    .card-inner.no-animations .stepper-btn:active {
      transform: none;
    }

    .pill ha-icon {
      --mdc-icon-size: 24px;
      transition: color 0.35s cubic-bezier(0.2, 0, 0, 1);
    }

    .pill.active {
      border-radius: 16px;
      background: var(--pill-color);
    }

    .pill.active ha-icon {
      color: color-mix(in srgb, var(--pill-color) 65%, black 35%);
    }

    /* Info row / sensor chips */
    .info-row {
      display: flex;
      gap: 8px;
      justify-content: center;
    }

    .sensor-chip {
      height: 36px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 14px;
      border-radius: 18px;
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 500;
    }

    .sensor-chip ha-icon {
      --mdc-icon-size: 16px;
      opacity: 0.8;
    }

    /* Preset chip */
    .preset-chip {
      height: 48px;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: none;
      border-radius: 24px;
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      padding: 0 16px;
    }

    .preset-chip ha-icon {
      --mdc-icon-size: 20px;
    }

    /* Temperature stepper */
    .stepper-row {
      display: flex;
      height: 60px;
      flex-shrink: 0;
      gap: 2px;
      margin-top: auto;
    }

    .stepper-btn {
      flex: 1;
      border: none;
      font-size: 24px;
      font-weight: 500;
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-text-color) 8%, var(--ha-card-background, var(--card-background-color)));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .stepper-btn:active {
      transform: scale(0.88);
    }

    .stepper-btn:disabled {
      cursor: default;
    }

    .stepper-btn.minus {
      border-radius: 30px 12px 12px 30px;
      background: var(--m3-minus-bg);
    }

    .stepper-btn.plus {
      border-radius: 12px 30px 30px 12px;
      background: var(--m3-plus-bg);
    }

    .stepper-display {
      flex: 1;
      min-width: 0;
      border-radius: 12px;
      background: color-mix(in srgb, var(--primary-text-color) 4%, var(--ha-card-background, var(--card-background-color)));
      display: flex;
      flex-direction: column;
      align-content: center;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0 8px;
    }

    .stepper-display:focus-visible {
      outline: 2px solid var(--m3-icon-active-color);
      outline-offset: 2px;
    }

    .stepper-display .value {
      font-size: 21px;
      font-weight: 700;
      color: var(--primary-text-color);
      line-height: 1.2;
    }

    .stepper-display .label {
      font-size: 11px;
      opacity: 0.6;
      color: var(--primary-text-color);
    }

    /* ---- style: ecosee ----------------------------------------------------
       Everything below only applies when the card is configured
       \`style: ecosee\`; the rules above are the tiles style and stay untouched.
       The three imported fragments use class names (.action-glow,
       .setpoint-surface, .hero*) that the tiles markup never renders, so they
       need no scoping of their own. */
    ${actionGlowStyles}
    ${setpointSurfaceStyles}
    ${heroTempStyles}

    /* Tighter than the 12px tiles default: the hero block brings its own
       breathing room by absorbing the card's spare height (flex: 1), so the
       remaining rows can sit closer together and read as one stack under it. */
    .card-inner.style-ecosee {
      gap: 8px;
    }

    ha-card.unavailable .style-ecosee .hero,
    ha-card.unavailable .style-ecosee .preset-button,
    ha-card.unavailable .style-ecosee .mode-button,
    ha-card.unavailable .style-ecosee .setpoint-row {
      opacity: 0.4;
      pointer-events: none;
    }

    /* Quieter header: smaller icon tile, lighter name weight — the dominant
       temperature figure below is now the card's visual anchor, so the header
       should read as a caption line, not a second competing hero. */
    .style-ecosee .header:focus-visible {
      outline-color: var(--primary-color);
    }

    .style-ecosee .icon-container {
      width: 40px;
      height: 40px;
      border-radius: 14px;
    }

    .style-ecosee .icon-container ha-icon {
      --mdc-icon-size: 20px;
    }

    .style-ecosee .name {
      font-size: 16px;
      font-weight: 600;
    }

    /* Quieter than the tiles chips: the action-glow frame is this style's
       primary status signal, so header chips stay a supporting voice rather
       than competing blocks of colour. */
    .style-ecosee .status-chip {
      background: color-mix(in srgb, var(--primary-text-color) 6%, var(--ha-card-background, var(--card-background-color)));
    }

    /* Operating mode and comfort preset share one row. They are the card's
       two "what is it set to" controls and belong at the same level; stacked
       on separate rows they read as two unrelated decisions and cost the card
       an extra band of height. */
    .style-ecosee .control-row {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      flex-shrink: 0;
    }

    /* Preset button — a neutral hairline pill. Deliberately colourless: the
       heat/cool language is reserved for the setpoint pill, the mode pill and
       the glow, so the comfort preset reads as the quiet secondary control it
       is. */
    .style-ecosee .preset-button {
      height: 38px;
      width: fit-content;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, transparent);
      border-radius: 999px;
      background: transparent;
      color: var(--primary-text-color);
      opacity: 0.75;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.01em;
      cursor: pointer;
      padding: 0 14px;
    }

    .style-ecosee .preset-button:disabled {
      cursor: default;
    }

    .style-ecosee .preset-button ha-icon {
      --mdc-icon-size: 18px;
    }

    /* Icon-only: square the padding off so the pill becomes a circle rather
       than a stubby capsule with a glyph rattling around inside it. */
    .style-ecosee .preset-button.icon-only,
    .style-ecosee .mode-button.icon-only {
      min-width: 0;
      width: 38px;
      padding: 0;
      border-radius: 50%;
    }

    /* Setpoint row — the card's control line: the target temperature as a
       mode-coloured oval (outline + faint wash, the reference card's
       language) flanked by two deliberately unfilled ± affordances. The oval
       is the only filled shape here, so the eye lands on the value rather
       than on the buttons. */
    .style-ecosee .setpoint-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      flex-shrink: 0;
      padding: 2px 0;
    }

    /* Bare glyphs, no ring and no ground — unlike the tiles style's filled
       circles. A control that carries no value and no state only gave the eye
       two more shapes to land on before it reached the number between them.
       The 40px box stays for the tap target; it just isn't painted. */
    .style-ecosee .stepper-btn {
      flex: 0 0 auto;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      padding: 0;
      line-height: 1;
      font-size: inherit;
      /* Dimmed on the ink, not with opacity: opacity would also wash out a
         background someone deliberately configured via plus_opacity. */
      color: color-mix(
        in srgb,
        var(--m3-stepper-color, var(--primary-text-color)) 72%,
        transparent
      );
      background: var(--m3-minus-bg);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition:
        color 0.2s ease,
        transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .style-ecosee .stepper-btn ha-icon {
      --mdc-icon-size: 22px;
    }

    .style-ecosee .stepper-btn:hover {
      color: var(--m3-stepper-color, var(--primary-text-color));
    }

    .style-ecosee .stepper-btn.plus {
      background: var(--m3-plus-bg);
    }

    .style-ecosee .stepper-btn:active {
      transform: scale(0.88);
    }

    .style-ecosee .stepper-btn:disabled {
      cursor: default;
      opacity: 0.35;
    }

    .card-inner.style-ecosee.no-animations .stepper-btn {
      transition: none;
    }

    .card-inner.style-ecosee.no-animations .stepper-btn:active {
      transform: none;
    }

    /* The setpoint oval. Colour/outline/ink come from .setpoint-surface
       (shared/climate-surface.ts); only its shape and type live here. It is
       a stadium rather than the tiles style's square tile because the current
       temperature above is now the dominant figure — a second big block would
       compete with it. */
    .style-ecosee .setpoint {
      flex: 0 0 auto;
      min-width: 104px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 16px;
      border-radius: 999px;
      cursor: pointer;
    }

    .style-ecosee .setpoint:focus-visible {
      outline: 2px solid var(--m3-setpoint-line, var(--primary-color));
      outline-offset: 3px;
    }

    .style-ecosee .setpoint ha-icon {
      --mdc-icon-size: 17px;
      flex-shrink: 0;
      opacity: 0.85;
    }

    .style-ecosee .setpoint .value {
      /* Tabular figures: the ± buttons change this value in place, and
         proportional digits make the pill jump width on every press. (The
         hero figure above uses proportional lining figures instead — it
         changes rarely and the narrow "1" is part of the look.) */
      font-size: 21px;
      font-weight: 500;
      letter-spacing: -0.01em;
      line-height: 1;
      white-space: nowrap;
    }

    /* Mode button — the current HVAC mode, in place of the tiles style's row
       of one pill per mode. Opens the shared dropdown when there is a real
       choice (more than two modes); with exactly two, tapping flips straight
       to the other one.

       It wears the same outline-and-wash language as the setpoint oval, at a
       lighter wash (MODE_PILL_WASH_PERCENT) and a smaller size, so it never
       outshouts the action-glow frame that reports whether the thermostat is
       *actually* running. Colour still tracks mode_colors. */
    .style-ecosee .mode-button {
      height: 38px;
      width: fit-content;
      /* No min-width: it shares a row with the preset button, and a 132px
         floor pushed the pair to wrap on a narrow column. */
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-width: ${unsafeCSS(MODE_PILL_BORDER_PX)}px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      padding: 0 18px;
    }

    .style-ecosee .mode-button:disabled {
      cursor: default;
    }

    .style-ecosee .mode-button ha-icon {
      --mdc-icon-size: 18px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-climate-card": M3ClimateCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-climate-card",
  name: "M3 Climate Card",
  description:
    "Eine Material-3-inspirierte Klimakarte für climate-Entities (Klimaanlagen & Heizungsthermostate).",
  preview: true,
  documentationURL:
    "https://github.com/j0sp0r/m3-cards",
});
