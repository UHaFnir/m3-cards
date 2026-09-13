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
| **idle / finished** | No progress bar, no percentage, no layer count, and no primary button unless a `start_action` is configured |
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

## Entity mapping per integration

Everything below is found automatically when the integration names things
recognisably; the table is what to put in the **Sensors** section when it does
not.

| What the card wants | Bambu Lab | OctoPrint | Moonraker / Klipper | Prusa Connect |
| --- | --- | --- | --- | --- |
| `entity` (drives the layout) | `sensor.*_current_stage` | `sensor.*_current_state` | `sensor.*_printer_state` | `sensor.*_printer_state` |
| Progress | `sensor.*_print_progress` | `sensor.*_job_percentage` | `sensor.*_progress` | `sensor.*_progress` |
| Remaining | `sensor.*_remaining_time` | `sensor.*_time_remaining` | `sensor.*_print_time_left` | `sensor.*_remaining` |
| Job name | `sensor.*_task_name` | `sensor.*_current_file` | `sensor.*_filename` | `sensor.*_filename` |
| Nozzle | `sensor.*_nozzle_temperature` | `sensor.*_tool0_temperature` | `sensor.*_extruder_temperature` | `sensor.*_nozzle_temperature` |
| Bed | `sensor.*_bed_temperature` | `sensor.*_bed_temperature` | `sensor.*_heater_bed_temperature` | `sensor.*_bed_temperature` |
| Camera | `image.*_camera` | `camera.*` | `camera.*` | — |
| Speed profile | `select.*_printing_speed` | — | — | — |
| AMS | `sensor.*_tray_1_*` … | — | — | — |

OctoPrint sets no translation keys, so its temperatures are found by device
class instead — that third pass exists for exactly this case.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `entity` | string | — | **Required.** The status or stage entity whose value drives the layout. |
| `state_map` | object | — | Raw status values onto `printing`, `paused`, `idle`, `finished`, `error`, `offline`. |
| `name` | string | job name | Header title. Falls back to the job name, then to "No job". |
| `strip_extension` | boolean | `true` | Drops `.3mf`/`.gcode` from the job name. |
| `icon` | string | follows the state | Overrides the header icon. |
| `secondary_actions` | list | `[stop, files, filament]` | Which small buttons appear: `stop`, `files`, `filament`, `preheat`. |
| `confirm_stop` | boolean | `true` | Stop asks first, in a dialog. See below. |
| `confirm_power_off` | boolean | `true` | So does switching an accessory **off**. Switching one on never asks. |
| `pause_action`, `resume_action`, `stop_action`, `start_action`, `files_action`, `filament_action`, `preheat_action` | action | — | Full Home Assistant action syntax. Without one, the button opens more-info rather than guessing at a service. `start_action` additionally decides whether a Start button exists at all — see below. |
| `stage_entity`, `progress_entity`, `remaining_entity`, `layer_entity`, `total_layers_entity`, `job_name_entity`, `online_entity`, `error_entity` | string | discovered | Override any entity the automatic lookup got wrong. |
| `optimistic_timeout` | number | `35000` | How long a tapped state is shown before the card stops waiting for confirmation. |
| `show_camera`, `camera_entity`, `camera_live`, `camera_refresh`, `light_entity` | — | — | The chamber view. A still by default — see below. |
| `show_progress`, `show_temps`, `show_speed`, `show_ams`, `show_details` | boolean | `true` | The blocks. Each also disappears on its own when its entities are missing. |
| `details_default_open` | boolean | `false` | Whether the drawer starts open. |
| `filament_warn` | number | `40` | Percent below which a tray's bar turns amber. |
| `ams_slots` | list | discovered | Per tray: `type_entity`, `color_entity`, `remaining_entity`. |
| `accessories` | list | — | Switches beside the printer: `entity`, `name`, `icon`, `color`, `power_entity`. |
| `nozzle_temp_entity`, `nozzle_target_entity`, `bed_temp_entity`, `bed_target_entity`, `chamber_temp_entity`, `speed_entity`, `start_time_entity`, `end_time_entity`, `power_entity`, `camera_entity`, `light_entity` | string | discovered | Override any lookup that got it wrong. |
| `accent_color`, `text_color`, `card_background`, `glass_background`, `radius`, `corners`, `card_version` | — | — | The usual shared appearance options. |

## There is no Start button

Nobody starts a print from Home Assistant. A job is sliced, sent to the machine
and started at the machine or in the slicer; a dashboard has no file to print
and no way to pick one. An idle printer therefore gets **no primary button** —
the control row is its secondary buttons alone, which is the honest shape.

The exception is a setup where starting *does* mean something: a queue
integration, a Klipper macro, a "print the last file again" script. Configure
`start_action` and the button comes back.

```yaml
start_action:
  action: perform-action
  perform_action: script.print_last_job
```

## Stop and power-off ask first

A stop throws away hours of work and a spool's worth of filament, and the
button sits next to Pause on a surface people tap while walking past it. So it
opens a dialog naming what is about to be lost, with Cancel under the thumb and
the red confirm beside it. `confirm_stop: false` removes the step.

Switching an accessory **off** asks the same way, because the accessory that
matters is the socket and cutting it mid-job ends the job.
`confirm_power_off: false` removes that one.

Switching an accessory **on** never asks, and that asymmetry is deliberate: it
costs nothing, and it is the one control that still works while the printer is
unreachable. Making the way back slower would be the wrong trade.

This replaced an older two-tap arm — tap once to turn the button red, again to
send. That is not a confirmation: it asks the same question twice and never
says what the answer costs, and two stray taps in the same spot still sent it.

## The camera is a still, not a stream

`camera_live` is off by default, and deliberately. A printer's camera runs on
the printer's own CPU and bandwidth, and a dashboard left open on a wall tablet
would hold a stream open for hours while the machine has better uses for both.
The still refreshes every ten seconds, and only while the card is actually on
screen — a layer takes longer than that anyway.

An `image` entity is preferred over a `camera` one when the device offers both,
because an image entity's state is the timestamp of the picture: the browser
then refetches exactly when there is something new and never otherwise.

## Accessories, and why they outlive "offline"

`accessories` are the switches that belong *with* the printer but not *to* it —
the socket it is plugged into, the AMS heater, a filament dryer. They live in
the details drawer, which is the one block that stays usable while the printer
is offline.

That is the whole point. Every other control is hidden when the machine is
unreachable, because nothing sent would arrive; the socket is how it comes
back.

```yaml
accessories:
  - entity: switch.drucker_steckdose
    name: Drucker-Steckdose
    icon: mdi:power-plug
    power_entity: sensor.drucker_steckdose_power
  - entity: switch.ams_heizung
    name: AMS-Heizung
    icon: mdi:radiator
```

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
