---
title: M3 Lights Dimmer Overview Card
type: m3-lights-dimmer-overview-card
category: light
display: Lights Dimmer Overview
summary: Large tap-to-toggle, drag-to-dim tiles for lights or rooms
table_order: 4.5
section_order: 36.5
---

Large tiles built on the same wave slider as the Light card, but sized for a
whole overview: **tap** toggles a light (Home Assistant restores its last
brightness), **drag** sets it. One tile per light or per room, laid out in a
row of horizontal bars or a strip of vertical columns, with more tiles than
fit scrolling rather than being cut off. It shares its entity filter and
room grouping with Lights Overview above, and can also stand in as that
card's popup.

<img src="docs/images/lights-dimmer-overview-card.png" alt="Lights Dimmer Overview Card" width="440">
<img src="docs/images/lights-dimmer-overview-card-vertical.png" alt="Lights Dimmer Overview Card, vertical" width="440">

<details>
<summary>Configuration, examples & options</summary>

```yaml
type: custom:m3-lights-dimmer-overview-card
auto_discover: true
```

Horizontal, four rows visible at a time:

```yaml
type: custom:m3-lights-dimmer-overview-card
auto_discover: true
view: entities
orientation: horizontal
max_items: 4
```

Vertical, one column per room:

```yaml
type: custom:m3-lights-dimmer-overview-card
auto_discover: true
view: rooms
orientation: vertical
max_items: 3
```

### Entity source and room grouping

Same vocabulary as [Lights Overview](#m3-lights-overview-card): `auto_discover`
(default `true`) groups every `light` entity with an area into that area's
tile, filterable with `include_area` / `exclude_entities` / `include_labels`
/ `exclude_labels` / `include_state` / `exclude_state`, or list `rooms`
manually instead. `group_handling` resolves a `light.group` and its members
the same way. `toggle_filter` / `exclude_toggle_entities` /
`toggle_inherit_filters` / `toggle_group_handling` narrow what a tile's
tap/drag actually controls, separately from what it shows.

- **`view`**: `entities` (default, one tile per light) or `rooms` (one tile
  per room — the drag sets every dimmable light in the room at once via a
  single service call, the tap toggles all of them, and the shown percentage
  is the average brightness of the ones currently on).

### Layout

- **`orientation`**: `horizontal` (default, wide rows stacked in a list) or
  `vertical` (a single row of tall columns).
- **`columns`**: horizontal only — how many columns of rows. Ignored (and
  hidden in the editor) for `vertical`, which is always a single row of
  columns.
- **`tile_size`**: a tile's thickness (horizontal) or length (vertical), in
  px. Defaults to 64 / 180.
- **`max_items`**: how many tiles are visible at once. More tiles than that
  scroll rather than being cut off — vertically for `horizontal`, horizontally
  for `vertical` — so the scroll direction always runs across the slider's
  own drag axis and never fights it.

### Dimming behavior

- **`update_mode`**: `live` (default) throttles a `light.turn_on` call to at
  most one every 200ms while dragging, plus the final value on release.
  `release` sends exactly one call, on release only.
- **`transition`**: seconds, passed through to `light.turn_on`.
- A non-dimmable member (a `switch`, or an onoff-only light) only understands
  on/off: dragging its tile has no effect below turning it on, the same as
  it not being switched off by dragging to the low end.

### Tap, hold and appearance

`tap_action` (default `toggle`) / `hold_action` (default `more-info`) /
`double_tap_action` (default `none`) — no `popup` action kind here, since the
card is already what Lights Overview's own `popup.mode: dimmer` opens (see
below); nesting a popup inside a popup would be a trap with no way out.
`use_light_color` accents a light's own tile with its current `rgb_color`
instead of the card's configured accent — like the Light card's slider.

### As a Lights Overview popup

Set `popup.mode: dimmer` on [Lights Overview](#m3-lights-overview-card) to open
this card, scoped to the tapped room, instead of the default grid popup:

```yaml
type: custom:m3-lights-overview-card
auto_discover: true
tap_action: { action: popup }
popup:
  mode: dimmer
  dimmer: { orientation: vertical, max_items: 8, update_mode: release }
```

`popup.dimmer` accepts `orientation`, `columns`, `tile_size`, `max_items`,
`update_mode`, `transition` and the `show_*` options — display and behavior
only; the entity filter is always scoped from the tapped room, the same way
`popup.mode: default-grid` scopes itself.

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `auto_discover` | boolean | `true` | Automatic discovery of lights by area |
| `include_domains` | list | `["light"]` | Which domains auto-discovery sweeps |
| `include_area` / `exclude_area` | list\<string\> | – | Filter for auto-discovery |
| `include_entities` / `exclude_entities` | list\<string\> | – | Entity filter for auto-discovery |
| `include_labels` / `exclude_labels` | list\<string\> | – | Label filter for auto-discovery |
| `include_state` / `exclude_state` | list\<string\> | – | State filter |
| `group_handling` | `all` \| `prefer_groups` \| `prefer_members` | `all` | How a `light.group` and its members are counted |
| `rooms` | list (`name`, `icon`, `entities`, `toggle_entities`) | – | Manual room list instead of auto-discovery |
| `hide_empty_rooms` | boolean | `false` | Drop rooms with no matching lights |
| `toggle_filter` | object (same fields as the display filter) | – | Narrower filter for what a tile's tap/drag actually controls |
| `exclude_toggle_entities` | list\<string\> | – | Shorthand: show these, but never switch them |
| `toggle_inherit_filters` | boolean | `true` | Whether `toggle_filter` narrows the display filter or stands alone |
| `toggle_group_handling` | `all` \| `prefer_groups` \| `prefer_members` | `group_handling` | `group_handling`, applied to the toggle/drag set instead |
| `view` | `entities` \| `rooms` | `entities` | Tile per light, or per room |
| `orientation` | `horizontal` \| `vertical` | `horizontal` | Rows of tiles, or a strip of columns |
| `columns` | number | `1` | Horizontal only: columns of rows |
| `tile_size` | number (px) | 64 / 180 | Tile thickness (horizontal) or length (vertical) |
| `max_items` | number | – (all visible) | Visible tiles before the rest scroll |
| `update_mode` | `live` \| `release` | `live` | Throttled calls while dragging, or one call on release |
| `transition` | number (s) | – | Passed through to `light.turn_on` |
| `name` / `icon` | string | "Dim lights" / `mdi:lightbulb-group` | Header |
| `show_header` | boolean | `true` | Card header |
| `show_name` / `show_icon` / `show_state` | boolean | `true` | Tile content |
| `show_area` | boolean | `true` in `entities` view | Room name caption |
| `strip_area_from_name` | boolean | `true` | `entities` view only: drops the area's own name out of a light's shown name ("Licht Wohnzimmer" → "Licht") |
| `use_light_color` | boolean | `true` | Accent a tile with the light's own color |
| `tap_action` / `hold_action` / `double_tap_action` | action config | toggle / more-info / none | Tap/hold/double-tap actions |
| `accent_color` / `off_color` / `track_color` | string | theme default | Slider colors, as on the Light card |
| `text_color` / `secondary_text_color` | string | theme default | Tile text vs. secondary text |
| `card_background` | string | glass/solid background | Card background |
| `animation` / `wave_style` | `auto`\|`on`\|`off` / `wavy`\|`flat` | `auto` / `wavy` | Wave animation and shape |
| `glass_background` | boolean | `true` | Frosted glass background |
| `radius` / `corners` | number / object | `28` | Corner radius, optional per corner |

</details>
