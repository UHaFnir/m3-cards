---
title: M3 Vacuum Maintenance Card
type: m3-vacuum-maintenance-card
category: household
display: Vacuum maintenance
summary: What is wearing out on a robot vacuum, what its dock can be told to do, and what it has done so far
table_order: 16
section_order: 41
---

The other half of the vacuum pair: wear counters, dock actions and lifetime
totals.

```yaml
type: custom:m3-vacuum-maintenance-card
entity: vacuum.dobby
```

Only the vacuum is named. The consumable sensors, the dock switches and the
totals are found from it — including the ones on the **dock**, which Roborock
registers as a second device linked by neither `via_device` nor
`parent_device`. The card follows the identifier instead, so the strainer and
the cleaning brush turn up beside the vacuum's own brushes rather than going
missing.

## Why this is a separate card

Wear counters are read once a month. Suction and Start are read every day.
Putting them on one card buries the daily thing under the monthly one — so
they are two, and the control card's `popup` is how they stay one tap apart:

```yaml
type: custom:m3-vacuum-card
entity: vacuum.dobby
popup:
  size: wide
  content:
    type: custom:m3-vacuum-maintenance-card
    entity: vacuum.dobby
```

## The bars need a total, and the sensors do not give one

Roborock reports hours *remaining*, never a percentage, so a bar needs a
service life to divide by. The card carries the documented ones — main brush
300 h, side brush 200 h, filter 150 h, sensors 30 h, dock strainer and cleaning
brush 150/300 h — and a part it has no figure for shows its hours **without** a
bar rather than a bar against an invented denominator. `max_hours` per
consumable overrides any of them.

A part past its life reports a negative number of hours. That reads as
"overdue", not as "−12 h".

## About the reset buttons

Home Assistant ships Roborock's six consumable-reset buttons **disabled**. The
card cannot press what does not exist, so `show_reset` is off by default and the
reset stays unavailable until the button is enabled under *Settings → Devices →
Entities*.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | — | **Required.** The `vacuum` entity. Everything else is found from it. |
| `name` | string | "Maintenance" | Header title. |
| `icon` | string | `mdi:tools` | Header icon. |
| `consumables` | list | discovered | Replaces the automatic list. Each entry takes `key` or `entity`, plus `name`, `icon`, `max_hours`. |
| `warn_below` | number | `25` | Percent of service life at which a part turns amber. |
| `alert_below` | number | `10` | …and red. |
| `show_station` | boolean | `true` | The dock action tiles. |
| `show_stats` | boolean | `true` | Runtime, area and run count. |
| `show_settings` | boolean | `false` | Child lock, do-not-disturb and volume. |
| `show_reset` | boolean | `false` | Long-press a part to reset its counter. See above. |
| `collapsible`, `default_collapsed`, `collapse_state_entity`, `collapse_memory` | — | — | Folds everything below the header, as on the room and heading cards. |
| `accent_color`, `text_color`, `secondary_text_color`, `card_background`, `glass_background`, `radius`, `corners`, `card_version` | — | — | The usual shared appearance options. |

Only blocks whose entities exist are drawn, so a vacuum without a dock shows
its four own consumables and nothing else.
