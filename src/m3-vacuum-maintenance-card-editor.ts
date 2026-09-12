import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor, M3VacuumMaintenanceCardConfig } from "./types";
import {
  DEFAULT_VACUUM_MAINT_ICON,
  DEFAULT_VACUUM_RADIUS,
  VACUUM_PART_ALERT_BELOW,
  VACUUM_PART_WARN_BELOW,
} from "./const";
import { localize, type TranslationKey } from "./localize";
import { colorRow, editorStyles, fireEvent, type SchemaEntry } from "./shared/editor-helpers";
import { radiusLabelMap } from "./shared/radius-editor";
import {
  initAppearanceState,
  radiusPresetPatch,
  cornerPresetPatch,
  renderAppearanceSection,
  type AppearanceState,
} from "./shared/appearance-editor";

@customElement("m3-vacuum-maintenance-card-editor")
export class M3VacuumMaintenanceCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: M3VacuumMaintenanceCardConfig;
  @state() private _appearance: AppearanceState = {
    showCustomRadius: false,
    showCorners: false,
    cornerCustom: {},
  };

  public setConfig(config: M3VacuumMaintenanceCardConfig): void {
    this._config = config;
    this._appearance = initAppearanceState(config, DEFAULT_VACUUM_RADIUS);
  }

  private get _language(): string {
    return this.hass?.locale?.language ?? this.hass?.language ?? "en";
  }

  private _t(key: TranslationKey): string {
    return localize(key, this._language);
  }

  private _emit(config: M3VacuumMaintenanceCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private _deviceSchema(): SchemaEntry[] {
    return [
      { name: "entity", selector: { entity: { domain: "vacuum" } } },
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
    ];
  }

  private _thresholdSchema(): SchemaEntry[] {
    return [
      { name: "warn_below", selector: { number: { min: 1, max: 90, mode: "box", unit_of_measurement: "%" } } },
      { name: "alert_below", selector: { number: { min: 0, max: 80, mode: "box", unit_of_measurement: "%" } } },
    ];
  }

  private _displaySchema(): SchemaEntry[] {
    return [
      { name: "show_station", selector: { boolean: {} } },
      { name: "show_stats", selector: { boolean: {} } },
      { name: "show_settings", selector: { boolean: {} } },
      { name: "show_reset", selector: { boolean: {} } },
      { name: "collapsible", selector: { boolean: {} } },
      { name: "default_collapsed", selector: { boolean: {} } },
    ];
  }

  private _computeLabel = (schema: SchemaEntry): string => {
    const labelMap: Record<string, TranslationKey> = {
      entity: "editor_entity",
      name: "editor_name",
      icon: "editor_icon",
      warn_below: "editor_vacuum_warn_below",
      alert_below: "editor_vacuum_alert_below",
      show_station: "editor_vacuum_show_station",
      show_stats: "editor_vacuum_show_stats",
      show_settings: "editor_vacuum_show_settings",
      show_reset: "editor_vacuum_show_reset",
      collapsible: "editor_vacuum_collapsible",
      default_collapsed: "editor_vacuum_default_collapsed",
      glass_background: "editor_glass_background",
      ...radiusLabelMap,
    };
    const key = labelMap[schema.name];
    return key ? this._t(key) : schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const next: Record<string, unknown> = {
      ...this._config,
      ...(ev.detail.value as Record<string, unknown>),
    };
    // A cleared field means "use the default", not "show nothing".
    for (const key of ["name", "icon"]) {
      if (next[key] === "") delete next[key];
    }
    this._emit(next as unknown as M3VacuumMaintenanceCardConfig);
  }

  private _colorChanged(
    field: "accent_color" | "text_color" | "secondary_text_color" | "card_background",
    value: string,
  ): void {
    if (!this._config) return;
    if (value) {
      this._emit({ ...this._config, [field]: value });
    } else {
      const { [field]: _removed, ...rest } = this._config;
      this._emit(rest as M3VacuumMaintenanceCardConfig);
    }
  }

  private _radiusPresetChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const patch = radiusPresetPatch(ev.detail.value.radius_preset as string);
    this._appearance = { ...this._appearance, showCustomRadius: patch.showCustomRadius };
    if (patch.radius !== undefined) this._emit({ ...this._config, radius: patch.radius });
  }

  private _cornersToggleChanged(ev: CustomEvent): void {
    if (!this._config) return;
    const showCorners = ev.detail.value.use_corners as boolean;
    this._appearance = { ...this._appearance, showCorners };
    if (!showCorners) {
      const { corners: _removed, ...rest } = this._config;
      this._emit(rest as M3VacuumMaintenanceCardConfig);
    }
  }

  private _cornerPresetChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const patch = cornerPresetPatch(ev.detail.value[key] as string);
    this._appearance = {
      ...this._appearance,
      cornerCustom: { ...this._appearance.cornerCustom, [key]: patch.custom },
    };
    if (patch.px !== undefined) {
      this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: patch.px } });
    }
  }

  private _cornerValueChanged(key: string, ev: CustomEvent): void {
    if (!this._config) return;
    const px = ev.detail.value[key] as number;
    this._emit({ ...this._config, corners: { ...(this._config.corners ?? {}), [key]: px } });
  }

  protected render() {
    if (!this.hass || !this._config) return nothing;
    const cfg = this._config;

    const deviceData = { entity: cfg.entity ?? "", name: cfg.name ?? "", icon: cfg.icon ?? "" };
    const thresholdData = {
      warn_below: cfg.warn_below ?? VACUUM_PART_WARN_BELOW,
      alert_below: cfg.alert_below ?? VACUUM_PART_ALERT_BELOW,
    };
    const displayData = {
      show_station: cfg.show_station ?? true,
      show_stats: cfg.show_stats ?? true,
      show_settings: cfg.show_settings ?? false,
      show_reset: cfg.show_reset ?? false,
      collapsible: cfg.collapsible ?? false,
      default_collapsed: cfg.default_collapsed ?? false,
    };

    return html`
      <div class="editor">
        <ha-expansion-panel outlined .header=${this._t("editor_vacuum_device")} expanded>
          <ha-icon slot="leading-icon" icon=${DEFAULT_VACUUM_MAINT_ICON}></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${deviceData}
              .schema=${this._deviceSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_vacuum_entity_hint")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_vacuum_maint")} expanded>
          <ha-icon slot="leading-icon" icon="mdi:gauge"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${thresholdData}
              .schema=${this._thresholdSchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_vacuum_display")}>
          <ha-icon slot="leading-icon" icon="mdi:view-list-outline"></ha-icon>
          <div class="panel-content">
            <ha-form
              .hass=${this.hass}
              .data=${displayData}
              .schema=${this._displaySchema()}
              .computeLabel=${this._computeLabel}
              @value-changed=${this._valueChanged}
            ></ha-form>
            <div class="hint">${this._t("editor_vacuum_reset_hint")}</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._t("editor_progress_colors")}>
          <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
          <div class="panel-content">
            ${colorRow(this._t("editor_search_accent_color"), cfg.accent_color, (v) =>
              this._colorChanged("accent_color", v),
            )}
            ${colorRow(this._t("editor_progress_text_color"), cfg.text_color, (v) =>
              this._colorChanged("text_color", v),
            )}
            ${colorRow(this._t("editor_progress_card_background"), cfg.card_background, (v) =>
              this._colorChanged("card_background", v),
            )}
          </div>
        </ha-expansion-panel>

        ${renderAppearanceSection({
          hass: this.hass,
          language: this._language,
          config: cfg,
          defaultRadius: DEFAULT_VACUUM_RADIUS,
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

  static styles = editorStyles;
}

declare global {
  interface HTMLElementTagNameMap {
    "m3-vacuum-maintenance-card-editor": M3VacuumMaintenanceCardEditor;
  }
}
