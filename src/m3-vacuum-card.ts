import { LitElement, html, css, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HaActionConfig,
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  M3VacuumCardConfig,
  VacuumBlock,
  VacuumSecondaryAction,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_VACUUM_ICON,
  DEFAULT_VACUUM_RADIUS,
  VACUUM_CHIP_GAP,
  VACUUM_CHIP_HEIGHT,
  VACUUM_CHIP_RADIUS,
  VACUUM_MAP_CHIP_RADIUS,
  VACUUM_MAP_HEIGHT,
  VACUUM_MAP_MAX_ZOOM,
  VACUUM_MAP_RADIUS,
  VACUUM_MAX_CHIPS,
  VACUUM_BATTERY_HEIGHT,
  VACUUM_BATTERY_LOW,
  VACUUM_BATTERY_OK,
  VACUUM_BATTERY_RADIUS,
  VACUUM_ICON_TINT,
  VACUUM_OPTIMISTIC_MS,
  VACUUM_PENDING_OPACITY,
  VACUUM_PRIMARY_HEIGHT,
  VACUUM_PRIMARY_RADIUS,
  VACUUM_PRIMARY_RADIUS_PAUSED,
  VACUUM_ROOM_HEIGHT,
  VACUUM_ROOM_RADIUS,
  VACUUM_ROOM_RADIUS_ACTIVE,
  VACUUM_SECONDARY_RADIUS,
  VACUUM_SECONDARY_TINT,
  VACUUM_SECONDARY_WIDTH,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { formatNumber } from "./shared/formatting";
import { PanZoom, type PanZoomState, PAN_ZOOM_IDENTITY } from "./shared/pan-zoom";
import { acknowledgeReminder, reminderStates } from "./shared/vacuum-reminders";
import { stopSwipe } from "./shared/swipe";
import { activateOnKey } from "./shared/a11y";
import { STANDARD_EASING } from "./shared/animation";
import {
  renderLevelSlider,
  levelSliderStyles,
  type LevelStep,
} from "./shared/level-slider";
import { foldHides, readCollapsed, writeCollapsed, type CollapseTarget } from "./shared/collapse-state";
import { foldArrowStyles, renderFoldArrow } from "./shared/fold-arrow";
// The scroll-fade controller for these rows arrives with PR #15; until it
// lands the row scrolls without the edge hint, which is what the standalone
// chip-buttons card did before that PR too.
import { chipButtonsStyles, renderChipButtons } from "./shared/chip-buttons";
import { DetailCardController } from "./shared/detail-card";
import {
  popupCardStyles,
  renderPopupDialog,
  shouldCloseOnBackdropClick,
  syncDialogOpenState,
  type PopupCardHandle,
} from "./shared/popup-card";
import { runHaAction, isActionable } from "./shared/actions";
import { TapHoldGesture } from "./shared/gestures";
import { findStateRule } from "./shared/state-rules";
import { glassCardClass, glassCardStyles, renderMissingEntity } from "./shared/glass-card";
import { cardHeaderStyles, renderCardHeader } from "./shared/card-header";
import { resolveCommonColors, resolveThemeColor, tintOn, inkOn } from "./shared/color-config";
import { hassChangeMatters } from "./shared/should-update";
import { TemplatedCard } from "./shared/templated-card";
import {
  OptimisticActivity,
  activityColor,
  activityIcon,
  discoverVacuum,
  fanSpeedKey,
  optimisticActivity,
  primaryIntent,
  supportsFeature,
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
  @state() private _fanPressed = false;
  /**
   * What the card last asked for, shown until the 30-second poll catches up.
   * Without it a drag snaps back to the old value a moment after releasing.
   */
  @state() private _fanOptimistic?: string;
  @state() private _selectOptimistic: Record<string, string> = {};
  @state() private _pressedSelect?: string;
  @state() private _folded = false;
  /** Areas picked for the next run. Cleared once it is sent. */
  @state() private _selectedRooms: string[] = [];
  @state() private _pressedChip?: string;
  @state() private _popupOpen = false;
  @state() private _popupCardEl?: HTMLElement & PopupCardHandle;
  private _popupOpenedAt = 0;
  private readonly _popupCard = new DetailCardController();
  @state() private _mapView: PanZoomState = { ...PAN_ZOOM_IDENTITY };
  private _mapPanZoom = new PanZoom({
    max: VACUUM_MAP_MAX_ZOOM,
    onChange: (view) => {
      this._mapView = view;
    },
    onGestureEnd: (moved) => {
      // A tap that ended a pan is not a tap. Without this, letting go after
      // dragging the map would also open more-info.
      if (!moved) this._mapTapped();
    },
  });
  private _chipGestures = new TapHoldGesture();
  private _selectTimers: Record<string, number> = {};
  /** The speed to return to when "mop only" is switched back off. */
  private _lastRealSpeed?: string;

  private _optimistic = new OptimisticActivity(VACUUM_OPTIMISTIC_MS, () => {
    this._tick++;
  });
  private _discovered?: DiscoveredVacuum;
  private _discoveredFor?: string;
  private _fanSettle?: number;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-vacuum-card-editor");
    return document.createElement("m3-vacuum-card-editor") as unknown as LovelaceCardEditor;
  }

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
    this._folded = config.collapsible ? readCollapsed(this.hass, this._foldTarget) : false;
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
    this._popupCard.reset();
    if (this._fanSettle) clearTimeout(this._fanSettle);
    for (const t of Object.values(this._selectTimers)) clearTimeout(t);
    this._selectTimers = {};
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, this._watched());
  }

  /** Every entity the card reads, in one place, for `shouldUpdate`. */
  private _watched(): (string | undefined)[] {
    const d = this._entities();
    return [this._config?.entity, d?.progress, d?.area, d?.time, d?.status];
  }

  private get _foldTarget(): CollapseTarget {
    return {
      entity: this._config?.collapse_state_entity,
      // Keyed on the vacuum, so two cards for the same robot on one view share
      // a fold — which is what someone expects when they collapse one.
      storageKey: `m3-vacuum-folded:${location.pathname}:${this._config?.entity ?? ""}`,
      defaultCollapsed: this._config?.default_collapsed,
      memory: this._config?.collapse_memory,
    };
  }

  private _toggleFold = (e: Event): void => {
    e.stopPropagation();
    this._folded = !this._folded;
    writeCollapsed(this.hass, this._foldTarget, this._folded);
  };

  protected updated(): void {
    this._maybeSyncPopupCard();
    if (this._popupCardEl && this.hass) this._popupCardEl.hass = this.hass;
    if (this._popupOpen !== undefined) {
      const dialog = this.renderRoot?.querySelector("dialog") as HTMLDialogElement | null;
      syncDialogOpenState(dialog, this._popupOpen);
    }
    if (!this._config?.collapsible) return;
    // An entity-backed fold can be changed from another dashboard or by an
    // automation, so it is re-read rather than only written on a tap.
    const wanted = readCollapsed(this.hass, this._foldTarget);
    if (wanted !== this._folded) this._folded = wanted;
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

  /**
   * Sets the speed and shows it at once. The poll is 30 seconds away, and a
   * slider that springs back to where it was is worse than no slider.
   */
  private _setFanSpeed(speed: string): void {
    this._fanOptimistic = speed;
    if (this._fanSettle) clearTimeout(this._fanSettle);
    for (const t of Object.values(this._selectTimers)) clearTimeout(t);
    this._selectTimers = {};
    this._fanSettle = setTimeout(() => {
      this._fanOptimistic = undefined;
      this._fanSettle = undefined;
    }, VACUUM_OPTIMISTIC_MS) as unknown as number;
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
    // A configured rule wins over everything, including the status sensor:
    // it is the only way a brand this card has never seen gets a line a
    // person can read, and the only way to override one it got wrong.
    const rule = this._stateRule();
    if (rule?.label && !pending) return rule.label;

    if (pending) {
      // Mid-command the status sensor still describes the old state, so the
      // generic label is the honest one to show.
      return this._t(`vacuum_${activity}` as TranslationKey);
    }
    const statusEntity = this._entity("status_entity", "status");
    const statusRaw = statusEntity ? this.hass?.states[statusEntity]?.state : undefined;
    if (statusRaw && statusRaw !== "unknown" && statusRaw !== "unavailable") {
      const localised = this.hass?.formatEntityState?.(this.hass.states[statusEntity!]);
      if (localised) return localised;
    }
    return this._t(`vacuum_${activity}` as TranslationKey);
  }

  private _stateRule() {
    const raw = this.hass?.states[this._config!.entity]?.state ?? "";
    return findStateRule(this._config?.states, raw, undefined);
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
    const ruleColor = this._stateRule()?.color;
    const accent = this._config.accent_color
      ? resolveThemeColor(this._config.accent_color)
      : ruleColor
        ? resolveThemeColor(ruleColor)
        : activityColor(activity);
    const radius = `${this._config.radius ?? DEFAULT_VACUUM_RADIUS}px`;
    // The state, the battery and Start/Pause never fold: they are what the
    // card is for at a glance. Of what is below them, the fold hides whatever
    // `collapse_blocks` names — and everything, when it names nothing.
    const folded = !!this._config.collapsible && this._folded;
    const foldable = this._config.collapse_blocks;
    const hidden = (block: VacuumBlock): boolean => foldHides(block, folded, foldable);

    return html`
      <ha-card
        class=${unavailable ? "unavailable" : activity === "error" ? "errored" : ""}
        style=${(() => {
          const iconBg = tintOn(this, accent, this._config!.accent_opacity, VACUUM_ICON_TINT);
          // The shared header reads --m3p-icon-*, so the state colour is
          // handed over in the suite's own variables rather than in ours.
          return (
            `--m3v-accent: ${accent}; --m3v-icon-bg: ${iconBg}; ` +
            `--m3p-icon-bg: ${iconBg}; --m3p-icon-color: ${accent}; ` +
            `--m3v-ink: ${inkOn(accent, this)}; border-radius: ${radius};`
          );
        })()}
      >
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)}"
          style=${`border-radius: ${radius};${
            colors.cardBackgroundCss ? ` background: ${colors.cardBackgroundCss};` : ""
          }`}
        >
          ${this._renderHeader(activity, pending)}
          ${this._renderPrimaryRow(activity, pending)}
          ${hidden("map") ? nothing : this._renderMap()}
          ${hidden("rooms") ? nothing : this._renderRooms(unavailable)}
          ${hidden("fan_speed")
            ? nothing
            : this._renderFanSpeed(
                state.attributes.fan_speed_list as string[] | undefined,
                state.attributes.fan_speed as string | undefined,
                unavailable,
              )}
          ${hidden("mop")
            ? nothing
            : html`
                ${this._renderSelectScale(
                  "mop_intensity_entity",
                  "mopIntensity",
                  "vacuum_mop_intensity",
                  "vacuum_mop_",
                  this._config.show_mop_intensity,
                  unavailable,
                )}
                ${this._renderSelectScale(
                  "mop_mode_entity",
                  "mopMode",
                  "vacuum_mop_mode",
                  "vacuum_route_",
                  this._config.show_mop_mode ?? false,
                  unavailable,
                )}
              `}
          ${hidden("buttons") ? nothing : this._renderButtons(unavailable)}
          ${hidden("chips") ? nothing : this._renderChips()}
          ${this._config.card_version
            ? html`<div class="version">${CARD_VERSION}</div>`
            : nothing}
        </div>
      </ha-card>
      ${this._renderPopup()}
    `;
  }

  /**
   * The suite's own header, not a private one.
   *
   * Seventeen other cards draw this shape through `renderCardHeader`, and a
   * vacuum has no reason to be the eighteenth with its own 46px swatch two
   * pixels off everyone else's. The state colour arrives through the same
   * `--m3p-icon-*` variables every other card sets, and the battery chip and
   * the fold arrow go in its trailing slot.
   */
  private _renderHeader(activity: VacuumActivity, pending: boolean) {
    const cfg = this._config!;
    const state = this.hass!.states[cfg.entity];
    const name = cfg.name ?? state.attributes.friendly_name ?? cfg.entity;
    const { level, charging } = this._battery();

    const trailing = html`
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
      ${cfg.collapsible
        ? renderFoldArrow({
            folded: this._folded,
            accent: "var(--m3v-accent)",
            host: this,
            label: name,
            onToggle: this._toggleFold,
          })
        : nothing}
    `;

    return renderCardHeader({
      icon: cfg.icon ?? this._stateRule()?.icon ?? activityIcon(activity) ?? DEFAULT_VACUUM_ICON,
      name,
      subtitle: this._statusText(activity, pending),
      onClick: () => this._headerTap(),
      right: trailing,
    });
  }

  private _renderPrimaryRow(activity: VacuumActivity, pending: boolean) {
    const cfg = this._config!;
    const unavailable = activity === "unavailable";
    const supported = this.hass!.states[cfg.entity]?.attributes?.supported_features as
      | number
      | undefined;
    const intent = primaryIntent(activity, supported);
    const roomCount = this._selectedRooms.length;
    if (roomCount > 0) {
      const roomLabel =
        roomCount === 1
          ? this._t("vacuum_clean_one_room")
          : this._t("vacuum_clean_rooms").replace("{n}", String(roomCount));
      return html`
        <div class="primary-row">
          <button
            class="primary"
            style=${`border-radius: ${VACUUM_PRIMARY_RADIUS}px;`}
            ?disabled=${unavailable}
            @click=${() => this._cleanRooms()}
          >
            <ha-icon icon="mdi:play"></ha-icon>
            <span>${roomLabel}</span>
          </button>
          <button
            class="secondary"
            aria-label=${this._t("vacuum_rooms_none")}
            title=${this._t("vacuum_rooms_none")}
            @click=${() => {
              this._selectedRooms = [];
            }}
          >
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
      `;
    }

    const label =
      intent === "pause"
        ? this._t("vacuum_pause")
        : intent === "stop"
          ? this._t("vacuum_stop")
          : intent === "resume"
            ? this._t("vacuum_resume")
            : this._t("vacuum_start");
    const icon =
      intent === "pause" ? "mdi:pause" : intent === "stop" ? "mdi:stop" : "mdi:play";

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
            else if (intent === "stop") this._command("stop");
            else if (intent === "resume") this._command("resume");
            else this._command("start");
          }}
        >
          <ha-icon icon=${icon}></ha-icon>
          <span>${label}</span>
        </button>
        ${(secondary as readonly VacuumSecondaryAction[])
          .filter((action) => this._secondarySupported(action, supported))
          .slice(0, 2)
          .map((action) => this._renderSecondary(action, unavailable))}
      </div>
    `;
  }

  /** A control the entity has not declared is not drawn at all — a dead
   *  button is worse than a missing one. */
  private _secondarySupported(action: VacuumSecondaryAction, supported?: number): boolean {
    switch (action) {
      case "return_to_base":
        return supportsFeature(supported, "RETURN_HOME");
      case "locate":
        return supportsFeature(supported, "LOCATE");
      case "stop":
        return supportsFeature(supported, "STOP");
      default:
        return true;
    }
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

  /**
   * Suction, as an ordered scale rather than a row of buttons.
   *
   * `off` and `custom` are deliberately not on it. `off` is not a quieter
   * setting, it is "do not vacuum at all" — a different decision, so it gets
   * its own leading toggle. `custom` is defined in the Roborock app and has no
   * place between two steps; it is shown when it is what the vacuum is doing
   * and dragging simply leaves it.
   */
  private _renderFanSpeed(
    list: string[] | undefined,
    current: string | undefined,
    unavailable: boolean,
  ) {
    if (this._config?.show_fan_speed === false) return nothing;
    const supported = this.hass?.states[this._config!.entity]?.attributes?.supported_features as
      | number
      | undefined;
    if (!supportsFeature(supported, "FAN_SPEED")) return nothing;
    if (!list || list.length < 2) return nothing;

    const scale = list.filter((s) => s !== "off" && s !== "custom");
    if (scale.length < 2) return nothing;

    const shown = this._fanOptimistic ?? current;
    if (shown && shown !== "off" && shown !== "custom") this._lastRealSpeed = shown;

    const steps: LevelStep[] = scale.map((speed) => {
      const key = fanSpeedKey(speed);
      return { value: speed, label: key ? this._t(`vacuum_fan_${key}` as TranslationKey) : speed };
    });

    const hasOff = list.includes("off");
    const isOff = shown === "off";

    return html`
      <div class="fan-row">
        ${hasOff
          ? html`
              <button
                class="mop-only ${isOff ? "active" : ""}"
                ?disabled=${unavailable}
                aria-pressed=${isOff ? "true" : "false"}
                aria-label=${this._t("vacuum_fan_off")}
                title=${this._t("vacuum_fan_off")}
                @click=${() =>
                  this._setFanSpeed(isOff ? (this._lastRealSpeed ?? scale[0]) : "off")}
              >
                <ha-icon icon=${isOff ? "mdi:fan-off" : "mdi:fan"}></ha-icon>
              </button>
            `
          : nothing}
        <div class="fan-slider">
          ${renderLevelSlider({
            steps,
            current: isOff ? undefined : shown,
            label: this._t("vacuum_fan_speed"),
            offScaleLabel: isOff
              ? this._t("vacuum_fan_off")
              : shown === "custom"
                ? this._t("vacuum_fan_custom")
                : undefined,
            disabled: unavailable,
            pressed: this._fanPressed,
            setPressed: (p) => {
              this._fanPressed = p;
            },
            onChange: (value) => this._setFanSpeed(value),
          })}
        </div>
      </div>
    `;
  }

  // ---- map ------------------------------------------------------------------

  /**
   * The live map.
   *
   * No refresh timer, deliberately. An `image` entity's *state* is the
   * timestamp of the picture behind it, so keying the URL on that state makes
   * the browser refetch exactly when there is something new and never
   * otherwise — which beats the 30-second poll the integration does anyway,
   * and costs nothing while the card is off screen.
   */
  private _renderMap() {
    if (this._config?.show_map === false) return nothing;
    const entityId = this._entity("map_entity", "map");
    if (!entityId) return nothing;
    const state = this.hass?.states[entityId];
    const picture = state?.attributes.entity_picture as string | undefined;
    if (!picture) return nothing;

    const area = this._numeric(this._entity("area_entity", "area"));
    const minutes = this._numeric(this._entity("time_entity", "time"));
    const parts: string[] = [];
    if (area !== undefined && area > 0) parts.push(`${formatNumber(this._language, area, { maximumFractionDigits: 1 })} m²`);
    if (minutes !== undefined && minutes >= 1) {
      parts.push(`${formatNumber(this._language, minutes, { maximumFractionDigits: 0 })} min`);
    }

    const zoomable = this._config?.map_zoom !== false;
    const view = this._mapView;

    return html`
      <div
        class="map ${zoomable ? "zoomable" : ""} ${view.scale > 1.001 ? "zoomed" : ""}"
        style=${`--m3v-map-height: ${this._config?.map_height ?? VACUUM_MAP_HEIGHT}px;`}
        role="button"
        tabindex="0"
        aria-label=${this._t("vacuum_map")}
        @keydown=${activateOnKey(() => this._fireMoreInfo(entityId))}
        @click=${zoomable ? nothing : () => this._fireMoreInfo(entityId)}
        @dblclick=${zoomable ? () => this._mapPanZoom.toggle() : nothing}
        @pointerdown=${zoomable ? this._mapPanZoom.onPointerDown : nothing}
        @pointermove=${zoomable ? this._mapPanZoom.onPointerMove : nothing}
        @pointerup=${zoomable ? this._mapPanZoom.onPointerUp : nothing}
        @pointercancel=${zoomable ? this._mapPanZoom.onPointerUp : nothing}
        @wheel=${zoomable ? this._mapPanZoom.onWheel : nothing}
        @touchstart=${zoomable ? stopSwipe : nothing}
        @touchmove=${zoomable ? stopSwipe : nothing}
        @touchend=${zoomable ? stopSwipe : nothing}
        @mousedown=${zoomable ? stopSwipe : nothing}
        @mousemove=${zoomable ? stopSwipe : nothing}
        @mouseup=${zoomable ? stopSwipe : nothing}
      >
        <img
          style=${`transform: translate(${view.x}px, ${view.y}px) scale(${view.scale});`}
          src=${`${picture}${picture.includes("?") ? "&" : "?"}s=${state!.state}`}
          alt=""
        />
        ${parts.length
          ? html`<div class="map-chip">${parts.join(" · ")}</div>`
          : nothing}
        ${view.scale > 1.001
          ? html`
              <button
                class="map-reset"
                aria-label=${this._t("vacuum_map")}
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this._mapPanZoom.reset();
                }}
              >
                <ha-icon icon="mdi:magnify-minus-outline"></ha-icon>
              </button>
            `
          : nothing}
      </div>
    `;
  }

  /** The map's own tap, once a gesture has been ruled out. */
  private _mapTapped(): void {
    this._fireMoreInfo(this._entity("map_entity", "map"));
  }

  private _numeric(entityId: string | undefined): number | undefined {
    if (!entityId) return undefined;
    const value = parseFloat(this.hass?.states[entityId]?.state ?? "");
    return isNaN(value) ? undefined : value;
  }

  // ---- rooms ------------------------------------------------------------------

  /**
   * The areas the vacuum can be sent to.
   *
   * Configured rather than discovered, and that is not laziness: the mapping
   * from a map's segments onto Home Assistant areas lives inside the
   * integration and is not readable from a card, so offering every area in the
   * house would put "Garden" and "Terrace" next to "Kitchen" with no way to
   * tell which of them the robot can reach. `vacuum.clean_area` takes area ids
   * directly, so the list is exactly what the editor's area picker produces.
   */
  private _renderRooms(unavailable: boolean) {
    if (this._config?.show_rooms === false) return nothing;
    const rooms = this._config?.rooms;
    if (!rooms?.length || !this.hass) return nothing;
    const supported = this.hass.states[this._config!.entity]?.attributes?.supported_features as
      | number
      | undefined;
    if (!supportsFeature(supported, "CLEAN_AREA")) return nothing;

    // `hass.areas` is typed as an opaque record — the frontend's own registry
    // entry carries more than this card needs, so only the name is read out.
    const areas = (this.hass.areas ?? {}) as Record<string, { name?: string }>;
    const known = rooms.filter((id) => areas[id]);
    if (!known.length) return nothing;

    return html`
      <div class="rooms">
        ${known.map((id) => {
          const chosen = this._selectedRooms.includes(id);
          return html`
            <button
              class="room ${chosen ? "chosen" : ""}"
              ?disabled=${unavailable}
              aria-pressed=${chosen ? "true" : "false"}
              @click=${() => this._toggleRoom(id)}
            >
              ${areas[id].name ?? id}
            </button>
          `;
        })}
      </div>
    `;
  }

  private _toggleRoom(areaId: string): void {
    this._selectedRooms = this._selectedRooms.includes(areaId)
      ? this._selectedRooms.filter((id) => id !== areaId)
      : [...this._selectedRooms, areaId];
  }

  /**
   * Sends the picked areas. The order they were tapped in is the order that
   * goes out — the service takes a reorderable list, so it is treated as
   * meaningful rather than sorted behind the user's back.
   */
  private _cleanRooms(): void {
    if (!this._selectedRooms.length) return;
    this._optimistic.set(optimisticActivity("start", this._activity().activity));
    this.hass?.callService("vacuum", "clean_area", {
      entity_id: this._config!.entity,
      cleaning_area_id: [...this._selectedRooms],
    });
    this._selectedRooms = [];
  }

  // ---- select-backed scales ---------------------------------------------------

  /**
   * A `select` entity drawn as the same Expressive scale as suction.
   *
   * Mop intensity and mop route are both ordered lists, which is what the
   * slider is for. `custom` is the one option that is not on the scale — it is
   * whatever was configured in the vendor's app — so it is shown when active
   * and skipped when choosing.
   */
  private _renderSelectScale(
    override: keyof M3VacuumCardConfig,
    found: keyof DiscoveredVacuum,
    labelKey: TranslationKey,
    prefix: string,
    show: boolean | undefined,
    unavailable: boolean,
  ) {
    if (show === false) return nothing;
    const entityId = this._entity(override, found);
    if (!entityId) return nothing;
    const state = this.hass?.states[entityId];
    const options = state?.attributes.options as string[] | undefined;
    if (!options || options.length < 2) return nothing;

    const scale = options.filter((o) => o !== "custom" && o !== "unknown");
    if (scale.length < 2) return nothing;
    const current = this._selectOptimistic[entityId] ?? state!.state;
    const label = (value: string) => {
      const key = `${prefix}${value}` as TranslationKey;
      const text = this._t(key);
      // localize() hands back the key itself when it has no translation, which
      // is the signal to show the integration's own word instead.
      return text === key ? value : text;
    };

    return html`
      <div class="scale-row">
        ${renderLevelSlider({
          steps: scale.map((value) => ({ value, label: label(value) })),
          current: scale.includes(current) ? current : undefined,
          label: this._t(labelKey),
          offScaleLabel: label(current),
          disabled: unavailable,
          pressed: this._pressedSelect === entityId,
          setPressed: (p) => {
            this._pressedSelect = p ? entityId : undefined;
          },
          onChange: (value) => this._selectOption(entityId, value),
        })}
      </div>
    `;
  }

  private _selectOption(entityId: string, option: string): void {
    this._selectOptimistic = { ...this._selectOptimistic, [entityId]: option };
    const timers = this._selectTimers;
    if (timers[entityId]) clearTimeout(timers[entityId]);
    timers[entityId] = setTimeout(() => {
      const next = { ...this._selectOptimistic };
      delete next[entityId];
      this._selectOptimistic = next;
      delete this._selectTimers[entityId];
    }, VACUUM_OPTIMISTIC_MS) as unknown as number;
    this.hass?.callService("select", "select_option", { entity_id: entityId, option });
  }

  // ---- free buttons -----------------------------------------------------------

  /**
   * Buttons the config names, for whatever the integration exposes that this
   * card cannot know about — app routines, a script, a scene.
   *
   * These are the suite's chip buttons, not a private copy: they arrive with
   * the theme's own state colours, hold and double-tap actions, the scrolling
   * row with its edge fades, and the swipe shield. A vacuum from another brand
   * is then a config change rather than a code one.
   */
  private _renderButtons(unavailable: boolean) {
    const buttons = this._config?.buttons;
    if (!buttons?.length || !this.hass) return nothing;
    return html`
      <div class="free-buttons ${unavailable ? "dimmed" : ""}">
        ${renderChipButtons(
          this,
          this.hass,
          {
            buttons,
            wrap: this._config?.buttons_wrap ?? true,
            stretch: this._config?.buttons_stretch,
            justify: this._config?.buttons_justify,
          },
          {
            pressedKey: this._pressedChip,
            gestures: this._chipGestures,
            onPressChange: (key) => {
              this._pressedChip = key;
            },
          },
        )}
      </div>
    `;
  }

  // ---- popup ------------------------------------------------------------------

  private _openPopup(): void {
    if (!this._config?.popup) {
      this._fireMoreInfo(this._config?.entity);
      return;
    }
    this._popupOpenedAt = Date.now();
    this._popupOpen = true;
  }

  private _closePopup(): void {
    this._popupOpen = false;
    this._popupCardEl = undefined;
    this._popupCard.reset();
  }

  // createCardElement() is async, so the build runs from updated() and
  // render() stays synchronous.
  private _maybeSyncPopupCard(): void {
    const popup = this._config?.popup;
    if (!this._popupOpen || !popup || !this.hass) {
      this._popupCard.reset();
      return;
    }
    this._popupCard.sync({
      skeleton: popup.content,
      tokens: { entity_id: this._config?.entity, name: this._config?.name },
      hass: this.hass,
      onChange: (el) => {
        this._popupCardEl = el;
      },
    });
  }

  private _renderPopup() {
    const popup = this._config?.popup;
    if (!this._popupOpen || !popup) return nothing;
    const name =
      this._config?.name ??
      this.hass?.states[this._config!.entity]?.attributes.friendly_name ??
      this._config!.entity;
    return renderPopupDialog({
      content: this._popupCardEl,
      title: popup.title ?? name,
      size: popup.size,
      onClose: () => this._closePopup(),
      onBackdropClick: (e) => {
        if (shouldCloseOnBackdropClick(e, this._popupOpenedAt)) this._closePopup();
      },
      closeLabel: this._t("dialog_close"),
    });
  }

  /**
   * The header's tap. A configured popup takes it, so the common case needs
   * no `tap_action`; an explicit one still wins, and more-info stays the
   * fallback it has always been.
   */
  private _headerTap(): void {
    const action =
      this._config?.tap_action ??
      (this._config?.popup ? ({ action: "popup" } as HaActionConfig) : undefined);
    if (!action) {
      this._fireMoreInfo(this._config?.entity);
      return;
    }
    if (!isActionable(action) || !this.hass) return;
    runHaAction(this.hass, action, {
      entityId: this._config!.entity,
      openPopup: () => this._openPopup(),
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

  // ---- station chips ----------------------------------------------------------

  /**
   * Only what is worth saying. A full clean-water tank and an attached mop are
   * the normal case and say nothing; an empty tank, a full waste tank or a
   * dock error are what the row exists for.
   *
   * Errors are never collapsed into the "+n" overflow — they are the reason
   * someone looks at the card at all.
   */
  private _renderChips() {
    if (this._config?.show_station_chips === false) return nothing;
    const d = this._entities();
    if (!d) return nothing;

    type Chip = {
      icon: string;
      text: string;
      tone: "error" | "warn" | "plain";
      /** Present only when tapping it does something — ticking a reminder off. */
      onTap?: () => void;
    };
    const chips: Chip[] = [];
    const on = (id: string | undefined) =>
      id ? this.hass?.states[id]?.state === "on" : false;

    // Errors first, and always shown.
    const dockError = this._enumState(d.dockError);
    if (dockError) {
      chips.push({
        icon: "mdi:home-alert-outline",
        text: `${this._t("vacuum_dock_error")}: ${dockError}`,
        tone: "error",
      });
    }
    const vacError = this._enumState(d.vacuumError);
    if (vacError) {
      chips.push({
        icon: "mdi:alert-circle-outline",
        text: `${this._t("vacuum_vacuum_error")}: ${vacError}`,
        tone: "error",
      });
    }

    // Only the due ones, and never collapsed away: a reminder that is not due
    // is not news, and one that is competes with an error for attention only
    // when there is genuinely something to do.
    const reminders = reminderStates(this.hass, this._config?.reminders, {
      runs: d.totals.total_count,
      hours: d.totals.total_time,
    }).filter((r) => r.due);
    for (const reminder of reminders) {
      chips.push({
        icon: reminder.config.icon ?? "mdi:calendar-refresh-outline",
        text: reminder.config.name,
        tone: "warn",
        onTap: reminder.acknowledgeable ? () => acknowledgeReminder(this.hass, reminder) : undefined,
      });
    }

    if (on(d.binary.clean_water_box)) {
      // The sensor is `clean_box_empty` — "on" is the bad news, not the good.
      chips.push({
        icon: "mdi:water-alert-outline",
        text: this._t("vacuum_chip_clean_water_empty"),
        tone: "warn",
      });
    }
    if (on(d.binary.dirty_water_box)) {
      chips.push({
        icon: "mdi:delete-alert-outline",
        text: this._t("vacuum_chip_dirty_water_full"),
        tone: "warn",
      });
    }
    if (on(d.binary.water_shortage)) {
      chips.push({
        icon: "mdi:water-off-outline",
        text: this._t("vacuum_chip_water_shortage"),
        tone: "warn",
      });
    }
    if (on(d.binary.mop_drying)) {
      chips.push({
        icon: "mdi:weather-windy",
        text: this._t("vacuum_chip_mop_drying"),
        tone: "plain",
      });
    }
    if (on(d.binary.mop_attached)) {
      chips.push({
        icon: "mdi:square-rounded-outline",
        text: this._t("vacuum_chip_mop_attached"),
        tone: "plain",
      });
    }

    if (!chips.length) return nothing;
    const max = this._config?.max_chips ?? VACUUM_MAX_CHIPS;
    // Errors and due reminders are both "something needs doing", so neither is
    // pushed into the overflow to make room for a chip saying the mop is on.
    const urgent = chips.filter((c) => c.tone === "error" || !!c.onTap || reminders.some((r) => r.config.name === c.text));
    const rest = chips.filter((c) => !urgent.includes(c));
    const shown = [...urgent, ...rest].slice(0, Math.max(urgent.length, max));
    const hidden = chips.length - shown.length;

    return html`
      <div class="chips">
        ${shown.map(
          (c) =>
            c.onTap
              ? html`
                  <button class="chip ${c.tone} tappable" @click=${c.onTap}>
                    <ha-icon icon=${c.icon}></ha-icon>
                    <span>${c.text}</span>
                    <ha-icon class="chip-check" icon="mdi:check"></ha-icon>
                  </button>
                `
              : html`
                  <span class="chip ${c.tone}">
                    <ha-icon icon=${c.icon}></ha-icon>
                    <span>${c.text}</span>
                  </span>
                `,
        )}
        ${hidden > 0
          ? html`<span class="chip plain"
              >${this._t("vacuum_chip_more").replace("{n}", String(hidden))}</span
            >`
          : nothing}
      </div>
    `;
  }

  /** An enum sensor's state, localised, or nothing when it reads as fine. */
  private _enumState(entityId: string | undefined): string | undefined {
    if (!entityId) return undefined;
    const state = this.hass?.states[entityId];
    const raw = state?.state;
    if (!raw || raw === "ok" || raw === "none" || raw === "unknown" || raw === "unavailable") {
      return undefined;
    }
    return this.hass?.formatEntityState?.(state!) ?? raw;
  }

  static styles = [
    glassCardStyles,
    levelSliderStyles,
    foldArrowStyles,
    cardHeaderStyles,
    chipButtonsStyles,
    popupCardStyles,
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

      .fan-row {
        display: flex;
        align-items: flex-end;
        gap: 8px;
      }

      .fan-slider {
        flex: 1;
        min-width: 0;
        --level-accent: var(--m3v-accent);
        --level-ink: var(--m3v-ink);
      }

      /* "Mop only" is a mode, not a quieter setting, so it sits beside the
         scale rather than on it. */
      .mop-only {
        flex: 0 0 auto;
        width: 40px;
        height: 40px;
        margin-bottom: 2px;
        border: none;
        border-radius: 20px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 7%, transparent);
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        --mdc-icon-size: 20px;
        transition:
          border-radius 0.35s ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .mop-only.active {
        border-radius: 12px;
        background: color-mix(in srgb, var(--m3v-accent) 16%, transparent);
        color: var(--m3v-accent);
      }

      .map {
        position: relative;
        border-radius: ${unsafeCSS(VACUUM_MAP_RADIUS)}px;
        overflow: hidden;
        cursor: pointer;
        /* A faint ground so a map with transparent edges does not float on
           whatever the card background happens to be. */
        background: color-mix(in srgb, var(--m3p-text, currentColor) 5%, transparent);
        line-height: 0;
      }

      .map:focus-visible {
        outline: 2px solid var(--m3v-accent);
        outline-offset: 2px;
      }

      /* The browser must not pan or pinch the page while the map is being
         worked; the swipe-navigation plugin is shielded separately, in JS. */
      .map.zoomable {
        touch-action: none;
      }

      .map.zoomed {
        cursor: grab;
      }

      .map img {
        display: block;
        width: 100%;
        height: var(--m3v-map-height, ${unsafeCSS(VACUUM_MAP_HEIGHT)}px);
        /* contain, never cover: cropping a floor plan hides rooms, and the
           whole point of the picture is where the vacuum has been. A Roborock
           map brings wide transparent margins of its own, which is what the
           zoom is for. */
        object-fit: contain;
        transform-origin: center;
        will-change: transform;
      }

      .map-reset {
        position: absolute;
        bottom: 8px;
        right: 8px;
        width: 34px;
        height: 34px;
        border: none;
        border-radius: 17px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        --mdc-icon-size: 20px;
        color: var(--m3p-text, var(--primary-text-color));
        background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 74%, transparent);
        backdrop-filter: blur(6px);
      }

      .map-chip {
        position: absolute;
        top: 8px;
        right: 8px;
        border-radius: ${unsafeCSS(VACUUM_MAP_CHIP_RADIUS)}px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.4;
        color: var(--m3p-text, var(--primary-text-color));
        background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 74%, transparent);
        backdrop-filter: blur(6px);
      }

      .scale-row {
        --level-accent: var(--m3v-accent);
        --level-ink: var(--m3v-ink);
      }

      .rooms {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .room {
        height: ${unsafeCSS(VACUUM_ROOM_HEIGHT)}px;
        border: none;
        border-radius: ${unsafeCSS(VACUUM_ROOM_RADIUS)}px;
        padding: 0 14px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 7%, transparent);
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        font-family: inherit;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition:
          border-radius 0.35s ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .room.chosen {
        border-radius: ${unsafeCSS(VACUUM_ROOM_RADIUS_ACTIVE)}px;
        background: var(--m3v-accent);
        color: var(--m3v-ink);
      }

      .room:disabled {
        cursor: default;
        opacity: 0.4;
      }

      .free-buttons.dimmed {
        opacity: 0.4;
        pointer-events: none;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: ${unsafeCSS(VACUUM_CHIP_GAP)}px;
      }

      .chip {
        height: ${unsafeCSS(VACUUM_CHIP_HEIGHT)}px;
        border-radius: ${unsafeCSS(VACUUM_CHIP_RADIUS)}px;
        padding: 0 10px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        --mdc-icon-size: 15px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 7%, transparent);
        color: var(--m3p-secondary-text, var(--secondary-text-color));
      }

      .chip.warn {
        background: color-mix(in srgb, #f0a24a 16%, transparent);
        color: #f0a24a;
      }

      .chip.tappable {
        border: none;
        font-family: inherit;
        cursor: pointer;
      }

      .chip-check {
        --mdc-icon-size: 14px;
        opacity: 0.7;
      }

      /* Never collapsed into the overflow, and never quiet. */
      .chip.error {
        background: color-mix(in srgb, #e57368 18%, transparent);
        color: #e57368;
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
