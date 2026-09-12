import { LitElement, html, css, nothing, unsafeCSS, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
  M3VacuumMaintenanceCardConfig,
  VacuumConsumableConfig,
  VacuumMaintenanceBlock,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_VACUUM_MAINT_ICON,
  DEFAULT_VACUUM_RADIUS,
  VACUUM_MAINT_ICON_RADIUS,
  VACUUM_MAINT_ICON_SIZE,
  VACUUM_PART_ALERT_BELOW,
  VACUUM_PART_BAR_HEIGHT,
  VACUUM_PART_BAR_MIN_WIDTH,
  VACUUM_PART_BAR_RADIUS,
  VACUUM_PART_ICON_RADIUS,
  VACUUM_PART_ICON_SIZE,
  VACUUM_PART_MAX_HOURS,
  VACUUM_PART_ROW_HEIGHT,
  VACUUM_PART_ROW_RADIUS,
  VACUUM_PART_ROW_TINT,
  VACUUM_PART_WARN_BELOW,
  VACUUM_STAT_LABEL_SIZE,
  VACUUM_STAT_PADDING,
  VACUUM_STAT_RADIUS,
  VACUUM_STAT_TINT,
  VACUUM_STAT_VALUE_SIZE,
  VACUUM_STATION_ICON_RADIUS,
  VACUUM_STATION_ICON_RADIUS_ACTIVE,
  VACUUM_STATION_ICON_SIZE,
  VACUUM_STATION_TILE_PADDING,
  VACUUM_STATION_TILE_RADIUS,
  VACUUM_STATION_TILE_RADIUS_ACTIVE,
  VACUUM_STATION_TINT,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { activateOnKey } from "./shared/a11y";
import { STANDARD_EASING } from "./shared/animation";
import { readCollapsed, writeCollapsed, type CollapseTarget } from "./shared/collapse-state";
import { resolveCommonColors, resolveThemeColor, tintOn } from "./shared/color-config";
import { formatNumber } from "./shared/formatting";
import { glassCardClass, glassCardStyles, renderMissingEntity } from "./shared/glass-card";
import { hassChangeMatters } from "./shared/should-update";
import { PALETTE } from "./shared/tokens";
import { TemplatedCard } from "./shared/templated-card";
import { discoverVacuum, type DiscoveredVacuum } from "./shared/vacuum";
import {
  acknowledgeReminder,
  reminderStates,
  type ReminderState,
} from "./shared/vacuum-reminders";

/**
 * The other half of the vacuum pair: what is wearing out, what the dock can be
 * told to do, and what the robot has done so far.
 *
 * Split from the control card on purpose. Wear counters and lifetime totals
 * are read once a month; suction and Start are read every day. Putting them on
 * one card means the thing you look at daily is buried under the thing you do
 * not — so they are two cards, and `popup:` on the control card is the way to
 * keep them one tap apart.
 *
 * Everything is discovered from the vacuum entity, including the dock, which
 * Roborock registers as a separate device — see `discoverVacuum`.
 */
@customElement("m3-vacuum-maintenance-card")
export class M3VacuumMaintenanceCard
  extends TemplatedCard(LitElement)
  implements LovelaceCard
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3VacuumMaintenanceCardConfig;
  @state() private _folded = false;

  private _discovered?: DiscoveredVacuum;
  private _discoveredFor?: string;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-vacuum-maintenance-card-editor");
    return document.createElement(
      "m3-vacuum-maintenance-card-editor",
    ) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(hass: HomeAssistant): M3VacuumMaintenanceCardConfig {
    const entity = Object.keys(hass.states).find((e) => e.startsWith("vacuum."));
    return { type: "custom:m3-vacuum-maintenance-card", entity: entity ?? "" };
  }

  public setConfig(config: M3VacuumMaintenanceCardConfig): void {
    if (!config.entity) throw new Error("m3-vacuum-maintenance-card: 'entity' is required");
    if (!config.entity.startsWith("vacuum.")) {
      throw new Error("m3-vacuum-maintenance-card: 'entity' must be a vacuum entity");
    }
    this._config = config;
    this._discovered = undefined;
    this._discoveredFor = undefined;
    this._folded = config.collapsible ? readCollapsed(this.hass, this._foldTarget) : false;
  }

  public getCardSize(): number {
    return 5;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 6, min_rows: 3 };
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return hassChangeMatters(changed, this.hass, this._watched());
  }

  private _watched(): (string | undefined)[] {
    const d = this._entities();
    if (!d) return [this._config?.entity];
    return [
      this._config?.entity,
      ...Object.values(d.consumables),
      ...Object.values(d.switches),
      ...Object.values(d.totals),
      d.dockError,
      d.volume,
      d.childLock,
      d.dnd,
    ];
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private get _t() {
    return (key: TranslationKey): string => localize(key, this._language);
  }

  private get _foldTarget(): CollapseTarget {
    return {
      entity: this._config?.collapse_state_entity,
      storageKey: `m3-vacuum-maint-folded:${location.pathname}:${this._config?.entity ?? ""}`,
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
    if (!this._config?.collapsible) return;
    const wanted = readCollapsed(this.hass, this._foldTarget);
    if (wanted !== this._folded) this._folded = wanted;
  }

  private _entities(): DiscoveredVacuum | undefined {
    const entity = this._config?.entity;
    if (!entity || !this.hass) return undefined;
    if (this._discoveredFor !== entity || !this._discovered) {
      this._discovered = discoverVacuum(this.hass, entity);
      this._discoveredFor = entity;
    }
    return this._discovered;
  }

  private _numeric(entityId: string | undefined): number | undefined {
    if (!entityId) return undefined;
    const value = parseFloat(this.hass?.states[entityId]?.state ?? "");
    return isNaN(value) ? undefined : value;
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

  // ---- parts ------------------------------------------------------------------

  /**
   * The parts to draw, in a fixed order rather than whatever the registry walk
   * happened to produce — a list that reorders itself between renders is
   * unreadable.
   */
  private _parts(): { key: string; entity: string; cfg?: VacuumConsumableConfig }[] {
    const d = this._entities();
    if (!d) return [];
    const configured = this._config?.consumables;
    if (configured?.length) {
      return configured
        .map((cfg) => ({
          key: cfg.key ?? cfg.entity ?? "",
          entity: cfg.entity ?? (cfg.key ? d.consumables[cfg.key] : undefined) ?? "",
          cfg,
        }))
        .filter((p) => p.entity && this.hass?.states[p.entity]);
    }
    const order = [
      "main_brush",
      "side_brush",
      "filter",
      "sensor",
      "strainer",
      "maintenance_brush",
    ];
    return order
      .filter((key) => d.consumables[key])
      .map((key) => ({ key, entity: d.consumables[key] }));
  }

  /**
   * How much life a part has left, as a fraction.
   *
   * The sensors report hours *remaining*, never a percentage, so a total has
   * to come from somewhere: the config, or the table of documented service
   * lives. A part neither knows draws its hours without a bar rather than a
   * bar against an invented denominator.
   */
  private _fraction(key: string, hours: number, cfg?: VacuumConsumableConfig): number | undefined {
    const max = cfg?.max_hours ?? VACUUM_PART_MAX_HOURS[key];
    if (!max || max <= 0) return undefined;
    return Math.max(0, Math.min(1, hours / max));
  }

  private _partTone(fraction: number | undefined, hours: number): "ok" | "warn" | "alert" {
    // An overdue part is past caring what fraction says.
    if (hours <= 0) return "alert";
    if (fraction === undefined) return "ok";
    const warn = (this._config?.warn_below ?? VACUUM_PART_WARN_BELOW) / 100;
    const alert = (this._config?.alert_below ?? VACUUM_PART_ALERT_BELOW) / 100;
    if (fraction <= alert) return "alert";
    if (fraction <= warn) return "warn";
    return "ok";
  }

  private _toneColor(tone: "ok" | "warn" | "alert"): string {
    return tone === "alert" ? PALETTE.heat : tone === "warn" ? PALETTE.solar : PALETTE.ok;
  }

  private _partName(key: string, entity: string, cfg?: VacuumConsumableConfig): string {
    if (cfg?.name) return cfg.name;
    const translated = this._t(`vacuum_part_${key}` as TranslationKey);
    if (translated !== `vacuum_part_${key}`) return translated;
    return this.hass?.states[entity]?.attributes.friendly_name ?? entity;
  }

  private _partIcon(key: string, cfg?: VacuumConsumableConfig): string {
    if (cfg?.icon) return cfg.icon;
    const icons: Record<string, string> = {
      main_brush: "mdi:brush",
      side_brush: "mdi:broom",
      filter: "mdi:air-filter",
      sensor: "mdi:eye-outline",
      strainer: "mdi:filter-outline",
      maintenance_brush: "mdi:spray-bottle",
    };
    return icons[key] ?? "mdi:wrench-outline";
  }

  // ---- render -----------------------------------------------------------------

  protected render() {
    if (!this._config || !this.hass) return nothing;
    if (!this.hass.states[this._config.entity]) {
      return renderMissingEntity(this._config.entity);
    }

    const colors = resolveCommonColors(this._config);
    const accent = this._config.accent_color
      ? resolveThemeColor(this._config.accent_color)
      : PALETTE.solar;
    const radius = `${this._config.radius ?? DEFAULT_VACUUM_RADIUS}px`;
    // The header never folds — the "N parts due" line is the reason to look
    // at this card at all. Of what is below it, the fold hides whatever
    // `collapse_blocks` names, and everything when it names nothing.
    const folded = !!this._config.collapsible && this._folded;
    const foldable = this._config.collapse_blocks;
    const hidden = (block: VacuumMaintenanceBlock): boolean =>
      folded && (!foldable || foldable.includes(block));

    const parts = this._parts();
    const due = parts.filter((p) => {
      const hours = this._numeric(p.entity);
      if (hours === undefined) return false;
      return this._partTone(this._fraction(p.key, hours, p.cfg), hours) !== "ok";
    }).length + this._reminders().filter((r) => r.due).length;

    return html`
      <ha-card
        style=${`--m3vm-accent: ${accent}; --m3vm-icon-bg: ${tintOn(
          this,
          accent,
          this._config.accent_opacity,
          14,
        )}; border-radius: ${radius};`}
      >
        <div
          class="card-inner ${glassCardClass(this._config.glass_background)}"
          style=${`border-radius: ${radius};${
            colors.cardBackgroundCss ? ` background: ${colors.cardBackgroundCss};` : ""
          }`}
        >
          ${this._renderHeader(due)}
          ${hidden("parts") || !parts.length
            ? nothing
            : html`<div class="parts">${parts.map((p) => this._renderPart(p))}</div>`}
          ${hidden("reminders") ? nothing : this._renderReminders()}
          ${hidden("station") ? nothing : this._renderStation()}
          ${hidden("stats") ? nothing : this._renderStats()}
          ${hidden("settings") ? nothing : this._renderSettings()}
          ${this._config.card_version ? html`<div class="version">${CARD_VERSION}</div>` : nothing}
        </div>
      </ha-card>
    `;
  }

  private _renderHeader(due: number) {
    const cfg = this._config!;
    const name = cfg.name ?? this._t("vacuum_maint_title");
    const subtitle =
      due === 0
        ? this._t("vacuum_maint_all_ok")
        : due === 1
          ? this._t("vacuum_maint_due_one")
          : this._t("vacuum_maint_due_many").replace("{n}", String(due));

    return html`
      <div class="header">
        <div class="icon-swatch">
          <ha-icon icon=${cfg.icon ?? DEFAULT_VACUUM_MAINT_ICON}></ha-icon>
        </div>
        <div class="header-text">
          <div class="name">${name}</div>
          <div class="subtitle">${subtitle}</div>
        </div>
        ${due > 0
          ? html`
              <span class="due-chip">
                <ha-icon icon="mdi:alert-outline"></ha-icon>
                <span>${due}</span>
              </span>
            `
          : nothing}
        ${cfg.collapsible
          ? html`
              <button
                class="fold ${this._folded ? "folded" : ""}"
                aria-expanded=${String(!this._folded)}
                aria-label=${name}
                @click=${this._toggleFold}
              >
                <ha-icon icon="mdi:chevron-down"></ha-icon>
              </button>
            `
          : nothing}
      </div>
    `;
  }

  private _renderPart(part: { key: string; entity: string; cfg?: VacuumConsumableConfig }) {
    const hours = this._numeric(part.entity);
    if (hours === undefined) return nothing;
    const fraction = this._fraction(part.key, hours, part.cfg);
    const tone = this._partTone(fraction, hours);
    const color = this._toneColor(tone);
    const name = this._partName(part.key, part.entity, part.cfg);
    // A negative reading is Roborock saying the part is past its life, not a
    // broken sensor — shown as "overdue" rather than as "-12 h".
    const value =
      hours <= 0
        ? this._t("vacuum_part_overdue")
        : `${formatNumber(this._language, hours, { maximumFractionDigits: 0 })} h`;

    return html`
      <div
        class="part"
        role="button"
        tabindex="0"
        aria-label=${`${name}: ${value}`}
        @click=${() => this._fireMoreInfo(part.entity)}
        @keydown=${activateOnKey(() => this._fireMoreInfo(part.entity))}
      >
        <div class="part-icon" style=${`background: color-mix(in srgb, ${color} 16%, transparent); color: ${color};`}>
          <ha-icon icon=${this._partIcon(part.key, part.cfg)}></ha-icon>
        </div>
        <div class="part-body">
          <div class="part-name">${name}</div>
          ${fraction !== undefined
            ? html`
                <div class="part-track">
                  <div
                    class="part-fill"
                    style=${`width: max(${VACUUM_PART_BAR_MIN_WIDTH}px, ${(fraction * 100).toFixed(1)}%); background: ${color};`}
                  ></div>
                </div>
              `
            : nothing}
        </div>
        <div class="part-value" style=${`color: ${color};`}>${value}</div>
      </div>
    `;
  }

  // ---- reminders --------------------------------------------------------------

  private _reminders(): ReminderState[] {
    const d = this._entities();
    return reminderStates(this.hass, this._config?.reminders, {
      runs: d?.totals.total_count,
      hours: d?.totals.total_time,
    });
  }

  /**
   * Reminders read as rows beside the parts, because that is what they are —
   * a wear counter the machine does not keep itself. Overdue ones sort to the
   * top; the rest keep their configured order so the list does not reshuffle
   * every time a run finishes.
   */
  private _renderReminders() {
    const states = this._reminders();
    if (!states.length) return nothing;
    const sorted = [...states].sort((a, b) => Number(b.due) - Number(a.due));

    return html`
      <div class="block-label">${this._t("vacuum_reminders")}</div>
      <div class="parts">
        ${sorted.map((state) => this._renderReminder(state))}
      </div>
    `;
  }

  private _renderReminder(state: ReminderState) {
    const color = state.due ? this._toneColor("alert") : this._toneColor("ok");
    const hours = state.basis === "hours";
    const n = (value: number) =>
      formatNumber(this._language, Math.abs(value), { maximumFractionDigits: 0 });

    let value: string;
    if (state.due) {
      value = this._t("vacuum_reminder_due");
    } else if (state.remaining !== undefined) {
      value = this._t(hours ? "vacuum_reminder_in_hours" : "vacuum_reminder_in_runs").replace(
        "{n}",
        n(state.remaining),
      );
    } else {
      // No counter helper, so there is no "since" to report — the interval is
      // the only honest thing to show.
      const every = hours ? state.config.every_hours : state.config.every_runs;
      value = this._t(hours ? "vacuum_reminder_every_hours" : "vacuum_reminder_every_runs").replace(
        "{n}",
        n(every ?? 0),
      );
    }

    return html`
      <div class="part">
        <div
          class="part-icon"
          style=${`background: color-mix(in srgb, ${color} 16%, transparent); color: ${color};`}
        >
          <ha-icon icon=${state.config.icon ?? "mdi:calendar-refresh-outline"}></ha-icon>
        </div>
        <div class="part-body">
          <div class="part-name">${state.config.name}</div>
          <div class="part-track">
            <div
              class="part-fill"
              style=${`width: max(${VACUUM_PART_BAR_MIN_WIDTH}px, ${(state.progress * 100).toFixed(1)}%); background: ${color};`}
            ></div>
          </div>
        </div>
        ${state.acknowledgeable && state.due
          ? html`
              <button
                class="ack"
                @click=${() => acknowledgeReminder(this.hass, state)}
              >
                ${this._t("vacuum_reminder_done")}
              </button>
            `
          : html`<div class="part-value" style=${`color: ${color};`}>${value}</div>`}
      </div>
    `;
  }

  private _renderStation() {
    if (this._config?.show_station === false) return nothing;
    const d = this._entities();
    if (!d) return nothing;
    const tiles: { key: string; entity: string; icon: string; label: TranslationKey }[] = [];
    const add = (key: string, icon: string, label: TranslationKey) => {
      const entity = d.switches[key];
      if (entity) tiles.push({ key, entity, icon, label });
    };
    add("dust_emptying", "mdi:weather-windy", "vacuum_station_dust_emptying");
    add("mop_washing", "mdi:washing-machine", "vacuum_station_mop_washing");
    add("mop_drying", "mdi:hair-dryer-outline", "vacuum_station_mop_drying");
    if (!tiles.length) return nothing;

    return html`
      <div class="block-label">${this._t("vacuum_station")}</div>
      <div class="station">
        ${tiles.map((tile) => {
          const active = this.hass?.states[tile.entity]?.state === "on";
          return html`
            <button
              class="station-tile ${active ? "active" : ""}"
              aria-pressed=${active ? "true" : "false"}
              @click=${() =>
                this.hass?.callService("switch", active ? "turn_off" : "turn_on", {
                  entity_id: tile.entity,
                })}
            >
              <div class="station-icon"><ha-icon icon=${tile.icon}></ha-icon></div>
              <span>${this._t(tile.label)}</span>
            </button>
          `;
        })}
      </div>
    `;
  }

  private _renderStats() {
    if (this._config?.show_stats === false) return nothing;
    const d = this._entities();
    if (!d) return nothing;
    const stats: { value: string; unit: string; label: TranslationKey }[] = [];

    const time = this._numeric(d.totals.total_time);
    if (time !== undefined) {
      stats.push({
        value: formatNumber(this._language, time, { maximumFractionDigits: 0 }),
        unit: "h",
        label: "vacuum_total_time",
      });
    }
    const area = this._numeric(d.totals.total_area);
    if (area !== undefined) {
      stats.push({
        value: formatNumber(this._language, area, { maximumFractionDigits: 0 }),
        unit: "m²",
        label: "vacuum_total_area",
      });
    }
    const count = this._numeric(d.totals.total_count);
    if (count !== undefined) {
      stats.push({
        value: formatNumber(this._language, count, { maximumFractionDigits: 0 }),
        unit: "",
        label: "vacuum_total_count",
      });
    }
    if (!stats.length) return nothing;

    return html`
      <div class="block-label">${this._t("vacuum_total")}</div>
      <div class="stats">
        ${stats.map(
          (s) => html`
            <div class="stat">
              <div class="stat-value">${s.value}<span class="stat-unit">${s.unit}</span></div>
              <div class="stat-label">${this._t(s.label)}</div>
            </div>
          `,
        )}
      </div>
    `;
  }

  private _renderSettings() {
    if (!this._config?.show_settings) return nothing;
    const d = this._entities();
    if (!d) return nothing;
    const rows: { entity: string; label: TranslationKey }[] = [];
    if (d.childLock) rows.push({ entity: d.childLock, label: "vacuum_child_lock" });
    if (d.dnd) rows.push({ entity: d.dnd, label: "vacuum_dnd" });
    if (!rows.length && !d.volume) return nothing;

    return html`
      <div class="block-label">${this._t("vacuum_settings")}</div>
      <div class="settings">
        ${rows.map(
          (row) => html`
            <button
              class="setting ${this.hass?.states[row.entity]?.state === "on" ? "on" : ""}"
              aria-pressed=${this.hass?.states[row.entity]?.state === "on" ? "true" : "false"}
              @click=${() =>
                this.hass?.callService("switch", "toggle", { entity_id: row.entity })}
            >
              ${this._t(row.label)}
            </button>
          `,
        )}
        ${d.volume
          ? html`
              <button class="setting" @click=${() => this._fireMoreInfo(d.volume)}>
                ${this._t("vacuum_volume")}:
                ${formatNumber(this._language, this._numeric(d.volume) ?? 0, {
                  maximumFractionDigits: 0,
                })}
              </button>
            `
          : nothing}
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    css`
      ha-card {
        color: var(--m3p-text, var(--primary-text-color));
        overflow: hidden;
      }

      .card-inner {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        box-sizing: border-box;
      }

      .header {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .icon-swatch {
        flex: 0 0 auto;
        width: ${unsafeCSS(VACUUM_MAINT_ICON_SIZE)}px;
        height: ${unsafeCSS(VACUUM_MAINT_ICON_SIZE)}px;
        border-radius: ${unsafeCSS(VACUUM_MAINT_ICON_RADIUS)}px;
        background: var(--m3vm-icon-bg);
        color: var(--m3vm-accent);
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: 22px;
      }

      .header-text {
        flex: 1;
        min-width: 0;
      }

      .name {
        font-size: 15px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .subtitle {
        font-size: 12px;
        opacity: 0.6;
      }

      .due-chip {
        flex: 0 0 auto;
        height: 30px;
        border-radius: 15px;
        padding: 0 10px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 700;
        --mdc-icon-size: 15px;
        background: color-mix(in srgb, var(--m3vm-accent) 16%, transparent);
        color: var(--m3vm-accent);
      }

      .fold {
        flex: 0 0 auto;
        width: 34px;
        height: 34px;
        border: none;
        border-radius: 17px;
        background: transparent;
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        --mdc-icon-size: 22px;
        transition: transform 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .fold.folded {
        transform: rotate(-90deg);
      }

      .parts {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .part {
        min-height: ${unsafeCSS(VACUUM_PART_ROW_HEIGHT)}px;
        border-radius: ${unsafeCSS(VACUUM_PART_ROW_RADIUS)}px;
        padding: 0 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        background: color-mix(
          in srgb,
          var(--m3p-text, currentColor) ${unsafeCSS(VACUUM_PART_ROW_TINT)}%,
          transparent
        );
      }

      .part:focus-visible {
        outline: 2px solid var(--m3vm-accent);
        outline-offset: 2px;
      }

      .part-icon {
        flex: 0 0 auto;
        width: ${unsafeCSS(VACUUM_PART_ICON_SIZE)}px;
        height: ${unsafeCSS(VACUUM_PART_ICON_SIZE)}px;
        border-radius: ${unsafeCSS(VACUUM_PART_ICON_RADIUS)}px;
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: 17px;
      }

      .part-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .part-name {
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .part-track {
        height: ${unsafeCSS(VACUUM_PART_BAR_HEIGHT)}px;
        border-radius: ${unsafeCSS(VACUUM_PART_BAR_RADIUS)}px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 10%, transparent);
        overflow: hidden;
      }

      .part-fill {
        height: 100%;
        border-radius: ${unsafeCSS(VACUUM_PART_BAR_RADIUS)}px;
        transition: width 0.3s ${unsafeCSS(STANDARD_EASING)};
      }

      .part-value {
        flex: 0 0 auto;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
      }

      .ack {
        flex: 0 0 auto;
        height: 30px;
        border: none;
        border-radius: 15px;
        padding: 0 12px;
        background: var(--m3vm-accent);
        color: var(--m3p-card-background, #1c1c1c);
        font-family: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }

      .block-label {
        font-size: 11px;
        font-weight: 600;
        opacity: 0.55;
        margin-bottom: -4px;
      }

      .station {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
        gap: 6px;
      }

      .station-tile {
        border: none;
        padding: ${unsafeCSS(VACUUM_STATION_TILE_PADDING)}px;
        border-radius: ${unsafeCSS(VACUUM_STATION_TILE_RADIUS)}px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 6%, transparent);
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        /* Both shapes tighten together while it runs — the dock takes minutes,
           so the tile has to look busy for longer than a tap. */
        transition:
          border-radius 0.35s ${unsafeCSS(STANDARD_EASING)},
          background 0.25s ${unsafeCSS(STANDARD_EASING)};
      }

      .station-icon {
        width: ${unsafeCSS(VACUUM_STATION_ICON_SIZE)}px;
        height: ${unsafeCSS(VACUUM_STATION_ICON_SIZE)}px;
        border-radius: ${unsafeCSS(VACUUM_STATION_ICON_RADIUS)}px;
        background: color-mix(in srgb, currentColor 14%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: 17px;
        transition: border-radius 0.35s ${unsafeCSS(STANDARD_EASING)};
      }

      .station-tile.active {
        border-radius: ${unsafeCSS(VACUUM_STATION_TILE_RADIUS_ACTIVE)}px;
        background: color-mix(
          in srgb,
          var(--m3vm-accent) ${unsafeCSS(VACUUM_STATION_TINT)}%,
          transparent
        );
        color: var(--m3vm-accent);
      }

      .station-tile.active .station-icon {
        border-radius: ${unsafeCSS(VACUUM_STATION_ICON_RADIUS_ACTIVE)}px;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        gap: 6px;
      }

      .stat {
        padding: ${unsafeCSS(VACUUM_STAT_PADDING)}px;
        border-radius: ${unsafeCSS(VACUUM_STAT_RADIUS)}px;
        background: color-mix(
          in srgb,
          var(--m3p-text, currentColor) ${unsafeCSS(VACUUM_STAT_TINT)}%,
          transparent
        );
        text-align: center;
      }

      .stat-value {
        font-size: ${unsafeCSS(VACUUM_STAT_VALUE_SIZE)}px;
        font-weight: 700;
        line-height: 1.2;
      }

      .stat-unit {
        font-size: 11px;
        font-weight: 600;
        opacity: 0.55;
        margin-left: 2px;
      }

      .stat-label {
        font-size: ${unsafeCSS(VACUUM_STAT_LABEL_SIZE)}px;
        opacity: 0.45;
      }

      .settings {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .setting {
        height: 34px;
        border: none;
        border-radius: 17px;
        padding: 0 12px;
        background: color-mix(in srgb, var(--m3p-text, currentColor) 7%, transparent);
        color: var(--m3p-secondary-text, var(--secondary-text-color));
        font-family: inherit;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: border-radius 0.35s ${unsafeCSS(STANDARD_EASING)};
      }

      .setting.on {
        border-radius: 11px;
        background: color-mix(in srgb, var(--m3vm-accent) 16%, transparent);
        color: var(--m3vm-accent);
      }

      .version {
        font-size: 10px;
        opacity: 0.4;
        text-align: right;
      }

      @media (prefers-reduced-motion: reduce) {
        .fold,
        .part-fill,
        .station-tile,
        .station-icon,
        .setting {
          transition: none;
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-vacuum-maintenance-card": M3VacuumMaintenanceCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-vacuum-maintenance-card",
  name: "M3 Vacuum Maintenance Card",
  description:
    "Wear counters, dock actions and lifetime totals for a robot vacuum. Everything is found from the vacuum entity, including the dock's own device.",
  preview: true,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
