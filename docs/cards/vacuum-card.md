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
| `show_map` | boolean | `true` | The live map preview. |
| `map_height` | number | `300` | Height of the map preview in px. The picture is letterboxed inside it, so this is what decides how large the floor plan reads. |
| `show_mop_intensity` | boolean | `true` | The mop-intensity scale. |
| `show_mop_mode` | boolean | `false` | The mop-route scale. Off by default — it is rarely changed. |
| `show_station_chips` | boolean | `true` | The dock and mop status chips. |
| `max_chips` | number | `4` | How many chips before the rest collapse into "+n". Errors are never collapsed. |
| `buttons` | list | — | Free buttons: `entity`, optional `name`, `icon`, `tap_action`. The service follows the entity's domain. |
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
