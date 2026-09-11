---
title: M3 Vacuum Card
type: m3-vacuum-card
category: household
display: Vacuum
summary: A robot vacuum: state, battery, start/pause and suction, with every companion entity found on the device
table_order: 15
section_order: 40
---

A control surface for a robot vacuum, built against the Roborock integration
and usable with any `vacuum` entity.

Only `entity` is required. Everything else the card draws — the map, the
progress, the mop controls, the dock chips — is looked up on the vacuum's own
device and simply left out when it is not there, so a Valetudo, Dreame or
Xiaomi vacuum gets the header, the buttons and the suction row without being
asked to support anything it cannot.

```yaml
type: custom:m3-vacuum-card
entity: vacuum.sushi
```

## What it draws today

The header carries the state as a colour — cleaning blue, docked green, paused
amber, returning violet, an error red — with the vacuum's own status text
underneath and a battery chip on the trailing end. Under it the primary button
follows the state (**Start**, **Pause**, **Resume**), flanked by two smaller
ones, and below that a row of suction pills built from the entity's own
`fan_speed_list`.

The suction pills draw four rising bars rather than spelling the level out.
The names are vendor vocabulary — "Balanced", "Turbo", "Max+", "Custom" — which
does not sort, does not translate consistently and does not fit a 42px pill.

## Folding it away

`collapsible: true` gives the header a chevron that folds the map, the scales,
the buttons and the chips. What stays is the line you actually glance at — the
state, the battery and Start/Pause — which is the split worth making on a
dashboard where the vacuum is not the main event.

The fold is remembered the same way the room and heading cards remember theirs:
per device by default, per session with `collapse_memory: session`, or in an
`input_boolean` via `collapse_state_entity`, which survives a different browser
and lets an automation fold it.

## Everything else, one tap away

`popup` puts any Lovelace card behind the header — the maintenance card, the
history, every routine the vendor's app has. The tile stays a summary and the
detail stops competing with it for space.

```yaml
type: custom:m3-vacuum-card
entity: vacuum.dobby
popup:
  size: wide
  content:
    type: custom:m3-vacuum-maintenance-card
    entity: vacuum.dobby
```

With a popup configured, a tap on the header opens it instead of more-info; an
explicit `tap_action` still wins over both.

## Naming states yourself

`states` maps the vacuum's own state onto a label, an icon and a colour, first
match wins. It exists for two cases: a brand whose vocabulary this card has
never seen, and a word you simply want different.

```yaml
type: custom:m3-vacuum-card
entity: vacuum.dobby
collapsible: true
states:
  - value: docked
    label: Steht in der Station
    icon: mdi:sleep
  - regex: "clean"
    label: Unterwegs
    color: "#85b7eb"
```

A rule's label wins over the status sensor, which is what makes it useful as an
override rather than only as a fallback.

## Three things worth knowing about Roborock

**It polls every 30 seconds and pushes nothing.** A tap on Start therefore
changes no state the card can see for up to half a minute. Rather than look
broken, the card paints the state it just asked for and reconciles on the next
poll, dimming the button slightly while it is showing something unconfirmed. If
the confirmation never comes — the dock was blocked, the command was lost — the
guess expires on its own after about two polls and the real state comes back.
`optimistic_timeout` changes that window for a slower integration.

**"Local polling" still needs the cloud.** The integration talks to the vacuum
over the local network, but it cannot log in without reaching Roborock's
servers, and the vacuum locks its own local API when it has no internet. An
offline install is not possible today.

**It disconnects briefly, often.** The card paints an unreachable vacuum grey
rather than red. Red is reserved for an actual error, so that it keeps meaning
something.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | — | **Required.** The `vacuum` entity. |
| `name` | string | entity name | Header title. |
| `icon` | string | follows the state | Overrides the header icon. |
| `collapsible` | boolean | `false` | Folds everything below the primary buttons. State, battery and Start/Pause stay in view. |
| `default_collapsed` | boolean | `false` | Whether it starts folded. |
| `collapse_state_entity` | string | — | An `input_boolean` holding the fold, so it survives a different browser and an automation can fold it. |
| `collapse_memory` | `device` \| `session` | `device` | Where the fold is remembered without a helper entity. |
| `states` | list | — | Custom status texts. First match wins; each rule takes `value`/`regex`/`above`/`below` plus `label`, `icon`, `color`. |
| `show_map` | boolean | `true` | The live map preview. |
| `map_height` | number | `300` | Height of the map preview in px. The picture is letterboxed inside it, so this is what decides how large the floor plan reads. |
| `show_mop_intensity` | boolean | `true` | The mop-intensity scale. |
| `show_mop_mode` | boolean | `false` | The mop-route scale. Off by default — it is rarely changed. |
| `show_station_chips` | boolean | `true` | The dock and mop status chips. |
| `max_chips` | number | `4` | How many chips before the rest collapse into "+n". Errors are never collapsed. |
| `buttons` | list | — | Free buttons. The suite's chip buttons, so each takes `entity`, `name`, `icon`, `color`, `show_state`, `tap_action`, `hold_action`, `double_tap_action`. |
| `buttons_wrap`, `buttons_stretch`, `buttons_justify` | — | wrap | Layout of that row, as on the chip-buttons card. |
| `popup` | object | — | A popup with any card inside: `content`, optional `title` and `size` (`normal`, `wide`, `fullscreen`). A tap on the header opens it. |
| `show_fan_speed` | boolean | `true` | The suction row. Hidden anyway when the vacuum reports fewer than two speeds. |
| `secondary_actions` | list | `[return_to_base, locate]` | The two buttons beside the primary one: `return_to_base`, `locate`, `stop`. |
| `optimistic_timeout` | number | `70000` | How long, in milliseconds, a tapped state is shown before the card stops waiting for confirmation. |
| `status_entity` | string | discovered | The status sensor whose text the header shows. |
| `accent_color` | string | the state colour | Pins the card to one colour instead of letting the state pick it. |
| `text_color`, `secondary_text_color`, `card_background`, `glass_background`, `radius`, `corners`, `card_version` | — | — | The usual shared appearance options. |

Every companion entity can also be named explicitly — `map_entity`,
`mop_mode_entity`, `mop_intensity_entity`, `empty_mode_entity`,
`progress_entity`, `area_entity`, `time_entity`, `volume_entity`,
`child_lock_switch`, `dnd_switch` — which is only needed when the automatic
lookup picks the wrong one, or when the entity lives on a different device.

The lookup matches on the entity registry's translation key before falling back
to the entity id, so renaming an entity does not hide it from the card.
