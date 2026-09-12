---
title: M3 Printer Card
type: m3-printer-card
category: household
display: 3D printer
summary: A 3D printer as one card instead of sixteen tiles — state, job and controls, with the layout following what the machine is doing
table_order: 17
section_order: 42
---

A 3D printer spends most of its life idle, and a dashboard built from one tile
per sensor spends most of its life saying "unavailable" sixteen times. This
card is the other approach: **the state decides what is drawn.**

```yaml
type: custom:m3-printer-card
entity: sensor.p1s_current_stage
```

Built against Bambu Lab's integration and not tied to it — every block beyond
the header and the buttons is optional and appears only when its entities
exist, and the one thing that would otherwise hard-code a vendor is
configurable. See `state_map` below.

## What the state changes

| State | What the card shows |
| --- | --- |
| **printing / paused** | Everything: job, progress, layer count, controls |
| **idle / finished** | No progress bar, no percentage, no layer count; the controls become Start |
| **error** | A red outline, and the primary button becomes *Acknowledge error* |
| **offline** | Dimmed, and **no controls at all** — nothing sent would arrive |

Offline is grey rather than red on purpose: a printer switched off at the wall
is a normal state, not a fault, and colouring it as one trains people to ignore
red. The way back is the socket switch in the details block, which is why that
block stays live when everything else does not.

## `state_map`, and why it exists

Every integration words this differently. Bambu Lab reports a *stage* with
dozens of values, OctoPrint reports `Printing`/`Operational`, Moonraker reports
Klipper's `printing`/`complete`/`standby`, Prusa Connect something else again.
There is no set of strings that covers all four.

So the card resolves a status in three passes: **your `state_map` first**, then
a table of values seen in the wild, then substring rules. That last pass is why
`heatbed_preheating`, `filament_loading` and `auto_bed_leveling` all read as
"printing" without being listed — a vendor adds more of those with every
firmware, and a list would guarantee missing one.

A value nothing recognises reads as **idle**, never as an error. A vague status
line is better than a red frame around a healthy machine.

```yaml
type: custom:m3-printer-card
entity: sensor.printer_status
state_map:
  beschaeftigt: printing
  wartet: paused
  bereit: idle
```

## Options in this version

The card is being built in stages; this covers the header and the controls.
The camera, progress, temperatures, speed profile, AMS and details blocks
follow.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | — | **Required.** The status or stage entity whose value drives the layout. |
| `state_map` | object | — | Raw status values onto `printing`, `paused`, `idle`, `finished`, `error`, `offline`. |
| `name` | string | job name | Header title. Falls back to the job name, then to "No job". |
| `strip_extension` | boolean | `true` | Drops `.3mf`/`.gcode` from the job name. |
| `icon` | string | follows the state | Overrides the header icon. |
| `secondary_actions` | list | `[stop, files, filament]` | Which small buttons appear: `stop`, `files`, `filament`, `preheat`. |
| `confirm_stop` | boolean | `true` | Stop asks twice. See below. |
| `pause_action`, `resume_action`, `stop_action`, `start_action`, `files_action`, `filament_action`, `preheat_action` | action | — | Full Home Assistant action syntax. Without one, the button opens more-info rather than guessing at a service. |
| `stage_entity`, `progress_entity`, `remaining_entity`, `layer_entity`, `total_layers_entity`, `job_name_entity`, `online_entity`, `error_entity` | string | discovered | Override any entity the automatic lookup got wrong. |
| `optimistic_timeout` | number | `35000` | How long a tapped state is shown before the card stops waiting for confirmation. |
| `accent_color`, `text_color`, `card_background`, `glass_background`, `radius`, `corners`, `card_version` | — | — | The usual shared appearance options. |

## Stop asks twice

A stop throws away hours of work and a spool's worth of filament, and the
button sits next to Pause. The first tap arms it — the button turns solid red
and says *Really stop?* — and only the second one sends. The arming expires
after a few seconds, so an ignored tap does not leave the card primed.
`confirm_stop: false` removes the step.

## Finding the entities

Companion entities are looked up on the printer's own device, and on any device
registered *through* it — which is how an AMS unit is reached, since Bambu
registers those separately.

Three passes, because integrations differ in what they bother to declare: the
entity registry's translation key first, the entity id second, a device class
third. That last one is what finds OctoPrint's temperatures, which carry no
recognisable name but do say what they are.

## Environment sensors belong elsewhere

Enclosure temperature, filament dryer, AMS humidity — those are climate
readings, and the suite already has a card that draws climate readings well.
Put them in [M3 Climate Overview Card](#m3-climate-overview-card) rather than
here; this card is about the job.
