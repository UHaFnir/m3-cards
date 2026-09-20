# M3 Cards 2.4.0

**Upgrading:** no configuration option was removed or renamed, so existing
configs load unchanged. Two things look different without having been asked
for: the aquarium card's schedule bar is redrawn in the shape the suite's other
sliders use, and a chip button for a scene, a script or a button no longer
prints a state under its name. See "Behaviour changes" at the end.

The machines release. Four of the five new cards are about something that runs
a job and then stops: a robot vacuum and its maintenance, a 3D printer, and the
household appliances that were previously a row of tiles saying "Standby". They
share one idea — **the state decides what is drawn** — because a machine that is
idle has nothing to say about progress, and a dashboard that keeps the field
there anyway spends most of its life displaying a dash.

Alongside them, the suite-wide change: **every card's own string fields take
Jinja2 templates now.** A name, an icon, a colour, a label — anything a card
reads out of its own config — is subscribed over Home Assistant's
`render_template` websocket and pushed a new value when anything it reads
changes. Until now a composed label meant a template sensor in
`configuration.yaml` for every card that wanted one.

The suite registers 44 cards.

### Added

- **M3 Vacuum Card** (`m3-vacuum-card`) — the robot itself: where it is, what
  it is doing, and the handful of controls anyone presses. Every command is
  drawn optimistically, because the integration polls every thirty seconds and
  pushes nothing; a tap that changed nothing for half a minute read as a broken
  button. Rooms are chips built from `vacuum.clean_area`, offered only when the
  machine's capability bits say it can honour them. Suction and mop get the
  suite's Expressive sliders. The map is a plain picture on the card, with a
  magnifier that opens it full-screen — pinching it in place would have needed
  the same touch handling that stops the dashboard scrolling past it. The dock
  is discovered as the separate device it is — without that the card loses the
  tanks, the dust emptying and the mop washing.

- **M3 Vacuum Maintenance Card** (`m3-vacuum-maintenance-card`) — filters,
  brushes, sensors and mop with the life they have left, plus **reminders for
  the chores nothing counts**. "Change the mop every three runs" is not a
  sensor; the card works out when it is due, shows it, and lets it be ticked
  off at any point, not only once it nags. The `input_number` that makes that
  possible is created by the reminder's own editor, set to today's meter
  reading. `show_reset` adds a reset button to each part row, behind a
  confirmation. Both vacuum cards can build real Home Assistant automations
  from their editors.

- **M3 Printer Card** (`m3-printer-card`) — a 3D printer as one card instead of
  sixteen tiles. Built against Bambu Lab's integration and deliberately not tied
  to it: `state_map` and a three-pass resolver mean OctoPrint, Moonraker and
  Prusa Connect land in the right blocks too, and a value nothing recognises
  reads as idle rather than as an error. The camera is a still, not a stream,
  and the badge says so. The socket the printer hangs on stays usable while
  everything else dims — it is the one control that can bring the machine back.
  Pause, resume and stop press the integration's own buttons with nothing
  configured, and the card folds from its header the way the vacuum cards do.

- **M3 Appliance Card** (`m3-appliance-card`) — washing machine, dryer, oven,
  fridge, coffee machine, litter robot, printer, NAS: the machines that have a
  job, a phase and a finish time, with a card that shows the phase while it runs
  and gets out of the way when it does not.

- **M3 Search Card** (`m3-search-card`) — a Material 3 search field over
  entities, areas and devices, with a quick bar that opens on the result.

- **Jinja2 templates in every card's own string fields.** Templates inside a
  *nested* card config are deliberately left alone and handed to that card
  verbatim — it renders them itself, and it renders them live.

- **A compact mode for the light card** (`compact: true`), which drops the power
  button and makes the header icon the toggle — the split the native tile card
  makes. It is about horizontal room in a two-column grid.

- Smaller ones: `show_color_temp` for the light card, an action on the room
  card's header, a configurable tap and hold on the presence card with both in
  its editor, per-person popups there, a popup for the appliance card, and
  `source: synology_dsm` for the NAS card.

### Changed

- **The shared popup chrome takes a title and a size.** Both opt-in; a caller
  that passes neither renders exactly as before.

- **The presence card's `hold_action` runs through the shared handler.** It used
  to implement two kinds itself and silently ignore the rest, so `more-info`,
  `toggle` and `perform-action` did nothing and nothing said so.

- **The status rule matcher and the domain → default-action mapping are shared
  helpers**, rather than private methods on two cards that both needed the same
  answers.

- **The NAS card's notification setup resolves volumes through the card's own
  discovery**, so an m3-system-card's "volume full" trigger finds something to
  watch.

- **The vacuum cards use the suite's header and fold chevron** instead of
  hand-rolled copies. The chevron now lives in one place, so the next card that
  folds inherits it.

### Fixed

- **Closing a card's dialog no longer scrolls the dashboard away.** It jumped to
  whatever had focus last — on a phone, often a slider tapped minutes earlier —
  because a tap on a card's header does not move focus there. The card now takes
  focus before it opens a dialog, so closing it leaves you where you were.

### Behaviour changes

- **The aquarium card's schedule bar is redrawn.** Same data, same behaviour —
  it is now the same geometry as the suite's discrete sliders, with real gaps
  either side of each handle, so the aquarium's day and the vacuum's suction
  scale read as one control rather than two designs in one suite.

- **A chip button for a stateless domain no longer prints a state.** A scene
  showed a timestamp and a script showed "off", neither of which says anything.
  `show_state: true` brings it back for anyone who wants it.

- **A chip button with no `tap_action` now does what its entity is for.** It
  opened more-info for every domain, so a chip labelled "Vollreinigung" pointing
  at a script opened a dialog with a Press button in it instead of cleaning.
  Scripts start, buttons press, switches toggle, and anything without an obvious
  verb still opens more-info — the mapping the button card has always used.
  `tap_action: more-info` restores the old behaviour per chip.
