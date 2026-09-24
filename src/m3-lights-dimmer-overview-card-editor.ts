import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  HomeAssistant,
  LovelaceCardEditor,
  M3LightsDimmerOverviewCardConfig,
  LightsOverviewManualRoomConfig,
  HaActionConfig,
} from "./types";
import { DEFAULT_LIGHTS_DIMMER_RADIUS } from "./const";
import { localize, type TranslationKey } from "./localize";
import { fireEvent, colorRow, editorStyles, type SchemaEntry } from "./shared/editor-helpers";
import { radiusLabelMap } from "./shared/radius-editor";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

type DimmerColorField = "accent_color" | "off_color" | "track_color" | "text_color" | "secondary_text_color" | "card_background";

const ACTION_KEYS = ["tap_action", "hold_action", "double_tap_action"] as const;

@customElement("m3-lights-dimmer-overview-card-editor")
export class M3LightsDimmerOverviewCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3LightsDimmerOverviewCardConfig;
  @state() private _appearance: AppearanceState = { showCustomRadius: false, showCorners: false, cornerCustom: {} };

  public setConfig(config: M3LightsDimmerOverviewCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_LIGHTS_DIMMER_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _groupHandlingSelector() {
    return {
      select: {
        mode: "dropdown" as const,
        options: [
          { value: "all", label: this._t("editor_lights_groups_all") },
          { value: "prefer_groups", label: this._t("editor_lights_groups_prefer_groups") },
          { value: "prefer_members", label: this._t("editor_lights_groups_prefer_members") },
        ],
      },
    };
  }

  // No "popup" option here — the dimmer overview never opens a popup of its
  // own (it already is one, in the lights overview's popup mode).
  private _actionSelector() {
    return {
      select: {
        mode: "dropdown" as const,
        options: [
          { value: "toggle", label: this._t("editor_lights_action_toggle") },
          { value: "more-info", label: this._t("editor_lights_action_more_info") },
          { value: "none", label: this._t("editor_lights_action_none") },
        ],
      },
    };
  }

  private _stateSelector() {
    return {
      select: {
        multiple: true,
        custom_value: true,
        options: [
          { value: "on", label: this._t("editor_lights_state_on") },
          { value: "off", label: this._t("editor_lights_state_off") },
          { value: "unavailable", label: this._t("editor_lights_state_unavailable") },
          { value: "unknown", label: this._t("editor_lights_state_unknown") },
        ],
      },
    };
  }

  private _discoverySchema(): SchemaEntry[] {
    const domains = this._config?.include_domains?.length ? this._config.include_domains : ["light"];
    return [
      { name: "auto_discover", selector: { boolean: {} } },
      {
        name: "include_domains",
        selector: {
          select: {
            multiple: true,
            mode: "dropdown",
            options: [
              { value: "light", label: this._t("editor_lights_domain_light") },
              { value: "switch", label: this._t("editor_lights_domain_switch") },
              { value: "fan", label: this._t("editor_lights_domain_fan") },
              { value: "input_boolean", label: this._t("editor_lights_domain_input_boolean") },
            ],
          },
        },
      },
      { name: "include_area", selector: { area: { multiple: true } } },
      { name: "exclude_area", selector: { area: { multiple: true } } },
      { name: "include_labels", selector: { label: { multiple: true } } },
      { name: "exclude_labels", selector: { label: { multiple: true } } },
      { name: "include_entities", selector: { entity: { domain: domains, multiple: true } } },
      { name: "exclude_entities", selector: { entity: { domain: domains, multiple: true } } },
      { name: "include_state", selector: this._stateSelector() },
      { name: "exclude_state", selector: this._stateSelector() },
      { name: "group_handling", selector: this._groupHandlingSelector() },
      { name: "hide_empty_rooms", selector: { boolean: {} } },
    ];
  }

  private _roomSchema(): SchemaEntry[] {
    return [
      { name: "name", required: true, selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "entities", selector: { entity: { domain: "light", multiple: true } } },
      { name: "toggle_entities", selector: { entity: { domain: "light", multiple: true } } },
    ];
  }

  private _displaySchema(): SchemaEntry[] {
    const cfg = this._config;
    const orientation = cfg?.orientation ?? "horizontal";
    const view = cfg?.view ?? "entities";
    const fields: SchemaEntry[] = [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      {
        name: "view",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "entities", label: this._t("editor_lights_view_entities") },
              { value: "rooms", label: this._t("editor_lights_view_rooms") },
            ],
          },
        },
      },
      {
        name: "orientation",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "horizontal", label: this._t("editor_lights_dimmer_orientation_horizontal") },
              { value: "vertical", label: this._t("editor_lights_dimmer_orientation_vertical") },
            ],
          },
        },
      },
    ];
    // columns only makes sense in the horizontal layout — vertical is always
    // a single row of columns, see the dimmer-overview plan's layout table.
    if (orientation === "horizontal") {
      fields.push({ name: "columns", selector: { number: { min: 1, max: 6, mode: "box" } } });
    }
    fields.push(
      { name: "tile_size", selector: { number: { min: 32, max: 400, mode: "box" } } },
      { name: "max_items", selector: { number: { min: 1, max: 50, mode: "box" } } },
      { name: "show_name", selector: { boolean: {} } },
      { name: "show_icon", selector: { boolean: {} } },
      { name: "show_state", selector: { boolean: {} } },
      { name: "show_header", selector: { boolean: {} } },
    );
    if (view === "entities") {
      fields.push(
        { name: "show_area", selector: { boolean: {} } },
        { name: "strip_area_from_name", selector: { boolean: {} } },
      );
    }
    return fields;
  }

  private _behaviorSchema(): SchemaEntry[] {
    return [
      {
        name: "update_mode",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "live", label: this._t("editor_lights_dimmer_update_mode_live") },
              { value: "release", label: this._t("editor_lights_dimmer_update_mode_release") },
            ],
          },
        },
      },
      { name: "transition", selector: { number: { min: 0, max: 10, step: 0.5, mode: "box" } } },
      { name: "tap_action", selector: this._actionSelector() },
      { name: "hold_action", selector: this._actionSelector() },
      { name: "double_tap_action", selector: this._actionSelector() },
    ];
  }

  private _toggleSchema(): SchemaEntry[] {
    return [
      { name: "exclude_toggle_entities", selector: { entity: { domain: "light", multiple: true } } },
      { name: "toggle_inherit_filters", selector: { boolean: {} } },
      { name: "toggle_group_handling", selector: this._groupHandlingSelector() },
    ];
  }

  private _animationSchema(): SchemaEntry[] {
    return [
      {
        name: "animation",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "auto", label: this._t("editor_progress_animation_auto") },
              { value: "on", label: this._t("editor_progress_animation_on") },
              { value: "off", label: this._t("editor_progress_animation_off") },
            ],
          },
        },
      },
      {
        name: "wave_style",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "wavy", label: this._t("editor_light_wave_style_wavy") },
              { value: "flat", label: this._t("editor_light_wave_style_flat") },
            ],
          },
        },
      },
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      auto_discover: "editor_lights_auto_discover",
      include_domains: "editor_lights_include_domains",
      include_area: "editor_lights_include_area",
      exclude_area: "editor_lights_exclude_area",
      include_labels: "editor_lights_include_labels",
      exclude_labels: "editor_lights_exclude_labels",
      include_entities: "editor_lights_include_entities",
      exclude_entities: "editor_lights_exclude_entities",
      include_state: "editor_lights_include_state",
      exclude_state: "editor_lights_exclude_state",
      group_handling: "editor_lights_group_handling",
      hide_empty_rooms: "editor_lights_hide_empty_rooms",
      name: "editor_name",
      icon: "editor_icon",
      entities: "editor_lights_room_entities",
      toggle_entities: "editor_lights_room_toggle_entities",
      view: "editor_lights_view",
      orientation: "editor_lights_dimmer_orientation",
      columns: "editor_lights_dimmer_columns",
      tile_size: "editor_lights_dimmer_tile_size",
      max_items: "editor_lights_dimmer_max_items",
      show_name: "editor_lights_dimmer_show_name",
      show_icon: "editor_lights_dimmer_show_icon",
      show_state: "editor_lights_dimmer_show_state",
      show_area: "editor_lights_show_area",
      strip_area_from_name: "editor_lights_dimmer_strip_area_from_name",
      show_header: "editor_show_header",
      update_mode: "editor_lights_dimmer_update_mode",
      transition: "editor_lights_dimmer_transition",
      tap_action: "editor_lights_tap_action",
      hold_action: "editor_lights_hold_action",
      double_tap_action: "editor_lights_double_tap_action",
      exclude_toggle_entities: "editor_lights_exclude_toggle",
      toggle_inherit_filters: "editor_lights_toggle_inherit",
      toggle_group_handling: "editor_lights_toggle_group_handling",
      animation: "editor_progress_animation",
      wave_style: "editor_light_wave_style",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _actionsChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const value = ev.detail.value as Record<string, string>;
    const patch: Partial<Record<(typeof ACTION_KEYS)[number], HaActionConfig>> = {};
    for (const key of ACTION_KEYS) {
      const action = value[key];
      if (action) patch[key] = { action } as HaActionConfig;
    }
    // Non-action fields (update_mode, transition) travel in the same form.
    const { tap_action: _t1, hold_action: _t2, double_tap_action: _t3, ...rest } = value;
    this._config = { ...this._config, ...rest, ...patch };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _toggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, ...ev.detail.value };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _colorChanged(field: DimmerColorField, value: string): void {
    if (!this._config) return;
    if (value) {
      this._config = { ...this._config, [field]: value };
    } else {
      const { [field]: _removed, ...rest } = this._config;
      this._config = rest;
    }
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _useLightColorChanged(ev: CustomEvent): void {
    if (!this._config) return;
    this._config = { ...this._config, use_light_color: (ev.detail.value as { use_light_color: boolean }).use_light_color };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _roomChanged(index: number, ev: CustomEvent): void {
    if (!this._config) return;
    const rooms = [...(this._config.rooms ?? [])];
    const value = ev.detail.value as LightsOverviewManualRoomConfig;
    rooms[index] = {
      name: value.name ?? "",
      icon: value.icon || undefined,
      entities: value.entities?.length ? value.entities : undefined,
      toggle_entities: value.toggle_entities?.length ? value.toggle_entities : undefined,
      exclude_toggle_entities: rooms[index]?.exclude_toggle_entities,
    };
    this._config = { ...this._config, rooms };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _addRoom(): void {
    if (!this._config) return;
    const rooms = [...(this._config.rooms ?? []), { name: "" }];
    this._config = { ...this._config, rooms };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _removeRoom(index: number): void {
    if (!this._config) return;
    const rooms = [...(this._config.rooms ?? [])];
    rooms.splice(index, 1);
    this._config = { ...this._config, rooms };
    fireEvent(this, "config-changed", { config: this._config });
  }

  private _radiusPresetChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = radiusPresetPatch(ev.detail.value.radius_preset as string);
    this._appearance = { ...this._appearance, showCustomRadius: patch.showCustomRadius };
    if (patch.radius !== undefined) {
      this._config = { ...this._config, radius: patch.radius };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornersToggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const showCorners = ev.detail.value.use_corners as boolean;
    this._appearance = { ...this._appearance, showCorners };
    if (!showCorners) {
      const { corners: _corners, ...rest } = this._config;
      this._config = rest;
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornerPresetChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const patch = cornerPresetPatch(ev.detail.value[key] as string);
    this._appearance = { ...this._appearance, cornerCustom: { ...this._appearance.cornerCustom, [key]: patch.custom } };
    if (patch.px !== undefined) {
      this._config = { ...this._config, corners: { ...(this._config.corners ?? {}), [key]: patch.px } };
      fireEvent(this, "config-changed", { config: this._config });
    }
  }

  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._config = { ...this._config, corners: { ...(this._config.corners ?? {}), [key]: px } };
    fireEvent(this, "config-changed", { config: this._config });
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;
    const cfg = this._config;
    const rooms = cfg.rooms ?? [];

    const discoveryData = {
      auto_discover: cfg.auto_discover ?? true,
      include_domains: cfg.include_domains ?? ["light"],
      include_area: cfg.include_area ?? [],
      exclude_area: cfg.exclude_area ?? [],
      include_labels: cfg.include_labels ?? [],
      exclude_labels: cfg.exclude_labels ?? [],
      include_entities: cfg.include_entities ?? [],
      exclude_entities: cfg.exclude_entities ?? [],
      include_state: cfg.include_state ?? [],
      exclude_state: cfg.exclude_state ?? [],
      group_handling: cfg.group_handling ?? "all",
      hide_empty_rooms: cfg.hide_empty_rooms ?? false,
    };

    const displayData: Record<string, unknown> = {
      name: cfg.name,
      icon: cfg.icon,
      view: cfg.view ?? "entities",
      orientation: cfg.orientation ?? "horizontal",
      tile_size: cfg.tile_size,
      max_items: cfg.max_items,
      show_name: cfg.show_name ?? true,
      show_icon: cfg.show_icon ?? true,
      show_state: cfg.show_state ?? true,
      show_header: cfg.show_header ?? true,
    };
    if ((cfg.orientation ?? "horizontal") === "horizontal") displayData.columns = cfg.columns ?? 1;
    if ((cfg.view ?? "entities") === "entities") {
      displayData.show_area = cfg.show_area ?? true;
      displayData.strip_area_from_name = cfg.strip_area_from_name ?? true;
    }

    const behaviorData = {
      update_mode: cfg.update_mode ?? "live",
      transition: cfg.transition,
      tap_action: cfg.tap_action?.action ?? "toggle",
      hold_action: cfg.hold_action?.action ?? "more-info",
      double_tap_action: cfg.double_tap_action?.action ?? "none",
    };

    const toggleData = {
      exclude_toggle_entities: cfg.exclude_toggle_entities ?? [],
      toggle_inherit_filters: cfg.toggle_inherit_filters ?? true,
      toggle_group_handling: cfg.toggle_group_handling ?? cfg.group_handling ?? "all",
    };

    const animationData = { animation: cfg.animation ?? "auto", wave_style: cfg.wave_style ?? "wavy" };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_entities")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:home-search-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${discoveryData}
              .schema=${this._discoverySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            ${rooms.map(
              (r, i) => html`
                <div class="override-row">
                  <div class="override-form">
                    <ha-form
                      .hass=${this.hass}
                      .data=${{
                        name: r.name,
                        icon: r.icon ?? "",
                        entities: r.entities ?? [],
                        toggle_entities: r.toggle_entities ?? [],
                      }}
                      .schema=${this._roomSchema()}
                      .computeLabel=${this._computeLabel}
                      @value-changed=${(ev: CustomEvent) => this._roomChanged(i, ev)}
                    ></ha-form>
                  </div>
                  <button class="remove-btn" @click=${() => this._removeRoom(i)}>
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </div>
              `,
            )}
            <button class="add-btn" @click=${() => this._addRoom()}>
              <ha-icon icon="mdi:plus"></ha-icon>
              ${this._t("editor_lights_add_room")}
            </button>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_content")}>
          <ha-icon slot="leading-icon" icon="mdi:view-grid-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${displayData}
              .schema=${this._displaySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_behavior")}>
          <ha-icon slot="leading-icon" icon="mdi:gesture-tap"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${behaviorData}
              .schema=${this._behaviorSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._actionsChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_lights_toggle_section")}>
          <ha-icon slot="leading-icon" icon="mdi:toggle-switch-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${toggleData}
              .schema=${this._toggleSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._toggleChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${{ use_light_color: cfg.use_light_color ?? true }}
              .schema=${[{ name: "use_light_color", selector: { boolean: {} } }]}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._useLightColorChanged}
            ></ha-form>
            ${colorRow(this._t("editor_lights_accent_color"), cfg.accent_color, (v) => this._colorChanged("accent_color", v))}
            ${colorRow(this._t("editor_lights_off_color"), cfg.off_color, (v) => this._colorChanged("off_color", v))}
            ${colorRow(this._t("editor_light_track_color"), cfg.track_color, (v) => this._colorChanged("track_color", v))}
            ${colorRow(this._t("editor_progress_text_color"), cfg.text_color, (v) => this._colorChanged("text_color", v))}
            ${colorRow(
              this._t("editor_progress_secondary_text_color"),
              cfg.secondary_text_color,
              (v) => this._colorChanged("secondary_text_color", v),
            )}
            ${colorRow(this._t("editor_progress_card_background"), cfg.card_background, (v) => this._colorChanged("card_background", v))}
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_animation")}>
          <ha-icon slot="leading-icon" icon="mdi:wave"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${animationData}
              .schema=${this._animationSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_progress_animation_reduced_motion_hint")}</div>
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: cfg,
          defaultRadius: DEFAULT_LIGHTS_DIMMER_RADIUS,
          state: this._appearance,
          computeLabel: this._computeLabel,
          onValueChanged: this._valueChanged.bind(this),
          onRadiusPresetChanged: this._radiusPresetChanged.bind(this),
          onCornersToggleChanged: this._cornersToggleChanged.bind(this),
          onCornerPresetChanged: this._cornerPresetChanged.bind(this),
          onCornerValueChanged: this._cornerValueChanged.bind(this),
        })}
      </div>
    `;
  }

  static styles = [
    editorStyles,
    css`
      .override-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      .override-form {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .remove-btn {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 8px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .add-btn {
        width: 100%;
        height: 40px;
        border: none;
        border-radius: 8px;
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 14px;
        font-family: inherit;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-lights-dimmer-overview-card-editor": M3LightsDimmerOverviewCardEditor;
  }
}
