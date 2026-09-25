import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  M3LightsDimmerOverviewCardConfig,
  HaActionConfig,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from "./types";
import {
  CARD_VERSION,
  DEFAULT_LIGHTS_DIMMER_RADIUS,
  DEFAULT_LIGHTS_DIMMER_ICON,
  DEFAULT_LIGHT_ACCENT,
  LIGHT_OFF_COLOR,
  LIGHT_MIN_BRIGHTNESS_PCT,
  LIGHT_THROTTLE_MS,
  LIGHTS_DIMMER_GAP,
  LIGHTS_DIMMER_TILE_RADIUS,
  LIGHTS_DIMMER_TILE_SIZE_HORIZONTAL,
  LIGHTS_DIMMER_TILE_SIZE_VERTICAL,
  LIGHTS_DIMMER_VERTICAL_MIN_COL,
  LIGHTS_DIMMER_VERTICAL_NAME_HEIGHT,
  LIGHTS_DIMMER_WAVE_THICKNESS,
  LIGHTS_DIMMER_WAVE_STROKE,
  resolveCornerRadius,
} from "./const";
import { resolveThemeColor, buildCssVars, resolveCommonColors, tintOn, foregroundOn } from "./shared/color-config";
import { glassCardStyles, glassCardClass } from "./shared/glass-card";
import { renderCardHeader, cardHeaderStyles } from "./shared/card-header";
import { shouldAnimate } from "./shared/animation";
import { fireEvent } from "./shared/editor-helpers";
import { discoverLightRooms, type DiscoveredLightRoom } from "./shared/ha-registry";
import { buildStatePredicate, hasStateFilter, mergeEntityFilters, pickEntityFilter, type EntityFilterConfig } from "./shared/entity-filter";
import { guessRoomIcon } from "./shared/room-icons";
import { toggleLightSet, setLightSetBrightness, isDimmable, setBrightnessAverage } from "./shared/light-control";
import { viewportSize } from "./shared/lights-dimmer-layout";
import { stripAreaFromEntityName } from "./shared/entity-naming";
import { runHaAction, navigateTo, type RunActionContext } from "./shared/actions";
import { discoveryChangeMatters } from "./shared/should-update";
import { localize, type TranslationKey } from "./localize";
import { DragThrottle } from "./shared/drag-throttle";
import { TemplatedCard } from "./shared/templated-card";
import "./shared/wave-slider";

console.info(
  `%c M3-LIGHTS-DIMMER-OVERVIEW-CARD %c v${CARD_VERSION} `,
  "color: #222; background: #f0c46e; font-weight: 700; border-radius: 4px 0 0 4px;",
  "color: #f0c46e; background: #222; font-weight: 700; border-radius: 0 4px 4px 0;",
);

type ActionKind = "tap" | "hold" | "double_tap";

interface DimmerTile {
  key: string;
  name: string;
  icon: string;
  /** Entities shown/represented by this tile (all room members, or the one light). */
  entities: string[];
  /** Entities a drag/tap actually controls, after the toggle filter. */
  switchable: string[];
  dimmable: boolean;
  on: boolean;
  unavailable: boolean;
  pct: number;
  areaName?: string;
  rgbColor?: [number, number, number];
}

@customElement("m3-lights-dimmer-overview-card")
export class M3LightsDimmerOverviewCard extends TemplatedCard(LitElement) implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3LightsDimmerOverviewCardConfig;
  @state() private _discovered: DiscoveredLightRoom[] = [];
  @state() private _dragKey?: string;
  @state() private _dragValue = 0;

  private _discoverInFlight = false;
  private _lastDiscoverKey?: string;

  private readonly _throttle = new DragThrottle<{ ids: string[]; pct: number; transition?: number }>(
    (v) => this.hass && setLightSetBrightness(this.hass, v.ids, v.pct, v.transition),
    LIGHT_THROTTLE_MS,
  );

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./m3-lights-dimmer-overview-card-editor");
    return document.createElement("m3-lights-dimmer-overview-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): M3LightsDimmerOverviewCardConfig {
    return { type: "custom:m3-lights-dimmer-overview-card", auto_discover: true, glass_background: true };
  }

  public setConfig(config: M3LightsDimmerOverviewCardConfig): void {
    this._config = {
      glass_background: true,
      animation: "auto",
      wave_style: "wavy",
      use_light_color: true,
      auto_discover: config.rooms?.length ? false : true,
      view: "entities",
      orientation: "horizontal",
      columns: 1,
      update_mode: "live",
      sort: "name",
      ...config,
    };
    this._lastDiscoverKey = undefined;
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto", min_rows: 3 };
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._throttle.clear();
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _toggleFilter(): EntityFilterConfig {
    const cfg = this._config;
    if (!cfg) return {};
    const override: EntityFilterConfig = { ...(cfg.toggle_filter ?? {}) };
    if (cfg.exclude_toggle_entities?.length) {
      override.exclude_entities = [
        ...new Set([...(override.exclude_entities ?? []), ...cfg.exclude_toggle_entities]),
      ];
    }
    return mergeEntityFilters(pickEntityFilter(cfg), override, cfg.toggle_inherit_filters ?? true);
  }

  private _maybeDiscover(): void {
    const cfg = this._config;
    if (!this.hass || !cfg || cfg.rooms?.length || !(cfg.auto_discover ?? true) || this._discoverInFlight) {
      return;
    }
    const filter = pickEntityFilter(cfg);
    const toggleFilter = this._toggleFilter();
    const key = JSON.stringify({
      filter,
      toggleFilter,
      groupHandling: cfg.group_handling ?? "all",
      toggleGroupHandling: cfg.toggle_group_handling ?? cfg.group_handling ?? "all",
    });
    if (key === this._lastDiscoverKey) return;
    this._lastDiscoverKey = key;
    this._discoverInFlight = true;
    discoverLightRooms(this.hass, {
      domains: cfg.include_domains,
      filter,
      toggleFilter,
      groupHandling: cfg.group_handling,
      toggleGroupHandling: cfg.toggle_group_handling,
    })
      .then((rooms) => {
        this._discovered = rooms;
      })
      .catch((e) => console.error("m3-lights-dimmer-overview-card: auto-discovery failed", e))
      .finally(() => {
        this._discoverInFlight = false;
      });
  }

  private _buildTiles(): DimmerTile[] {
    if (!this.hass || !this._config) return [];
    const cfg = this._config;
    const hass = this.hass;
    const view = cfg.view ?? "entities";
    const filter = pickEntityFilter(cfg);
    const toggleFilter = this._toggleFilter();
    const showState = buildStatePredicate(hass, filter);
    const toggleState = buildStatePredicate(hass, toggleFilter);
    const excludeToggleGlobal = new Set(cfg.exclude_toggle_entities ?? []);

    const rooms = cfg.rooms?.length
      ? cfg.rooms.map((r, i) => {
          const exclude = new Set([...(r.exclude_toggle_entities ?? []), ...excludeToggleGlobal]);
          const toggleSource = r.toggle_entities ?? r.entities ?? [];
          return {
            key: `manual:${i}`,
            name: r.name,
            icon: r.icon,
            entities: (r.entities ?? []).filter(showState),
            toggleEntities: toggleSource.filter((id) => !exclude.has(id)).filter(toggleState),
            areaId: undefined as string | undefined,
          };
        })
      : this._discovered.map((r) => ({
          key: `area:${r.areaId}`,
          name: r.name,
          icon: r.icon,
          entities: r.entities.filter(showState),
          toggleEntities: r.toggleEntities.filter(toggleState),
          areaId: r.areaId as string | undefined,
        }));

    if (view === "entities") {
      const stripArea = cfg.strip_area_from_name !== false;
      return rooms.flatMap((room) => {
        const switchableSet = new Set(room.toggleEntities);
        return room.entities
          .filter((id) => !!hass.states[id])
          .map((id): DimmerTile => {
            const st = hass.states[id];
            const on = st.state === "on";
            const unavailable = st.state === "unavailable" || st.state === "unknown";
            const brightness255 = st.attributes.brightness as number | undefined;
            const pct = on && brightness255 !== undefined ? Math.round((brightness255 / 255) * 100) : on ? 100 : 0;
            const rgb = st.attributes.rgb_color as [number, number, number] | undefined;
            const rawName = (st.attributes.friendly_name as string | undefined) ?? id;
            return {
              key: `entity:${id}`,
              name: stripArea ? stripAreaFromEntityName(rawName, room.name) : rawName,
              icon: (st.attributes.icon as string | undefined) ?? (on ? "mdi:lightbulb" : "mdi:lightbulb-outline"),
              entities: [id],
              switchable: switchableSet.has(id) ? [id] : [],
              dimmable: isDimmable(st),
              on,
              unavailable,
              pct,
              areaName: room.name,
              rgbColor: Array.isArray(rgb) ? rgb : undefined,
            };
          });
      });
    }

    const forceHideEmpty = hasStateFilter(filter);
    return rooms
      .map((room): DimmerTile => {
        const entities = room.entities.filter((id) => !!hass.states[id]);
        const switchable = room.toggleEntities.filter((id) => !!hass.states[id]);
        const onCount = entities.filter((id) => hass.states[id]?.state === "on").length;
        const dimmable = switchable.some((id) => hass.states[id] && isDimmable(hass.states[id]));
        return {
          key: room.key,
          name: room.name,
          icon: room.icon || guessRoomIcon(room.name),
          entities,
          switchable,
          dimmable,
          on: onCount > 0,
          unavailable: entities.length === 0,
          pct: setBrightnessAverage(hass, switchable),
          areaName: room.name,
        };
      })
      .filter((tile) => !((cfg.hide_empty_rooms || forceHideEmpty) && tile.entities.length === 0));
  }

  private _sortTiles(tiles: DimmerTile[]): DimmerTile[] {
    const sort = this._config?.sort ?? "name";
    if (sort === "on_first") {
      return [...tiles].sort((a, b) => +b.on - +a.on || a.name.localeCompare(b.name, this._language));
    }
    if (sort === "area") {
      return [...tiles].sort(
        (a, b) =>
          (a.areaName ?? "").localeCompare(b.areaName ?? "", this._language) ||
          a.name.localeCompare(b.name, this._language),
      );
    }
    return [...tiles].sort((a, b) => a.name.localeCompare(b.name, this._language));
  }

  private _defaultAction(kind: ActionKind): HaActionConfig {
    if (kind === "tap") return { action: "toggle" };
    if (kind === "hold") return { action: "more-info" };
    return { action: "none" };
  }

  private _resolveAction(kind: ActionKind): HaActionConfig {
    const cfg = this._config;
    const configured =
      kind === "tap" ? cfg?.tap_action : kind === "hold" ? cfg?.hold_action : cfg?.double_tap_action;
    return configured ?? this._defaultAction(kind);
  }

  private _runAction(tile: DimmerTile, kind: ActionKind): void {
    if (!this.hass) return;
    const ctx: RunActionContext = {
      entityId: tile.entities[0],
      toggle: () => toggleLightSet(this.hass!, tile.switchable),
      fireMoreInfo: (entityId) => fireEvent(this, "hass-more-info", { entityId }),
      navigate: (path) => navigateTo(this, path),
    };
    runHaAction(this.hass, this._resolveAction(kind), ctx);
  }

  private _handleInput(tile: DimmerTile, value: number): void {
    this._dragKey = tile.key;
    this._dragValue = value;
    if (!tile.dimmable || tile.switchable.length === 0) return;
    if ((this._config?.update_mode ?? "live") === "live") {
      this._throttle.call({ ids: tile.switchable, pct: value, transition: this._config?.transition });
    }
  }

  private _handleCommit(tile: DimmerTile, value: number): void {
    if (tile.dimmable && tile.switchable.length > 0) {
      this._throttle.flush({ ids: tile.switchable, pct: value, transition: this._config?.transition });
    }
  }

  private _handleDrag(tile: DimmerTile, dragging: boolean): void {
    if (!dragging && this._dragKey === tile.key) this._dragKey = undefined;
  }

  private _watchedEntities(): (string | undefined)[] {
    const cfg = this._config;
    if (!cfg) return [];
    if (cfg.rooms?.length) {
      return cfg.rooms.flatMap((r) => [...(r.entities ?? []), ...(r.toggle_entities ?? r.entities ?? [])]);
    }
    return this._discovered.flatMap((r) => [...r.entities, ...r.toggleEntities]);
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    return discoveryChangeMatters(changed, this.hass, this._watchedEntities());
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    this._maybeDiscover();
    void changed;
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;
    const cfg = this._config;

    const tiles = this._sortTiles(this._buildTiles());
    const name = cfg.name || this._t("lights_dimmer_default_name");
    const icon = cfg.icon || DEFAULT_LIGHTS_DIMMER_ICON;
    const onCount = tiles.reduce((sum, t) => sum + (t.on ? 1 : 0), 0);
    const subtitle = tiles.length === 0 ? this._t("lights_dimmer_empty") : `${onCount}/${tiles.length}`;

    const { textColorCss, secondaryTextColorCss, cardBackgroundCss } = resolveCommonColors(cfg);
    const radius = resolveCornerRadius(cfg.radius ?? DEFAULT_LIGHTS_DIMMER_RADIUS, cfg.corners);
    const animClass = shouldAnimate(cfg.animation) ? "" : "no-animations";
    const accentColor = cfg.accent_color ? resolveThemeColor(cfg.accent_color) : DEFAULT_LIGHT_ACCENT;

    const iconWellCss = tintOn(this, accentColor, undefined, 12);
    const cssVars = buildCssVars({
      "m3p-icon-color": foregroundOn(accentColor, iconWellCss),
      "m3p-icon-bg": iconWellCss,
      "m3p-text": textColorCss,
      "m3p-secondary-text": secondaryTextColorCss,
    });

    const orientation = cfg.orientation ?? "horizontal";
    const columns = orientation === "horizontal" ? Math.max(1, cfg.columns ?? 1) : 1;
    const tileSize = cfg.tile_size ?? (orientation === "horizontal" ? LIGHTS_DIMMER_TILE_SIZE_HORIZONTAL : LIGHTS_DIMMER_TILE_SIZE_VERTICAL);
    const { maxHeight, columnWidth } = viewportSize({
      orientation,
      maxItems: cfg.max_items,
      columns,
      tileSize,
      gap: LIGHTS_DIMMER_GAP,
    });

    const scrollStyle = [
      orientation === "horizontal" ? `grid-template-columns: repeat(${columns}, 1fr);` : `height: ${tileSize}px;`,
      maxHeight ? `max-height: ${maxHeight};` : "",
    ].join("");

    return html`
      <ha-card style=${`${cssVars} border-radius: ${radius};`}>
        <div
          class="card-inner ${glassCardClass(cfg.glass_background)} ${animClass}"
          style=${`border-radius: ${radius};${cardBackgroundCss ? ` background: ${cardBackgroundCss};` : ""}`}
        >
          ${cfg.show_header === false ? nothing : renderCardHeader({ icon, name, subtitle })}
          ${tiles.length === 0
            ? html`<div class="empty-state">${this._t("lights_dimmer_empty")}</div>`
            : html`
                <div class="tile-scroll ${orientation}" style=${scrollStyle}>
                  ${tiles.map((t) => this._renderTile(t, orientation, tileSize, columnWidth))}
                </div>
              `}
        </div>
      </ha-card>
    `;
  }

  private _renderTile(tile: DimmerTile, orientation: "horizontal" | "vertical", tileSize: number, columnWidth?: string) {
    const cfg = this._config!;
    const showName = cfg.show_name !== false;
    const showIcon = cfg.show_icon !== false;
    const showState = cfg.show_state !== false;
    const showArea = cfg.show_area !== false && (cfg.view ?? "entities") === "entities" && !!tile.areaName;

    const offColor = cfg.off_color ? resolveThemeColor(cfg.off_color) : LIGHT_OFF_COLOR;
    const baseAccent = cfg.accent_color ? resolveThemeColor(cfg.accent_color) : DEFAULT_LIGHT_ACCENT;
    const accent =
      cfg.use_light_color !== false && tile.rgbColor ? `rgb(${tile.rgbColor.join(", ")})` : baseAccent;
    const activeColor = tile.unavailable || !tile.on ? offColor : accent;
    const trackColor = cfg.track_color ? resolveThemeColor(cfg.track_color) : "rgba(255, 255, 255, 0.13)";
    const handleColor = `color-mix(in srgb, ${activeColor} 60%, white 40%)`;

    const displayPct = this._dragKey === tile.key ? this._dragValue : tile.pct;
    const stateLabel = tile.unavailable ? this._t("unavailable") : !tile.on ? this._t("off") : `${Math.round(displayPct)} %`;

    const hasHold = this._resolveAction("hold").action !== "none";
    const hasDoubleTap = this._resolveAction("double_tap").action !== "none";

    // Vertical tiles put the name below the slider instead of overlaying it
    // (see the .tile-wrap/.tile-name-below CSS below), so the slider itself
    // only gets the column's height minus that row — horizontal keeps the
    // full tileSize, its name lives inside the slider's own content row.
    const nameBelowHeight = orientation === "vertical" && showName ? LIGHTS_DIMMER_VERTICAL_NAME_HEIGHT : 0;
    const sliderHeight = orientation === "vertical" ? tileSize - nameBelowHeight : tileSize;

    const tileBg = tintOn(this, activeColor, undefined, tile.on ? 20 : 10);
    // The card-level --m3p-icon-color (header swatch) is calibrated against
    // the header's own, much lighter well — reusing it here under-contrasts
    // against a tile's more saturated tint, so each tile gets its own icon
    // color measured against its own background instead.
    const tileIconColor = foregroundOn(activeColor, tileBg);

    // Vertical's background/radius live on .tile-wrap, not the slider — the
    // name row sits below the slider but still has to read as part of the
    // same tile, not a caption floating on the card's own background, so the
    // tinted, rounded surface has to span both rows instead of stopping at
    // the slider's own bottom edge.
    const sizeStyle =
      orientation === "horizontal"
        ? `height: ${sliderHeight}px; background: ${tileBg}; border-radius: ${LIGHTS_DIMMER_TILE_RADIUS}px; --tile-icon-color: ${tileIconColor};`
        : `width: 100%; height: ${sliderHeight}px;`;
    const wrapStyle =
      orientation === "vertical"
        ? `width: ${columnWidth ?? `${tileSize}px`}; flex: 0 0 ${columnWidth ?? `${Math.max(tileSize, LIGHTS_DIMMER_VERTICAL_MIN_COL)}px`}; height: 100%; background: ${tileBg}; border-radius: ${LIGHTS_DIMMER_TILE_RADIUS}px; --tile-icon-color: ${tileIconColor};`
        : "";

    const slider = html`
      <m3-wave-slider
        class="tile"
        orientation=${orientation}
        gestures="tile"
        .value=${displayPct}
        .min=${LIGHT_MIN_BRIGHTNESS_PCT}
        ?active=${tile.on}
        ?disabled=${tile.unavailable}
        .animation=${cfg.animation ?? "auto"}
        .waveStyle=${cfg.wave_style ?? "wavy"}
        ?hasHold=${hasHold}
        ?hasDoubleTap=${hasDoubleTap}
        label=${tile.name}
        style=${`${sizeStyle} --wave-slider-accent: ${activeColor}; --wave-slider-track: ${trackColor}; --wave-slider-handle: ${handleColor}; --wave-slider-thickness: ${LIGHTS_DIMMER_WAVE_THICKNESS}px; --wave-slider-stroke: ${LIGHTS_DIMMER_WAVE_STROKE}px;`}
        @slider-tap=${() => this._runAction(tile, "tap")}
        @slider-hold=${() => this._runAction(tile, "hold")}
        @slider-double-tap=${() => this._runAction(tile, "double_tap")}
        @slider-input=${(e: CustomEvent<{ value: number }>) => this._handleInput(tile, e.detail.value)}
        @slider-commit=${(e: CustomEvent<{ value: number }>) => this._handleCommit(tile, e.detail.value)}
        @slider-drag=${(e: CustomEvent<{ dragging: boolean }>) => this._handleDrag(tile, e.detail.dragging)}
      >
        ${orientation === "horizontal"
          ? html`
              <div class="tile-content horizontal">
                ${showIcon ? html`<ha-icon icon=${tile.icon}></ha-icon>` : nothing}
                <span class="tile-name">
                  ${showName ? tile.name : nothing}${showArea
                    ? html`<span class="tile-area">${showName ? " · " : ""}${tile.areaName}</span>`
                    : nothing}
                </span>
                ${showState ? html`<span class="tile-pct">${stateLabel}</span>` : nothing}
              </div>
            `
          : html`
              <div class="tile-content vertical">
                ${showIcon ? html`<ha-icon icon=${tile.icon}></ha-icon>` : nothing}
                ${showState ? html`<span class="tile-pct">${stateLabel}</span>` : nothing}
              </div>
            `}
      </m3-wave-slider>
    `;

    if (orientation === "horizontal") return slider;

    return html`
      <div class="tile-wrap" style=${wrapStyle}>
        ${slider}
        ${showName
          ? html`<div class="tile-name-below" style=${`height: ${nameBelowHeight}px;`}>${tile.name}</div>`
          : nothing}
      </div>
    `;
  }

  static styles = [
    glassCardStyles,
    cardHeaderStyles,
    css`
      .tile-scroll {
        display: grid;
        gap: ${LIGHTS_DIMMER_GAP}px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scroll-snap-type: y proximity;
      }

      .tile-scroll.vertical {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x proximity;
        height: ${LIGHTS_DIMMER_TILE_SIZE_VERTICAL}px;
      }

      .tile {
        display: block;
        box-sizing: border-box;
        padding: 8px 10px;
        overflow: hidden;
      }

      .tile-scroll:not(.vertical) > .tile {
        scroll-snap-align: start;
      }

      .tile-wrap {
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        overflow: hidden;
        scroll-snap-align: start;
      }

      .tile-content {
        display: flex;
        /* Top-aligned, not centered: the wave draws in a fixed-height strip
           at the bottom of the tile (see shared/wave-slider.ts's .wave), so
           the row has to stay clear of it rather than spread across the
           full tile height. Vertical keeps the same rule for the same
           reason, just along the width instead of the height — its name
           lives below the slider (.tile-name-below) precisely so this row
           never has to share vertical space with the wave either. */
        align-items: flex-start;
        gap: 8px;
        width: 100%;
        height: 100%;
      }

      .tile-content.vertical {
        justify-content: space-between;
      }

      .tile-content ha-icon {
        flex-shrink: 0;
        --mdc-icon-size: 20px;
        color: var(--tile-icon-color, var(--m3p-text));
      }

      .tile-name {
        display: block;
        min-width: 0;
        flex: 1;
        font-size: 15px;
        font-weight: 600;
        color: var(--m3p-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tile-area {
        font-size: 11px;
        opacity: 0.6;
        color: var(--m3p-secondary-text);
      }

      .tile-name-below {
        box-sizing: border-box;
        padding: 2px 8px 6px;
        font-size: 11px;
        font-weight: 600;
        text-align: center;
        color: var(--m3p-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tile-pct {
        font-size: 13px;
        font-weight: 500;
        color: var(--m3p-text);
        flex-shrink: 0;
      }

      .empty-state {
        text-align: center;
        font-size: 13px;
        opacity: 0.6;
        padding: 16px 0;
        color: var(--m3p-secondary-text);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-lights-dimmer-overview-card": M3LightsDimmerOverviewCard;
  }
}

const windowWithCards = window as unknown as {
  customCards: Array<Record<string, unknown>>;
};
windowWithCards.customCards = windowWithCards.customCards || [];
windowWithCards.customCards.push({
  type: "m3-lights-dimmer-overview-card",
  name: "M3 Lights Dimmer Overview Card",
  description: "Große Kacheln zum Tippen und Ziehen: Lichter an/aus schalten und dimmen, pro Lampe oder pro Raum.",
  preview: false,
  documentationURL: "https://github.com/j0sp0r/m3-cards",
});
