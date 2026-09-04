# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
Versionierung folgt [SemVer](https://semver.org/lang/de/).

## [Unreleased]

### Added

- **Jinja2 templates in every card's own string fields.** A field containing
  `{{` or `{%` — a name, an icon, a colour, whatever that card reads out of its
  config — is now subscribed over Home Assistant's `render_template` websocket
  and pushed a new value whenever anything it reads changes. Until now a card
  could show a fixed string or one entity's raw state and nothing else, so a
  composed label meant a template-sensor helper in `configuration.yaml` for
  every card that wanted one, and a dashboard moved over from mushroom lost
  every templated label, icon and colour it had.

  Templates inside a **nested** card config — `cards:`, a popup action's
  content, a mushroom card in a slot — are deliberately left alone and handed
  to that card verbatim. It renders them itself, and it renders them live;
  resolving them here would freeze the field at whatever it said when the outer
  card was configured. The walk stops at any nested object carrying its own
  `type`.

  Nothing changes for a card that uses no templates, and it costs nothing: no
  walk, no subscription, no copy of its config. The nav card keeps its own
  per-entry templates, including the boolean `hidden` / `disabled` fields.

- **The room card's header can run an action**, via a card-level `tap_action`.
  Until now the header either folded the card or did nothing, and the only
  action the card offered was `detail_path` on a long press of a category tile
  — so a room card on an overview had no way to be the door into that room's
  own view. `tap_action` takes the standard Home Assistant action config and
  goes through the same handler the heading and status cards use, so
  `navigate` and `url` behave as they do elsewhere, and `perform-action` does
  too when it names its own `target`. `more-info` and `toggle` cannot work
  here: a room is an area, not an entity, so there is no implied target to
  hand them, and both do nothing without one.

  A tap cannot both fold the card and open a view, so a configured
  `tap_action` takes the header over from the fold and the chevron goes with
  it — it promises a fold the header no longer performs. Everything else about
  `collapsible` is untouched: the stored state is still read and applied, so
  `collapse_state_entity` and an automation can still fold a card whose header
  navigates. Leaving `tap_action` unset changes nothing at all.

  ```yaml
  type: custom:m3-room-card
  area: living_room
  tap_action:
    action: navigate
    navigation_path: /lovelace/living-room
  ```

- **The presence card's tap is configurable**, via a card-level `tap_action`.
  A tap on a person was hardcoded to more-info, so a card meant to be the way
  into a person's own dashboard view could not be one. `tap_action` takes the
  standard Home Assistant action config, sits alongside the `hold_action` the
  card already had, and targets the person actually tapped — `more-info`,
  `toggle` and a service call that names no target of its own all land on that
  row's `entity_id`. Unset, a tap opens more-info exactly as before.

  ```yaml
  type: custom:m3-presence-card
  tap_action:
    action: navigate
    navigation_path: /lovelace/people
  ```

- **`tap_action` and `hold_action` are in the presence card's editor**, under
  a new Interactions section. `hold_action` had been in the config all along
  with no field to set it from, so it was YAML-only.

- **`show_color_temp` for the light card.** The colour temperature row appeared
  on every light that reports `color_temp`, and nothing could take it away —
  `color_temp_style` only chooses between the three presets and the continuous
  slider, it does not hide the row. On a view carrying dozens of light cards
  that row is height on every one of them, paid for by people who only ever
  drag the brightness. `show_color_temp: false` leaves it out. It defaults to
  `true`, so existing dashboards look exactly as they did, and it only ever
  removes the row — a light without colour temperature support still never
  shows one. In the editor the switch sits at the top of the **Colour
  temperature** section, with the style and preset fields below it; they are
  hidden while it is off, since they have nothing left to describe.

- **A new card: M3 Search Card** (`custom:m3-search-card`). A Material 3 search
  bar that sits on the dashboard itself and opens Home Assistant's own quick
  bar — the entity search by default, the command palette with
  `mode: command` — plus an optional trailing Assist button. It reads no
  entity and needs no configuration at all: `type: custom:m3-search-card` is a
  working card.

  The gap it fills is that Home Assistant's only search entry point is in the
  header, and the header's search button is not rendered at all on a narrow
  screen. On a phone or a wall tablet there is no way to reach the entity
  search from a dashboard except by keyboard, which those devices do not have.
  The header's Assist button goes the same way, which is why this card can
  carry one.

  It opens the dialog by replaying Home Assistant's own keyboard shortcut
  rather than by firing `show-dialog`, and that is not a shortcut of its own
  taking: `ha-quick-bar` is code-split out of the frontend's main bundle, and
  the only thing that pulls it in is the frontend's own caller, which hands the
  dialog manager an `import()` callback alongside the tag. A card loaded as its
  own Lovelace resource cannot name that module path, so a bare `show-dialog`
  lands on a custom element that was never defined and fails with "Unknown
  dialog type loaded". Replaying the key hands the lazy import back to the
  handler that owns it, and leaves the card depending on a shortcut that is
  user-visible and listed in Home Assistant's own `Shift+?` dialog rather than
  on an internal module path.

  Everything that can take those shortcuts away is checked rather than assumed,
  because a control that silently does nothing is worse than one that is not
  drawn: the per-user "keyboard shortcuts" profile switch (the bar dims and
  says so), the `conversation` integration Assist needs (no integration, no
  Assist button), and the fact that the command palette is registered for
  admins only (a non-admin gets the entity search, which is at least a search).

  ```yaml
  type: custom:m3-search-card
  ```

### Changed

- **The presence card's `hold_action` now runs through the shared action
  handler**, like every other card's. It used to implement `navigate` and `url`
  itself and silently ignore the rest, so a `hold_action` of `more-info`,
  `toggle` or `perform-action` did nothing — and nothing said so, since the
  editor offered no field for it. Those now work, `confirmation` is honoured,
  and the two kinds that already worked are unchanged.

### Hinzugefügt

- **Jinja2-Templates in allen eigenen Textfeldern jeder Karte.** Ein Feld mit
  `{{` oder `{%` — Name, Icon, Farbe, was die Karte eben aus ihrer
  Konfiguration liest — wird jetzt über den `render_template`-Websocket von Home
  Assistant abonniert und bekommt einen neuen Wert gepusht, sobald sich etwas
  ändert, das das Template liest. Bisher konnte eine Karte einen festen Text
  oder den rohen Zustand einer Entität zeigen und sonst nichts: Für jede
  zusammengesetzte Beschriftung brauchte es einen Template-Sensor-Helfer in der
  `configuration.yaml`, und ein von Mushroom übernommenes Dashboard verlor jede
  getemplatete Beschriftung, jedes Icon und jede Farbe.

  Templates in **verschachtelten** Karten-Konfigurationen — `cards:`, der Inhalt
  eines Popup-Actions, eine Mushroom-Karte in einem Slot — bleiben bewusst
  unangetastet und gehen unverändert an diese Karte. Sie rendert sie selbst, und
  zwar live; würden sie hier aufgelöst, fröre das Feld auf dem Wert ein, den es
  beim Konfigurieren der äußeren Karte hatte. Der Durchlauf stoppt an jedem
  verschachtelten Objekt mit eigenem `type`.

  Für Karten ohne Templates ändert sich nichts, und es kostet nichts: kein
  Durchlauf, kein Abo, keine Kopie der Konfiguration. Die Nav-Karte behält ihre
  eigenen Templates pro Eintrag, samt der Wahrheitswert-Felder `hidden` /
  `disabled`.

- **Die Kopfzeile der Raumkarte kann eine Aktion ausführen**, über eine
  `tap_action` auf Kartenebene. Bisher klappte die Kopfzeile die Karte ein oder
  tat nichts, und die einzige Aktion der Karte war `detail_path` bei langem
  Druck auf eine Kategorie-Kachel — eine Raumkarte auf einer Übersicht konnte
  also nicht die Tür in die eigene Ansicht dieses Raums sein. `tap_action`
  nimmt die übliche Home-Assistant-Aktionskonfiguration und läuft über
  denselben Handler wie bei der Überschriften- und der Status-Karte: `navigate`
  und `url` verhalten sich wie überall sonst, `perform-action` ebenfalls, sofern
  es sein `target` selbst benennt. `more-info` und `toggle` können hier nicht
  greifen — ein Raum ist ein Bereich, keine Entität, es gibt also kein
  mitzugebendes Ziel, und ohne eines tun beide nichts.

  Ein Tap kann nicht zugleich einklappen und eine Ansicht öffnen, deshalb
  übernimmt eine gesetzte `tap_action` die Kopfzeile vom Einklappen, und der
  Pfeil geht mit — er verspricht ein Einklappen, das die Kopfzeile nicht mehr
  ausführt. Alles Übrige an `collapsible` bleibt unberührt: der gespeicherte
  Zustand wird weiter gelesen und angewendet, `collapse_state_entity` und eine
  Automatisierung können eine Karte also weiterhin einklappen, deren Kopfzeile
  navigiert. Ohne `tap_action` ändert sich nichts.

- **Der Tap der Anwesenheitskarte ist einstellbar**, über eine `tap_action` auf
  Kartenebene. Ein Tap auf eine Person war fest auf More-Info verdrahtet, eine
  Karte als Weg in die eigene Ansicht einer Person war also nicht möglich.
  `tap_action` nimmt die übliche Home-Assistant-Aktionskonfiguration, steht
  neben der bereits vorhandenen `hold_action` und zielt auf die tatsächlich
  angetippte Person — `more-info`, `toggle` und ein Dienstaufruf ohne eigenes
  Ziel landen alle auf deren `entity_id`. Ohne Eintrag öffnet ein Tap More-Info
  wie bisher.

- **`tap_action` und `hold_action` stehen im Editor der Anwesenheitskarte**,
  unter einem neuen Abschnitt „Interaktionen". `hold_action` steckte schon
  immer in der Konfiguration, ohne dass es ein Feld dafür gab — sie ließ sich
  nur in YAML setzen.

- **`show_color_temp` für die Light Card.** Die Farbtemperatur-Zeile erschien
  bei jeder Lampe mit `color_temp`, und nichts konnte sie wegnehmen —
  `color_temp_style` wählt nur zwischen den drei Voreinstellungen und dem
  stufenlosen Regler, ausblenden lässt sich die Zeile damit nicht. Auf einer
  Ansicht mit Dutzenden Light Cards ist das Höhe auf jeder einzelnen, bezahlt
  von denen, die ohnehin nur die Helligkeit ziehen. `show_color_temp: false`
  lässt sie weg. Standard ist `true`, bestehende Dashboards sehen also
  unverändert aus, und die Option nimmt nur weg — eine Lampe ohne
  Farbtemperatur-Unterstützung zeigt weiterhin keine. Im Editor steht der
  Schalter oben im Abschnitt **Farbtemperatur**, Stil- und Voreinstellungs-
  Felder darunter; sie verschwinden, solange er aus ist, weil sie dann nichts
  mehr beschreiben.

- **Eine neue Karte: M3 Search Card** (`custom:m3-search-card`). Eine
  Material-3-Suchleiste, die auf dem Dashboard selbst sitzt und Home Assistants
  eigene Schnellsuche öffnet — standardmäßig die Entitätssuche, mit
  `mode: command` die Befehlssuche — dazu optional ein Assist-Knopf am rechten
  Rand. Sie liest keine Entität und braucht überhaupt keine Konfiguration:
  `type: custom:m3-search-card` ist bereits eine funktionierende Karte.

  Die Lücke, die sie füllt: Home Assistants einziger Einstieg in die Suche
  sitzt in der Kopfzeile, und der Such-Knopf dort wird auf schmalen
  Bildschirmen gar nicht gezeichnet. Auf einem Telefon oder einem Wandtablet
  führt vom Dashboard aus also kein Weg zur Entitätssuche außer über eine
  Tastatur, die diese Geräte nicht haben. Dem Assist-Knopf der Kopfzeile geht
  es genauso — deshalb kann diese Karte einen mitbringen.

  Sie öffnet den Dialog, indem sie Home Assistants eigenes Tastenkürzel
  nachspielt, statt `show-dialog` zu feuern, und das ist keine selbstgewählte
  Abkürzung: `ha-quick-bar` liegt in einem eigenen Chunk außerhalb des
  Hauptbundles, und hereingeholt wird es einzig vom Aufrufer des Frontends
  selbst, der dem Dialog-Manager neben dem Tag auch einen `import()`-Callback
  mitgibt. Eine als eigene Lovelace-Ressource geladene Karte kann diesen
  Modulpfad nicht benennen; ein bloßes `show-dialog` landet deshalb auf einem
  nie definierten Custom Element und scheitert mit „Unknown dialog type
  loaded". Das Nachspielen der Taste gibt den Nachlade-Import an den Handler
  zurück, dem er gehört, und lässt die Karte an einem Tastenkürzel hängen, das
  sichtbar und in HAs eigenem `Shift+?`-Dialog aufgeführt ist, statt an einem
  internen Modulpfad.

  Alles, was diese Kürzel wegnehmen kann, wird geprüft statt angenommen, denn
  ein Bedienelement, das stillschweigend nichts tut, ist schlimmer als eines,
  das gar nicht da ist: der Profil-Schalter „Tastenkürzel" (die Leiste wird
  blass und sagt es), die von Assist benötigte Integration `conversation`
  (ohne sie kein Assist-Knopf) und der Umstand, dass die Befehlssuche nur für
  Administratoren registriert ist (ohne Admin-Rechte kommt die Entitätssuche —
  immerhin eine Suche).

  ```yaml
  type: custom:m3-search-card
  ```

### Geändert

- **Die `hold_action` der Anwesenheitskarte läuft nun über den gemeinsamen
  Aktions-Handler**, wie bei jeder anderen Karte. Bisher setzte sie `navigate`
  und `url` selbst um und überging den Rest stillschweigend, eine `hold_action`
  mit `more-info`, `toggle` oder `perform-action` tat also nichts — und nichts
  wies darauf hin, da der Editor gar kein Feld dafür anbot. Diese funktionieren
  jetzt, `confirmation` wird beachtet, und die beiden bisher funktionierenden
  Arten bleiben unverändert.

## [2.4.0-uhafnir.1] - 2026-09-04

### Added

- **Nav Card** — new bottom/side navigation bar (bar, segmented, floating,
  sheet variants), synced from upstream.
- **Button Card** — `icon_off`, `icon_fill` (`tint`/`solid`), and
  `shape_by_state` (capsule-when-off → rounded-square-when-on morph),
  alongside the existing `chip_buttons` embedding.
- **Lights Overview** — `include_domains` to discover `switch`/`fan`/
  `input_boolean` entities alongside `light`; room toggling now uses the
  generic `homeassistant.turn_on`/`turn_off` service so non-light domains
  work too.
- **Room Card** — `mode: manual` to embed arbitrary Lovelace cards instead
  of auto-discovering an area, plus `power_entities`, `door_entities`,
  scroll-into-view behavior, and remembering expanded/collapsed state.
- **Chip Buttons** — scroll rows now fade at whichever edge has content
  hidden behind it, instead of a bare cut-off.

### Changed

- **Build pipeline switched from esbuild to Vite** — `npm run build`/`dev`
  behave the same from the outside (same dev-server on port 5173, same
  `dist/m3-cards.js` output, same deploy hash workflow); only the
  underlying bundler changed.

### Removed

- **Weather Card: `group_hourly_conditions` removed** — the hourly strip
  now always thins itself to fit the card's width (previously opt-in via
  this flag). If your dashboard sets `group_hourly_conditions: true`, it's
  simply ignored now — the behavior it enabled is the default. Also,
  `show_hour_labels` now defaults to `true` instead of `false`.

- **Versions now carry a `-uhafnir.N` suffix** — this fork's numbers
  (previously plain, up to `2.3.2`) overlapped with upstream
  (`j0sp0r/m3-cards`), which had its own unrelated `2.3.0` in progress.
  Releases continue from the same line but append `-uhafnir.N` (e.g.
  `2.4.0-uhafnir.1`), so a version can no longer be confused with an
  upstream release of the same number while still comparing higher than
  `2.3.2`, meaning HACS keeps offering updates as usual.
- **HACS repository link fixed** — the "Open in HACS" badge in the README
  pointed at `j0sp0r/m3-cards` (a leftover from the fork) instead of this
  repository, sending installers to the upstream 36-card project instead of
  this one's 38 cards.

- **Documentation restructured, German README dropped** — the per-card
  documentation now lives in one small file per card
  (`docs/cards/<slug>.md`), mechanically assembled into `README.md` via
  `npm run docs`; `README.md` is generated and should no longer be edited by
  hand. `README.de.md` (machine-translated, increasingly out of step with the
  English text) has been removed — the project is English-only going
  forward.

### Added

- **Action-glow frame for M3 Climate Card / M3 Climate Card Mini** — both
  climate cards now draw a squared-off glow around their outer edge while the
  thermostat is actually heating (warm) or cooling (blue), inspired by the
  ecosee reference card's equipment glow but rendered as layered `box-shadow`
  falloffs on the existing rounded-rect card shape instead of an SVG
  silhouette, so it stays crisp and Material-3-flavored rather than
  superellipse-rounded. The frame has two strengths: full while the entity's
  `hvac_action` reports `heating`/`cooling`, dimmed while `heat`/`cool` is the
  selected mode but the equipment is idle. That second level matters for
  integrations that derive `hvac_action` from the physical valve — Homematic's
  eTRV/HEATING devices, for instance, sit at `idle` for entire seasons, and a
  frame that only ever lit on `heating` would be invisible there. Entities that
  expose no `hvac_action` at all get the full frame from their mode alone. New
  optional `show_action_glow` config field (default `true`) turns it off per
  card.

### Changed

- **M3 Climate Card — the current temperature is now the card's dominant
  figure.** Following the ecosee reference card's Home Screen, the card leads
  with one large, thin, tightly tracked current-temperature figure (with a
  faint sheen that fades toward the card background, so it behaves on light
  and dark themes alike) and a small humidity line above it. The target
  temperature moves out of its square tile into a stadium-shaped **setpoint
  pill** between the − / + buttons: the mode's colour as a hairline outline
  over a faint same-colour wash, with the mode's glyph beside the value.

  **Migration note:** nothing to change in your YAML, but two options now
  describe a bigger element than they used to — `show_sensors: false` hides
  the large figure along with the humidity line, and
  `temperature_chip_placement: header` moves the reading into the header chip
  *instead of* rendering it large. Both are documented in the README table.

- **M3 Climate Card — mode and preset now share one row.** The operating mode
  and the comfort preset are the card's two "what is it set to" controls and
  sit side by side instead of on separate bands above and below the setpoint,
  which also gives the card back a row of height. New optional
  `show_control_labels` config field (default `true`); `false` leaves both as
  icon-only circles. `preset_style: pill` still drops the preset's label on
  its own, as before.

- **M3 Climate Card — the setpoint pill and the ± buttons stepped back.** The
  pill lost a size (44px tall, 21px numeral instead of 52/26), its wash went
  from 14% to 9%, and its outline is now the mode colour mixed a third of the
  way against the surface rather than at full strength — it was outshouting
  the current-temperature figure it sits under. The ± buttons lost their
  rings and grounds entirely: a circle around a control that carries neither
  a value nor a state just gave the eye two more shapes to land on before it
  reached the number between them. The 40px tap target is unchanged, it is
  simply no longer painted, and the glyphs are `mdi:minus` / `mdi:plus` now
  instead of typographic characters, so they match every other icon on the
  card.

- **M3 Climate Card / M3 Climate Card Mini — one voice for heat and cool.**
  The reference card reserves its amber/blue language for setpoints and
  equipment status and never paints a solid block of it; these cards now do
  the same. The full card's mode button dropped its saturated fill for the
  same outline-and-wash treatment at a lighter tint, the preset pill went
  fully neutral, and both cards' ± buttons default to no fill at all — a
  hairline ring is enough for a control that carries no value. The mini card
  puts the mode colour on its middle stepper segment instead, so the target
  temperature is the coloured thing in that row rather than the plus button,
  and its icon well recedes further. `mode_colors`, `plus_opacity`,
  `minus_opacity` and friends all still apply exactly where they did; an
  explicitly configured tint keeps its full strength.

  The shared recipe behind both cards lives in `src/shared/climate-surface.ts`
  so the full card's pill and the mini card's segment cannot drift apart.

### Fixed

- **M3 Climate Card — the mode and preset dropdowns work again and now open
  over the cards around them.** They were rendered inside the card, where the
  glass surface's `backdrop-filter` traps them: `ha-card` clipped the menu at
  its own edge and no `z-index` could lift it above the next card in the
  dashboard. The picker now opens in the browser's *top layer* (a modal
  `<dialog>` portalled to `document.body`), so it overlaps every neighbouring
  card, flips above the button when there's no room below, clamps itself into
  the viewport, and closes on Escape or an outside tap. Its surface is
  deliberately opaque — layered over the dashboard's own background — because
  a translucent menu sitting on a foreign card made the labels unreadable.

  The picker lives in `src/shared/dropdown-menu.ts` (`openDropdownMenu()`) as
  a reusable control for every card that needs a "pick one of these" menu,
  not as climate-card-private markup.

## [2.3.2]

### Added

- **M3 Group Card** (`m3-group-card`) — wraps other cards, M3 or otherwise, in
  one shared frame, so a stack of several small cards (e.g. two or three
  chip-button rows) reads as a single card instead of a pile of separately
  bordered boxes. The group draws the outer border/background/padding
  itself; every nested card that shares this suite's frame styling
  (`shared/glass-card.ts`) automatically drops its own border, background
  and padding while inside a group — via a `--m3-group-*` CSS custom
  property set on the group's children container, which inherits through
  each nested card's shadow root — so no configuration is needed on the
  nested card itself, and cards outside a group are completely unaffected.
  `gap` alone controls the space between rows; `gap: 0` makes them touch
  edge to edge. The editor's nested-cards list uses the same visual pickers
  Home Assistant's own `vertical-stack` editor does (`hui-card-picker` /
  `hui-card-element-editor`), including search, favorites and
  paste-from-clipboard when adding a card.
- **M3 Chip Buttons Card** (`m3-chip-buttons-card`) — a horizontal row of
  tappable pill-shaped chips, one per entity, with tap/hold/double-tap
  actions. The M3 answer to Bubble Card's "sub-buttons only" card: same core
  idea, flatter configuration — one form per chip instead of several nested
  panels, explicit Up/Down buttons to reorder instead of a dropdown menu. A
  chip can be non-interactive (`interactive: false`) to act as a read-only
  info readout (e.g. temperature/humidity). `show_name: false` hides a
  chip's name label for an icon-only chip.
- **M3 Button Card can now embed its own row of chip buttons** via the new
  `chip_buttons` option, reusing the same editor and rendering as the
  standalone Chip Buttons Card. Layout adapts to the card's height: at a
  normal single-row height the chips sit right-aligned next to the
  icon/text, and once the card is resized taller they move to a
  bottom-anchored bar whose alignment (`chip_buttons_justify`: left/center/
  right) becomes configurable — the switch is handled purely with a CSS
  container query, so it needs no JS height measuring and adapts instantly
  as the card is resized in the dashboard editor.

### Changed

- **Entity/device/area registry lookups now read `hass.entities` /
  `hass.devices` / `hass.areas` directly** instead of each discovery-driven
  card (battery, room, lights/climate overview, etc.) firing its own
  websocket round-trip for the same data. On a dashboard with several such
  cards this cut N redundant registry fetches down to zero extra round-trips;
  older frontends without these snapshots still fall back to the previous
  `callWS` path. Raises the minimum Home Assistant version to 2024.4.0
  (`hacs.json`) to match.

### Fixed

- **M3 Lights Overview Card — a popup could reopen itself indefinitely.**
  The scoped popup card built for a room reset `hold_action`/
  `double_tap_action` to avoid cascading, but still inherited `tap_action`
  from the outer card. With `tap_action: popup` configured on the outer
  card, tapping a light inside its own popup re-triggered "popup" instead of
  toggling the light, opening another nested popup on top — repeatedly.

### Misc

- **M3 Climate Overview Card — README brought back in line with what the
  card actually does.** The docs had drifted from the upstream fork's
  original, much narrower card; documented the full filter set
  (`exclude_area`, `include_entities`, `include_labels`/`exclude_labels`,
  `include_state`/`exclude_state`), per-room `color` overrides, `show_header`,
  `show_scale_labels`, `tile_tint_opacity`/`accent_opacity`, and the
  editor-only mold-risk notification automation (`notify_*`), none of which
  were mentioned before.

## [2.3.1]

### Added

- **M3 Weather Card — `show_current` / `show_chart`.** The header
  (icon/temperature/condition) and the chart (temperature curve +
  precipitation bars) can now be toggled independently, so the same card can
  be trimmed to a compact header-only or chart-only layout. Both default to
  `true`, so existing configs are unaffected.
- **M3 Weather Card — configurable hourly icon strip and temperature axis.**
  At higher `hours` counts the icon/temperature strip above the curve used
  to pack every hour into an unreadable string. `group_hourly_conditions`
  fits it to the card's actual width instead, sampling icons and
  temperatures at the same regular interval. `show_hourly_icons` and
  `show_hourly_temperatures` toggle each row independently, `show_hour_labels`
  adds hour-axis labels, and `show_temp_axis` adds an overlay temperature
  y-axis.

## [2.3.0]

### Added

- **M3 Lights Overview Card** (`m3-lights-overview-card`) — a room-by-room
  light overview auto-discovered by area, on the same "overview" pattern as
  the Climate Overview card (which it's meant to sit stacked with on a
  dashboard). Shows a tile per room with on/off state and count, or switches
  to a flat per-entity view. A tap toggles the room's lights; hold opens a
  popup — either this same card re-scoped to the room, HA's own more-info
  dialog, or a custom card built from a `[[token]]`-resolved skeleton.
  What's *shown* on a tile and what a tap actually *switches* are independent
  filters, so a room can display all its lights while only toggling a subset
  (`toggle_filter`, `exclude_toggle_entities`).
- **M3 Climate Overview Card — `popup.mode`.** The popup is now a three-way
  choice, selectable in the GUI editor: "Overview grid (filtered)" (the
  previous default — this same card again, re-scoped to the tapped room),
  "Default detail view" (Home Assistant's own more-info dialog), or "Custom
  card" — any Lovelace card config (`popup.card`), with string values able to
  reference `[[area_id]]`, `[[device_id]]`, `[[entity_id]]`, `[[name]]`,
  `[[temperature_entity]]`, `[[humidity_entity]]` placeholders resolved
  against the tapped room before the card is built. Defaults to the grid, so
  existing configs are unaffected.
- **M3 Climate Overview Card — `mode`.** Switches auto-discovery between
  dedicated temperature sensors ("Temperature only", the previous default
  behaviour), thermostats with a sensor fallback ("Thermostats incl.
  temperature"), and thermostats only. Manual `rooms` gain an optional
  `climate_entity` so a tap opens the thermostat instead of the sensor.

### Changed

- **M3 Climate Overview Card — `tile_tap_action` and `tap_action` now
  coexist.** `tile_tap_action: thermostat` still opens the sliding thermostat
  sheet on a plain tap, as before; it only sets the *default* tap behaviour,
  so an explicitly configured `tap_action` (the newer, more general
  mechanism) takes over instead once one is set.

## [2.2.0]

### Added

- **M3 Humidifier Card** (`m3-humidifier-card`) — target humidity, mode, fan
  speed and a device's extras in one card. Home Assistant's own humidifier card
  cannot set a fan speed, so the usual answer is a second card beside it; this
  is the one card. Asked for by the community.

  It does not insist that `entity` is a `humidifier`. Plenty of dehumidifiers
  are exposed as a switch plus a number plus a sensor, so `current_entity`,
  `target_entity` and `action_entity` say where the readings come from when the
  main entity does not carry them. Modes come from `available_modes`, from a
  `select`, or from an explicit list with a name, icon and colour each. The fan
  row reads a fan's `preset_modes`, a fan's percentage, or a `select`'s options.
  `layout` sets the order of the four blocks and hides the ones left out — one
  mechanism rather than an array plus show_* flags that can disagree with it.

  `action` is optional in the humidifier contract and many integrations omit
  it; without it the card infers drying or humidifying from the direction
  between current and target rather than showing nothing.

- **M3 Calendar Card** (`m3-calendar-card`) — an agenda and a month grid for
  any number of calendars, replacing Home Assistant's built-in calendar card in
  this suite's design language. Asked for in the repo's feedback.

  Events come from `calendar.get_events`, not from the entity attributes, which
  carry only the next event. Multi-day events appear under every day they touch
  with "day 2 of 3", a running event is tinted and badged, past ones fade, and a
  calendar that cannot be reached is named rather than silently dropped —
  showing four of five calendars without saying so would be worse.

- **`src/shared/ha-calendar.ts`** — the fetching, with one cache for the page so
  a month view and an agenda view of the same calendars make one request between
  them rather than two.
- **`src/shared/drag-throttle.ts`** — the drag throttle the light card's three
  sliders used, moved out when the humidifier card's target slider became the
  second user rather than copied.

- **M3 Leak Card — `max_visible`.** The same "show N more" toggle the power
  list, battery, NAS, updates and occupancy cards already had; the leak card
  only had the all-or-nothing `collapse_ok`. The limit steps aside during an
  alarm, because whichever sensor is wet has to be on screen without another
  tap.

- **M3 Climate Overview — `tile_tap_action: thermostat`.** A tap on a room
  opened the sensor's dialog, which is its history graph; it can now open that
  room's thermostat instead — `m3-climate-card-mini`, floating over the card and
  adjustable there. The thermostat is found in the room's own Home Assistant
  area — or, for a room that has no area because its sensors group by device,
  on that same device, which is how a thermostat reporting its own room
  temperature is found — or named per room with `climate_entity`. A room with
  no thermostat keeps the graph rather than going dead. Asked for on Reddit;
  the default is unchanged.

- **M3 Room Card — folding.** `collapsible: true` puts a chevron in the header
  and folds the card down to it. The subtitle stays, because "occupied · 3
  devices on" is exactly what a folded room still needs to say. The state
  persists per browser, or across devices in an `input_boolean`.
- **`src/shared/collapse-state.ts`** — the fold-state rule, shared by the
  heading and room cards so the two cannot drift.

- **M3 Room Card** (`m3-room-card`) — one card per area. Point it at a Home
  Assistant area and it works out the rest: which kinds of device are in the
  room, what each of them is doing, the climate readings, and whether anyone is
  in there. Nine categories are built in, `extra_domains` adds more, and a tile
  appears only for a category that actually has an entity in the room.

  The badge under each tile is the point of it: with several devices it counts
  them (`2/4`), with one it says what that device is doing — the fan's step,
  the thermostat's target, the media title, the blind's position. Entities Home
  Assistant marks as configuration or diagnostic are left out, which is what
  makes the switch category usable at all: on the author's install a living
  room holds 32 switches, of which 2 are things a person would call a switch.

  A tile holding several devices opens a picker on tap rather than switching all
  of them: a room's four lights are four decisions, not one. "All off" and "All
  on" are there for when it really is one. Individual devices can also be
  excluded in the editor, which is where a plug's indicator light goes when its
  integration does not mark it as diagnostic. Each category picks what its
  second line says — count, state, or nothing.

  Everything is read from the registry snapshots the frontend already keeps on
  `hass`, so discovery costs no websocket round-trip and can run in the render
  path, memoised against the registry object so the walk happens once per tick
  no matter how many room cards are on the dashboard.

- **M3 Heading Card** (`m3-heading-card`) — section headings for the space
  between cards, in four variants: a plain icon and title, one with a count chip
  and an action button, a divider rule with a small-caps label, and a
  collapsible one that folds away the cards below it. It draws no card of its
  own — no frame, no glass, no shadow — so it reads as a label for what follows
  rather than as another tile.

  Collapsing hides the sibling cards in the browser and writes nothing to the
  dashboard configuration, so it is a view state and not an edit. That depends
  on Home Assistant's own DOM, so every step is a check rather than an
  assumption and an unrecognised layout falls back to the plain variant: an
  arrow that visibly does nothing is worse than no arrow. The state persists in
  `localStorage`, or in an `input_boolean` when one is configured, which also
  syncs it across devices.

- **M3 Status Card** (`m3-status-card`) — shows a value large and with meaning:
  a number, a piece of text, or a yes/no state, from any entity. The point of
  the card is the mapping in between: a `states` rule list turns `off` into a
  red "No" with a cross, or a number under 20 into a warning colour, without a
  template sensor to do it. Five presets (`yes_no`, `on_off`, `ok_problem`,
  `open_closed`, `traffic`) supply ready-made rule lists in the dashboard's own
  language, and a card's own rules are tried first, so a preset can be adjusted
  without being replaced.

  One value gets the large hero treatment, several get a grid or a row list. A
  `toggle` tap switches the shown state over at once instead of waiting for
  Home Assistant to confirm it, so a "medication given" card cannot be tapped
  twice by someone who thinks the first tap missed. An optional trend chip
  compares against the same entity 24 hours ago, with `trend_inverted` for the
  values where falling is the win.

- **`src/shared/actions.ts`** — the seven-branch tap/hold action handler, moved
  out of the button card so the status card's `toggle` and `call-service` use
  the same code rather than a second copy.

- **M3 Clock Card** (`m3-clock-card`) — a clock in five styles: rounded tiles,
  digits inside lobed shapes, lockscreen typography, an organic analogue dial,
  and a sixty-segment ring. It reads no entity, so it works on any dashboard
  without setting anything up; the optional alarm, sun, day-progress and
  second-time-zone extras are the only parts that need one.

  The card only redraws while it is on screen — a clock on a wall tablet would
  otherwise animate for weeks to an empty room — and styles with nothing moving
  between whole seconds drop to a timer that wakes on the minute. Measured on a
  35-card dashboard: 12 renders in 12 seconds against roughly 1440 frames, and
  zero ticks while scrolled out of view.

- **`src/shared/shapes.ts`** — the lobed-shape generator behind those styles.
  The cookie, clover, flower and scallop shapes Material 3 Expressive uses are
  one curve with different settings, so one generator covers the family. Useful
  to any card in the suite, not just the clock.

### Fixed

- **M3 Cost Card sent a wildly wrong number to your phone.** Its notification
  automation multiplied `states(entity)` by the price. For a
  `total_increasing` sensor that state is the *meter reading*, not the month's
  consumption — so on the author's install the card said **112.66 €** for
  August while its own notification said **26,844.38 €**: 72,926.89 kWh times
  36.81 ct. The card was right; it reads long-term statistics, which is
  precisely why nobody noticed the notification disagreeing with it.

  The automation now calls `recorder.get_statistics` and sums the same daily
  buckets the card sums, with the same statistic type and the same unit
  normalisation, so the two cannot disagree again. A template can reach neither
  statistics nor history, so this had to become an action rather than a
  variable — and the budget mode's trigger had to change with it, since a
  trigger's `value_template` cannot call a service. It checks every half hour
  instead and stays once-a-month by asking itself when it last fired.

  Two smaller things fell out of the same investigation. The notification's
  entity picker had no default, which invited exactly this: the card was
  reading one sensor while its own notification read another. It now defaults
  to the card's entity, and choosing a different one says why that is worth a
  second look. And the old check for a meter's reset cycle is gone — it needed
  both `last_reset` and `next_reset`, went quiet on a sensor carrying only the
  first, and no longer matters now that the month is summed from statistics.

  **An automation created before this fix keeps its old template.** Open the
  card's notification settings and save again, or check the automation by
  hand.

- **M3 Heading Card — the divider was barely visible, in four separate ways.**
  Found while photographing the card for the README, and each one had to be
  measured rather than eyeballed:

  - Its **rules** were a tint of 18, which is 1.78:1 against a dark card and
    1.43:1 against a light one — invisible. Every other tint in the suite (6–22)
    sits *behind an icon*, where the icon carries the contrast and the fill only
    hints; a rule has nothing on top of it and has to reach 3:1 by itself. Now
    52, giving 5.47:1 and 3.30:1.
  - Its **label** sat at `opacity: 0.42`: 4.02:1 dark, 2.58:1 light, against a
    target of 4.5:1. Now 0.65. The house value for a muted label is 0.6, which
    still misses a light card at 4.35:1, so this sits above it on purpose.
  - **`color` never reached the divider at all.** It drove the icon, badge,
    action and arrow, but the rules were hardcoded to `--primary-text-color`, so
    setting a colour on a divider silently did nothing. It now drives both parts,
    and the label takes the colour at full strength — someone who names a colour
    means that colour, not a muted version of it.
  - Its **label was 10px while the titles were 15**, which read as a different
    kind of element rather than as the same heading in another variant. Both now
    come from one place, so `title_size` moves them together.

- **M3 Light Card showed the brightness twice.** The percentage stood under the
  lamp's name and again above the slider handle. The subtitle is the live one —
  it already follows the value while the handle is being dragged — and it is
  what every other card puts in that spot, so the label on the slider is gone.

- **`tintOn` on a dark surface** returned a CSS `color-mix` string rather than a
  colour. `tintInk` feeds that back in as the surface to measure ink against,
  and an unparseable surface means the ink comes back unchanged — so `tintInk`
  has been a silent no-op in every dark theme since it was written. Benign
  until now, because a light accent on its own dark tint contrasts well by
  accident.

---

**Deutsche Fassung**

### Neu

- **M3 Humidifier Card** (`m3-humidifier-card`) — Zielfeuchte, Modus,
  Lüfterstufe und die Zusatzfunktionen eines Geräts in einer Karte. Die
  eingebaute humidifier-Karte von Home Assistant kann keine Lüftergeschwindigkeit,
  deshalb steht üblicherweise eine zweite Karte daneben; das hier ist die eine.
  Aus der Community gewünscht.

  Sie setzt nicht voraus, dass `entity` eine `humidifier`-Entität ist. Viele
  Entfeuchter erscheinen als Schalter plus `number` plus `sensor`, deshalb sagen
  `current_entity`, `target_entity` und `action_entity`, woher die Werte kommen,
  wenn die Hauptentität sie nicht trägt. Modi kommen aus `available_modes`, aus
  einem `select` oder aus einer eigenen Liste mit Name, Icon und Farbe je Modus.
  Die Lüfterzeile liest `preset_modes` eines Lüfters, dessen Prozentwerte oder
  die Optionen eines `select`. `layout` bestimmt die Reihenfolge der vier Blöcke
  und blendet die weggelassenen aus — ein Mechanismus statt einer Liste plus
  `show_*`-Schaltern, die sich widersprechen können.

  `action` ist im humidifier-Vertrag optional und wird von vielen Integrationen
  weggelassen; fehlt es, leitet die Karte Ent- oder Befeuchten aus der Richtung
  zwischen Ist und Ziel ab, statt nichts zu zeigen.

- **M3 Calendar Card** (`m3-calendar-card`) — Agenda und Monatsraster für
  beliebig viele Kalender, als Ersatz für die eingebaute Kalenderkarte in der
  Designsprache dieser Suite. Aus dem Repo-Feedback gewünscht.

  Die Termine kommen über `calendar.get_events`, nicht aus den Attributen der
  Entität — die tragen nur den nächsten Termin. Mehrtägige Termine erscheinen an
  jedem betroffenen Tag mit „Tag 2 von 3", ein laufender Termin ist getönt und
  mit Abzeichen versehen, vergangene verblassen, und ein nicht erreichbarer
  Kalender wird benannt statt stillschweigend weggelassen — vier von fünf
  Kalendern zu zeigen, ohne es zu sagen, wäre schlimmer.

- **`src/shared/ha-calendar.ts`** — der Datenabruf, mit einem Zwischenspeicher
  je Seite: Eine Monats- und eine Agenda-Ansicht derselben Kalender machen
  zusammen eine Anfrage statt zwei.
- **`src/shared/drag-throttle.ts`** — die Ziehdrosselung der drei Regler der
  Light Card, herausgelöst statt kopiert, als der Feuchte-Regler der zweite
  Nutzer wurde.

- **M3 Leak Card — `max_visible`.** Derselbe „N weitere anzeigen"-Umschalter,
  den Power-List, Batterie, NAS, Updates und Belegung längst haben; die
  Leak-Karte hatte nur das Alles-oder-nichts von `collapse_ok`. Im Alarmfall
  tritt die Begrenzung zurück, denn welcher Sensor nass ist, muss ohne zweiten
  Tap sichtbar sein.

- **M3 Climate Overview — `tile_tap_action: thermostat`.** Ein Tap auf einen
  Raum öffnete den Sensordialog, also dessen Verlaufsgraphen; er kann jetzt
  stattdessen das Thermostat des Raums öffnen — `m3-climate-card-mini`,
  schwebend über der Karte und dort bedienbar. Gefunden wird es im Bereich des
  Raums — oder, wenn ein Raum mangels Bereich über sein Gerät gruppiert wird,
  an ebendiesem Gerät, womit ein Thermostat gefunden wird, das seine eigene
  Raumtemperatur meldet — oder je Raum über `climate_entity` benannt. Ein Raum
  ohne Thermostat behält den Verlauf, statt tot zu sein. Auf Reddit gewünscht;
  die Vorgabe bleibt unverändert.

- **M3 Room Card — Einklappen.** `collapsible: true` setzt einen Pfeil in die
  Kopfzeile und klappt die Karte auf ebendiese zusammen. Der Untertitel bleibt
  stehen, denn „belegt · 3 Geräte aktiv" ist genau das, was ein eingeklappter
  Raum noch sagen muss. Der Zustand bleibt je Browser erhalten oder
  geräteübergreifend in einem `input_boolean`.
- **`src/shared/collapse-state.ts`** — die Regel für den eingeklappten Zustand,
  gemeinsam genutzt von Heading- und Room-Karte, damit beide nicht auseinanderlaufen.

- **M3 Room Card** (`m3-room-card`) — eine Karte je Bereich. Man gibt ihr einen
  Bereich aus Home Assistant, den Rest findet sie selbst: welche Gerätearten im
  Raum hängen, was jede davon tut, die Klimawerte und ob jemand da ist. Neun
  Kategorien sind eingebaut, `extra_domains` ergänzt weitere, und eine Kachel
  erscheint nur für eine Kategorie, die im Raum tatsächlich eine Entität hat.

  Der Text unter der Kachel ist der eigentliche Punkt: Bei mehreren Geräten
  zählt er (`2/4`), bei einem sagt er, was dieses Gerät tut — die Stufe des
  Lüfters, die Zieltemperatur, den Medientitel, die Rollo-Position. Entitäten,
  die Home Assistant als Konfiguration oder Diagnose markiert, bleiben draußen;
  erst das macht die Schalter-Kategorie überhaupt brauchbar: Im Wohnzimmer der
  Testinstallation liegen 32 Schalter, von denen 2 das sind, was ein Mensch
  einen Schalter nennt.

  Eine Kachel mit mehreren Geräten öffnet beim Tap eine Auswahl, statt alle
  umzuschalten: Die vier Lampen eines Raums sind vier Entscheidungen, nicht
  eine. „Alles aus“ und „Alle an“ stehen für die Fälle bereit, in denen es doch
  nur eine ist. Einzelne Geräte lassen sich außerdem im Editor abwählen — dort
  landet etwa die Status-LED einer Steckdose, wenn ihre Integration sie nicht
  als Diagnose markiert. Jede Kategorie bestimmt selbst, was ihre zweite Zeile
  zeigt: zählen, Zustand oder gar nichts.

  Alles kommt aus den Registry-Daten, die das Frontend ohnehin auf `hass`
  bereithält — die Erkennung kostet also keinen Websocket-Aufruf und darf im
  Render-Pfad laufen, memoisiert gegen das Registry-Objekt, sodass der
  Durchlauf einmal pro Tick passiert, egal wie viele Raumkarten auf dem
  Dashboard liegen.

- **M3 Heading Card** (`m3-heading-card`) — Abschnitts-Überschriften für den
  Raum zwischen den Karten, in vier Varianten: schlicht mit Icon und Titel, mit
  Zähler-Chip und Aktions-Button, als Trennstrich mit Label in Versalien und
  aufklappbar mit Einklappen der Karten darunter. Sie zeichnet keine eigene
  Karte — kein Rahmen, kein Glas, kein Schatten —, damit sie als Beschriftung
  für das Folgende gelesen wird und nicht als weitere Kachel.

  Das Einklappen blendet die Geschwisterkarten im Browser aus und schreibt
  nichts in die Dashboard-Konfiguration; es ist damit ein Anzeigezustand und
  keine Bearbeitung. Das hängt vom DOM von Home Assistant ab, deshalb ist jeder
  Schritt eine Prüfung und keine Annahme, und ein unbekanntes Layout fällt auf
  die schlichte Variante zurück: Ein Pfeil, der sichtbar nichts tut, ist
  schlimmer als gar keiner. Der Zustand bleibt im `localStorage` erhalten oder,
  wenn konfiguriert, in einem `input_boolean` — dann gilt er geräteübergreifend.

- **M3 Status Card** (`m3-status-card`) — zeigt einen Wert groß und mit
  Bedeutung: eine Zahl, einen Text oder einen Ja/Nein-Zustand, aus beliebigen
  Entitäten. Der eigentliche Punkt ist die Zuordnung dazwischen: Eine
  `states`-Regelliste macht aus `off` ein rotes „Nein“ mit Kreuz oder aus einer
  Zahl unter 20 eine Warnfarbe — ohne Template-Sensor. Fünf Vorlagen (`yes_no`,
  `on_off`, `ok_problem`, `open_closed`, `traffic`) liefern fertige Regellisten
  in der Sprache des Dashboards, und eigene Regeln werden zuerst geprüft: Eine
  Vorlage lässt sich anpassen, ohne sie zu ersetzen.

  Ein Wert bekommt die große Hero-Darstellung, mehrere ein Raster oder eine
  Zeilenliste. Ein `toggle`-Tap schaltet die Anzeige sofort um, statt auf die
  Bestätigung von Home Assistant zu warten — so tippt niemand ein zweites Mal,
  weil der erste Tap scheinbar nichts getan hat. Ein optionaler Trend-Chip
  vergleicht mit derselben Entität vor 24 Stunden, mit `trend_inverted` für die
  Werte, bei denen Fallen der Gewinn ist.

- **`src/shared/actions.ts`** — der Aktions-Handler mit seinen sieben Zweigen,
  aus der Button-Karte herausgelöst, damit `toggle` und `call-service` der
  Status-Karte denselben Code nutzen statt einer zweiten Kopie.

- **M3 Clock Card** (`m3-clock-card`) — eine Uhr in fünf Stilen: runde Kacheln,
  Ziffern in gelappten Formen, Sperrbildschirm-Typografie, ein organisches
  analoges Zifferblatt und ein Ring aus sechzig Segmenten. Sie liest keine
  Entität und läuft damit auf jedem Dashboard ohne Einrichtung; nur die
  optionalen Extras — Wecker, Sonne, Tagesfortschritt, Zweitzeitzonen —
  brauchen eine.

  Die Karte zeichnet nur neu, solange sie sichtbar ist — eine Uhr auf einem
  Wandtablet würde sonst wochenlang für einen leeren Raum animieren — und Stile
  ohne Bewegung zwischen den Sekunden schalten auf einen Minutentimer um. Auf
  einem Dashboard mit 35 Karten gemessen: 12 Renders in 12 Sekunden bei rund
  1440 Frames, und null Ticks außerhalb des Sichtbereichs.

- **`src/shared/shapes.ts`** — der Formengenerator dahinter. Cookie, Kleeblatt,
  Blüte und Scallop sind dieselbe Kurve mit anderen Werten, also deckt ein
  Generator die ganze Familie ab. Für jede Karte der Suite nutzbar, nicht nur
  für die Uhr.

### Behoben

- **M3 Cost Card schickte eine völlig falsche Zahl aufs Handy.** Ihre
  Benachrichtigungs-Automation multiplizierte `states(entity)` mit dem Preis.
  Bei einem `total_increasing`-Sensor ist dieser Zustand aber der
  *Zählerstand*, nicht der Verbrauch des Monats — auf der Testinstallation
  meldete die Karte für August **112,66 €**, ihre eigene Benachrichtigung
  dagegen **26 844,38 €**: 72 926,89 kWh mal 36,81 ct. Die Karte lag richtig,
  sie liest die Langzeitstatistik; genau deshalb fiel der Widerspruch nie auf.

  Die Automation ruft jetzt `recorder.get_statistics` auf und summiert
  dieselben Tageswerte wie die Karte, mit derselben Statistik-Art und derselben
  Einheiten-Normalisierung — beide können also nicht mehr auseinanderlaufen.
  Ein Template erreicht weder Statistiken noch Verlauf, deshalb musste daraus
  eine Aktion statt einer Variablen werden. Und der Auslöser des
  Budget-Modus musste mit: Das `value_template` eines Triggers kann keinen
  Dienst aufrufen. Er prüft nun halbstündlich und bleibt trotzdem einmal im
  Monat, indem er sich selbst fragt, wann er zuletzt ausgelöst hat.

  Zwei kleinere Dinge fielen dabei mit ab. Das Auswahlfeld für die Entität der
  Benachrichtigung hatte keine Vorgabe — genau die Einladung zu diesem Fehler:
  Die Karte las den einen Sensor, ihre eigene Meldung einen anderen. Es steht
  jetzt auf der Entität der Karte, und eine abweichende Wahl sagt, warum sie
  einen zweiten Blick verdient. Und die alte Prüfung des Zählerzyklus ist
  entfallen: Sie brauchte `last_reset` **und** `next_reset`, schwieg bei einem
  Sensor mit nur dem ersten, und ist gegenstandslos, seit der Monat aus
  Statistiken summiert wird.

  **Eine vor dieser Behebung angelegte Automation behält ihr altes Template.**
  Die Benachrichtigungs-Einstellungen der Karte erneut speichern oder die
  Automation von Hand prüfen.

- **M3 Heading Card — die Trennlinie war auf vier verschiedene Weisen kaum zu
  sehen.** Aufgefallen beim Fotografieren der Karte fürs README, und jeder Punkt
  musste gemessen werden statt geschätzt:

  - Ihre **Linien** hatten eine Tönung von 18, das sind 1,78:1 auf dunkler und
    1,43:1 auf heller Karte — unsichtbar. Alle übrigen Tönungswerte der Suite
    (6–22) liegen *hinter einem Icon*, wo das Icon den Kontrast trägt und die
    Fläche nur andeutet; eine Linie hat nichts über sich und muss die 3:1 selbst
    erreichen. Jetzt 52, also 5,47:1 und 3,30:1.
  - Ihre **Beschriftung** stand auf `opacity: 0.42`: 4,02:1 dunkel, 2,58:1 hell,
    bei einem Ziel von 4,5:1. Jetzt 0,65. Der Hauswert für gedämpfte
    Beschriftungen ist 0,6, der eine helle Karte mit 4,35:1 noch verfehlt —
    dieser Wert liegt also mit Absicht darüber.
  - **`color` erreichte die Trennlinie überhaupt nicht.** Die Option steuerte
    Icon, Zähler, Aktionsknopf und Pfeil, aber die Linien standen fest auf
    `--primary-text-color`; eine Farbe auf einer Trennlinie tat also stillschweigend
    nichts. Sie steuert jetzt beide Teile, und die Beschriftung übernimmt die
    Farbe in voller Stärke — wer eine Farbe nennt, meint diese Farbe und nicht
    eine gedämpfte Fassung davon.
  - Ihre **Beschriftung war 10px groß, die Titel 15px**, was sie als andere Art
    von Element erscheinen ließ statt als dieselbe Überschrift in einer anderen
    Variante. Beide kommen jetzt aus einer Quelle, `title_size` bewegt sie
    zusammen.

- **M3 Light Card zeigte die Helligkeit doppelt.** Die Prozentangabe stand
  unter dem Namen der Lampe und noch einmal über dem Reglergriff. Die
  Unterzeile ist die lebende Anzeige — sie folgt dem Wert schon während des
  Ziehens — und sie ist das, was jede andere Karte an dieser Stelle zeigt; die
  Marke am Regler ist deshalb entfallen.

- **`tintOn` auf dunkler Fläche** gab einen CSS-`color-mix`-String zurück statt
  einer Farbe. `tintInk` reicht genau das als Bezugsfläche zurück, und eine
  nicht auflösbare Fläche heißt: Die Tinte kommt unverändert zurück — `tintInk`
  war damit in jedem dunklen Theme still wirkungslos, seit es geschrieben
  wurde. Bis jetzt folgenlos, weil ein heller Akzent auf seiner eigenen dunklen
  Tönung zufällig gut kontrastiert.

## [2.1.0]

The light theme release. Accent colours are now corrected at render time
against the surface they are actually drawn on, so the palette reads as
deliberate rather than washed out. Alongside that: a large rendering-cost
reduction, a masonry layout fix, and calendar support for the waste card.

### Added

- **M3 Waste Card — `calendar_entity`.** Read the schedule from a calendar
  whose events name the bin, instead of (or alongside) one day-count sensor per
  bin. Streams from both sources are merged; a sensor wins over a calendar entry
  with the same name.
- **Contrast tooling.** `npm run test:contrast` unit-tests the colour maths, and
  `test/contrast-audit.js` measures the *rendered* page — paste it into the
  browser console on a dashboard and run it once per theme. See
  `docs/TESTING.md`.

### Fixed

- **Accent colours in a light theme.** The 2.0 known issue is resolved. The
  palette is built for dark backgrounds — all thirteen colours fall below 4.5:1
  on a light card and all thirteen pass on a dark one — so accents used as text
  or as a data fill are now moved to their target contrast at render time. The
  correction keeps the hue and lifts the saturation rather than blending toward
  black: `#85b7eb` becomes `#0b6ed5`, not a grey-blue. Measured on a live
  35-card dashboard, the light theme now reports three findings and the dark
  theme four, and all three of the light ones appear in the dark list too —
  they are long-standing design choices, not theme faults.
- **Content on tinted surfaces.** Chips, icon wells, expand toggles and count
  badges took their colour from the card while sitting on a tint of the same
  hue, which rendered `#81c784` on `#9cdc9f` — 1.26:1. Ink is now measured
  against the surface it actually sits on.
- **Tints no longer mix toward `transparent`.** 146 surfaces mixed into
  whatever was behind the card, which through a glass card is the dashboard
  wallpaper, so the same 8% wash looked different depending on the picture
  underneath. They mix into the card surface now. Gradients and deliberate
  overlays are unchanged.
- **M3 Button Card and M3 Climate Card Mini in a masonry view.** Both make
  their card a size container so paddings can scale with height, then took
  `height: 100%`. A masonry column imposes no height, the percentage fell back
  to `auto`, and `auto` on a size-contained box is zero: the button card
  rendered a squashed 37px of content inside a 0px card, and the climate-mini
  card disappeared entirely. Sections views were never affected.
- **M3 Occupancy Card — `max_visible`.** The option had no effect; the list now
  caps at the given number with the rest behind a toggle.

### Performance

- **Cards no longer re-render on unrelated state changes.** Home Assistant
  hands every card a fresh `hass` object whenever anything in the system
  changes, so one chatty power sensor re-rendered every card on the dashboard.
  Every card now declares what it reads. Cards that discover their entities by
  scanning also watch for the entity count changing, so a newly added sensor is
  still picked up.
- **M3 Power Summary — count-up animation.** The value lerp wrote to reactive
  state on every animation frame although the reading is rounded before it is
  shown, so most frames re-rendered identical text.
- Measured together on the same 35-card dashboard, 20 seconds:
  **370 renders → 12.**

### Behaviour changes

No configuration option was removed or renamed, and no default in `const.ts`
changed — existing configs load unchanged. These change what you *see*:

- **Every card in a light theme.** Accent-coloured text and data fills are
  distinctly darker and more saturated than in 2.0. This is the fix, not a side
  effect, but it is a visible change.
- **Every card.** Tinted inner fills are opaque now rather than letting the
  wallpaper through. The card itself stays translucent.
- **M3 Climate Card Mini** has a minimum height of 112px. A tile configured
  smaller than that is raised to it. 112px is the smallest height at which the
  compact layout fits without clipping, so a tile below it was cutting off its
  own content already.

---

**Deutsche Fassung**

Das Release für das helle Theme. Akzentfarben werden jetzt beim Rendern gegen
die Fläche korrigiert, auf der sie tatsächlich liegen — die Palette wirkt
dadurch gewollt statt ausgewaschen. Dazu: deutlich weniger Renderaufwand, ein
Layout-Fehler in der Masonry-Ansicht und Kalender-Unterstützung für die
Abfallkarte.

### Neu

- **M3 Waste Card — `calendar_entity`.** Abfuhrtermine aus einem Kalender
  lesen, dessen Einträge die Tonne benennen — statt oder zusätzlich zu je einem
  Tageszähler-Sensor pro Tonne. Beide Quellen werden zusammengeführt; bei
  gleichem Namen gewinnt der Sensor.
- **Werkzeuge für Kontrastprüfung.** `npm run test:contrast` testet die
  Farbmathematik, `test/contrast-audit.js` misst die *gerenderte* Seite — in die
  Browser-Konsole eines Dashboards einfügen und je Theme einmal ausführen.
  Siehe `docs/TESTING.md`.

### Behoben

- **Akzentfarben im hellen Theme.** Die bekannte Einschränkung aus 2.0 ist
  erledigt. Die Palette ist für dunkle Hintergründe gebaut — alle dreizehn
  Farben fallen auf heller Karte unter 4,5:1 und bestehen auf dunkler — deshalb
  werden Akzente als Text oder als Datenfläche jetzt zur Laufzeit auf ihren
  Zielkontrast gezogen. Die Korrektur hält den Farbton und hebt die Sättigung,
  statt Richtung Schwarz zu blenden: `#85b7eb` wird `#0b6ed5`, kein Graublau.
  Auf einem Dashboard mit 35 Karten gemessen meldet das helle Theme jetzt drei
  Funde, das dunkle vier — und alle drei hellen stehen auch in der dunklen
  Liste. Es sind also langjährige Gestaltungsentscheidungen, keine
  Theme-Fehler.
- **Inhalt auf getönten Flächen.** Chips, Icon-Felder, Aufklapp-Umschalter und
  Zähler-Badges nahmen ihre Farbe von der Karte, saßen aber auf einer Tönung
  desselben Farbtons — das ergab `#81c784` auf `#9cdc9f`, also 1,26:1. Die
  Schrift wird jetzt gegen die Fläche gemessen, auf der sie wirklich liegt.
- **Tönungen mischen nicht mehr gegen `transparent`.** 146 Flächen mischten
  gegen das, was hinter der Karte lag — durch eine Glaskarte also gegen die
  Hintergrundtapete, sodass derselbe 8-%-Schleier je nach Bild anders aussah.
  Sie mischen jetzt in die Kartenfläche. Gradienten und bewusste Überlagerungen
  bleiben unverändert.
- **M3 Button Card und M3 Climate Card Mini in der Masonry-Ansicht.** Beide
  machen ihre Karte zum Größen-Container, damit Polster mit der Höhe skalieren
  können, und nahmen dann `height: 100%`. Eine Masonry-Spalte gibt keine Höhe
  vor, der Prozentwert fiel auf `auto` zurück, und `auto` ist auf einem
  größen-kontenierten Element null: Die Button-Karte zeigte 37 px gequetschten
  Inhalt in einer 0-px-Karte, die Mini-Klimakarte verschwand ganz.
  Sections-Ansichten waren nie betroffen.
- **M3 Occupancy Card — `max_visible`.** Die Option hatte keine Wirkung; die
  Liste wird jetzt bei der angegebenen Zahl gekappt, der Rest liegt hinter
  einem Umschalter.

### Geschwindigkeit

- **Karten rendern nicht mehr bei fremden Zustandsänderungen.** Home Assistant
  übergibt jeder Karte ein frisches `hass`-Objekt, sobald sich irgendwo im
  System etwas ändert — ein einzelner geschwätziger Stromsensor rendert so das
  ganze Dashboard neu. Jede Karte deklariert jetzt, was sie liest. Karten, die
  ihre Entitäten selbst suchen, beobachten zusätzlich die Anzahl der Entitäten,
  damit ein neu hinzugefügter Sensor weiterhin gefunden wird.
- **M3 Power Summary — Zähl-Animation.** Die Interpolation schrieb pro
  Animationsframe in reaktiven Zustand, obwohl der Wert vor der Anzeige
  gerundet wird — die meisten Frames rendern also identischen Text.
- Zusammen gemessen, dasselbe Dashboard mit 35 Karten, 20 Sekunden:
  **370 Renders → 12.**

### Achtung beim Update

Keine Konfigurationsoption wurde entfernt oder umbenannt, kein Standardwert in
`const.ts` hat sich geändert — bestehende Configs laden unverändert. Diese
Punkte ändern aber, was man **sieht**:

- **Alle Karten im hellen Theme.** Akzentfarbener Text und Datenflächen sind
  deutlich dunkler und gesättigter als in 2.0. Das ist die Behebung, kein
  Nebeneffekt — aber eine sichtbare Änderung.
- **Alle Karten.** Getönte Innenflächen sind jetzt deckend, statt die Tapete
  durchscheinen zu lassen. Die Karte selbst bleibt durchscheinend.
- **M3 Climate Card Mini** hat eine Mindesthöhe von 112 px. Eine kleiner
  konfigurierte Kachel wird darauf angehoben. 112 px ist die kleinste Höhe, bei
  der das kompakte Layout ohne Abschneiden passt — eine kleinere Kachel schnitt
  ihren Inhalt vorher bereits ab.

## [2.0.0]

Großes Funktions-Release: sechs neue Karten (23 → 29), optionale
Benachrichtigungen für mehrere Karten, eine überarbeitete Media Card und eine
von Grund auf neu strukturierte README. Enthält alle seit 1.9.0 gesammelten
Arbeiten (die zwischenzeitliche 1.9.1 wurde nie separat veröffentlicht und ist
hier aufgegangen).

### Bekannte Einschränkungen

- **Akzentfarben im hellen Theme**: Die Palette ist für dunkle Hintergründe
  entworfen (`#a58fe8` erreicht auf Weiß nur 2,4:1, auf `#1c1c1c` dagegen
  6,2:1). Werte, die in der Akzentfarbe gesetzt sind, wirken im hellen Theme
  deshalb blass. Kartenflächen und getönte Flächen sind mit dieser Version
  korrigiert; die rund 155 Vordergrund-Stellen über 17 Karten folgen in
  2.0.1, zusammen mit einer Überarbeitung der Palette.

### Achtung beim Update

Keine Konfigurationsoption wurde entfernt oder umbenannt, und kein Standardwert
in `const.ts` hat sich geändert — bestehende Configs laden unverändert. Diese
Punkte ändern aber das **Verhalten**, ohne dass man etwas anpasst:

- **M3 Media Card**: Die rechte Zeitangabe zeigt jetzt die **Restzeit mit
  Minuszeichen** statt der Gesamtdauer. Zurück mit `time_display: total`.
- **M3 Media Card**: Führende Tracknummern verschwinden aus dem Titel. Zurück
  mit `strip_track_number: false`.
- **M3 Media Card**: Bei Playern mit `BROWSE_MEDIA` erscheint die
  Bibliothekszeile, und die Transportknöpfe sind größer — **die Karte wird
  höher** und kann Dashboard-Layouts verschieben. Die Zeile lässt sich mit
  `show_browser: false` abschalten.
- **M3 Media Card**: Der Fortschritt ist wieder ein Wellen-Indikator statt
  einer geraden Linie.
- **M3 Button Card mit `show_slider: true`**: Ein Tap setzt jetzt den Wert an
  der getippten Position, statt auf die Tap-Aktion durchzufallen. Zum Schalten
  dient jetzt das Icon, dessen Standardaktion im Slider-Modus von More-Info auf
  den Domänen-Toggle wechselt — zurück mit `icon_tap_action: more-info`. Karten
  **ohne** `show_slider` sind nicht betroffen.
- **M3 Light Card**: Die Wellen-Geometrie ist schlanker (Strichstärke 14 → 6).
- **Alle Karten**: Glas-Hintergrund und getönte Flächen (Icon-Felder,
  Kacheln, Zeilen) werden jetzt aus der Kartenfläche gemischt statt gegen
  `transparent`. Im dunklen Theme ist der Unterschied
  minimal (die Karten werden leicht blickdichter), im hellen ist er groß —
  siehe „Behoben".

### Neu
- **M3 Cover Card** (`custom:m3-cover-card`): Rollladen- und
  Abdeckungssteuerung, die sich an die Fähigkeiten der Entität anpasst —
  Position, Lamellen-Neigung oder nur Auf/Zu, je nach `supported_features`.
  Einzel- und Gruppenmodus. Für Geräte ohne eigene Cover-Entität — etwa
  FingerBot-Antriebe an getrennten Schaltern — gibt es den `switch_pair`-Modus
  mit Auf-/Ab-/(optional) Stopp-Schalter; wo das Gerät keine Rückmeldung
  liefert, zeigt ein kurzes Tastenfeedback den ausgelösten Befehl.
- **M3 Leak Card** (`custom:m3-leak-card`): Überblick über Feuchte- und
  Leck-Sensoren mit den Zuständen OK, Alarm und „veraltet" (kein aktuelles
  Update). Optionaler Absperr-Knopf, der die Domäne der Absperr-Entität
  erkennt (`valve` / `switch` / `cover`). Optionale Benachrichtigung bei
  Wasseralarm.
- **M3 Waste Card** (`custom:m3-waste-card`): Abfuhrtermine als Hero mit
  „nächste Abfuhr in N Tagen", einer Zeitleiste über die nächsten zwei Wochen
  und einer Zeile je Tonne. Info- und Erinnerungsmodus, Hero-Icon einzeln oder
  mehrfach („N Tonnen"). Optionale Erinnerung zum Rausstellen zur eingestellten
  Uhrzeit. Erwartet Sensoren mit den Tagen bis zur Abfuhr (z. B. aus der
  Integration Waste Collection Schedule).
- **M3 Occupancy Card** (`custom:m3-occupancy-card`): Belegung nach Räumen
  statt nach einzelnen Sensoren. Fasst Präsenz-/Bewegungssensoren je Raum
  zusammen, zeigt „X von Y Räumen belegt" und je Raum „belegt/frei seit …".
  Automatische Erkennung über Bereiche oder eine manuelle Sensorliste.
  Optionale Benachrichtigung, wenn ein überwachter Sensor auslöst.
- **M3 Time Card** (`custom:m3-time-card`): Bearbeitet `input_datetime`-Helfer
  im Designsystem des Projekts, in mehreren Darstellungsvarianten
  (Stepper-Felder oder Scroll-Räder). Die Sichtbarkeit des
  „Übernehmen"-Knopfs ist einstellbar.
- **M3 Todo Card** (`custom:m3-todo-card`): Einkaufs- und Aufgabenlisten im
  Designsystem des Projekts, als Ersatz für HAs eingebaute `todo-list`-Karte.
  Header mit Zähler-Chip, Eingabezeile mit Radius-Morph beim Fokus, Einträge
  mit Häkchen-Morph vom Ring zum gefüllten Squircle, und ein Aufklappbereich
  für Erledigtes samt „Erledigte löschen".
- Einträge landen wahlweise oben oder unten in der Liste (`add_position`), und
  doppelte Einträge werden abgefangen: statt einer zweiten identischen Zeile
  pulst der vorhandene Eintrag kurz auf (`prevent_duplicates`).
- Schnellwahl-Chips über der Todo-Liste, gespeist aus einer festen Liste, aus
  zuvor abgehakten Einträgen oder aus den M3 Supply Cards des Dashboards — dort
  hinterlegte Einkaufstexte erscheinen als Chip, der knappste Vorrat zuerst.
- Langes Drücken öffnet eine Todo-Zeile zum Umbenennen oder Löschen. Optional
  Gruppierung nach `Kategorie: Artikel` und Umsortieren per Ziehgriff.
- Gemeinsame Benachrichtigungs-Infrastruktur für Occupancy-, Leak- und
  Waste-Karte: ein „Benachrichtigung"-Panel im Editor mit Dienst-Auswahl,
  optionalem Titel/Text und einem Schalter. Es legt eine — standardmäßig
  deaktivierte — Automatisierung an; Occupancy und Leak lösen bei einem
  Sensorwechsel aus, Waste zeitgesteuert zur Erinnerungszeit.
- **M3 Media Card — Bibliothek und Warteschlange**: Meldet der Player
  `BROWSE_MEDIA`, öffnet eine Zeile am Fuß der Karte HAs Medienbrowser —
  Breadcrumb-Navigation, Vorschaubild oder `media_class`-Icon je Zeile, Ordner
  zum Hineinnavigieren, abspielbare Einträge per Tap. Ein zweiter Reiter zeigt
  die Warteschlange, sofern die Integration eine liefert; Cast und Spotify tun
  das nicht und bekommen den Reiter gar nicht erst. Ebenen mit tausenden
  Einträgen werden bei 100 Zeilen gekappt (`show_browser`, `default_tab`,
  `browse_height`).
- **M3 Media Card — Metadaten und Chips**: Titel zweizeilig, Interpretenzeile
  mit Radio-Fallback über `media_channel`, dritte Zeile mit Album und Jahr.
  Darunter Chips für Ausgabegerät und Quelle, optional Titelnummer, Jahr und
  Bitrate über `meta_chips`. Führende Tracknummern werden entfernt
  (`strip_track_number`), ohne Titel wie `1979` oder `365 Dreams` anzutasten.
- **M3 Media Card — Fortschritt**: Wellen-Indikator, der beim Pausieren flach
  ausläuft. Streams ohne Dauer zeigen ein wanderndes Wellensegment und einen
  „Live"-Chip. Restzeit mit Minuszeichen, umschaltbar über `time_display`.
  Spulen mit 200-ms-Drosselung.

### Geändert
- **M3 Media Card**: Transportleiste in der Reihenfolge Shuffle · Zurück ·
  Play/Pause · Vor · Repeat, mit neuen Größen. Der Play-Knopf ist der
  Zustandsanzeiger der Zeile — Kreis pausiert, Squircle beim Abspielen, mit
  überblendendem Symbol. Repeat läuft jetzt dreistufig (aus → alle → einer).
  Alle Knöpfe morphen beim Tippen kurz die Ecken ein.
- **M3 Media Card**: `FEATURE.STOP` fehlte in der Feature-Maske. Player, die
  nicht pausieren, aber stoppen können, zeigen jetzt ein Stopp-Symbol.
- **M3 Media Card**: Die Akzentfarbe aus dem Cover ist nicht mehr der
  Durchschnitt aller Pixel — der ergibt Hintergrund plus Motiv addiert, also
  meist einen entsättigten Braunton. Stattdessen wird die dominante gesättigte
  Farbe gewählt und danach auf mindestens 3,2:1 gegen die dunkle Tinte
  gebracht. Ein Cover, das vorher `#4c3d56` bei 1,71:1 lieferte (praktisch
  unsichtbares Symbol), landet jetzt bei einem lesbaren Violett. Farbwechsel
  blenden über 400 ms über.
- **M3 Button Card**: Der Slider übernimmt jetzt auch beim Tippen, nicht nur
  beim Ziehen, und bleibt bei ausgeschaltetem Licht bedienbar. Das Icon wird
  im Slider-Modus zum Schalter.
- Drags auf Slidern und Rädern werden von Swipe-Plugins des Dashboards
  abgeschirmt (`shared/swipe.ts`), damit ein seitlicher Wisch nicht die
  Ansicht wechselt.
- **M3 Counter Card**: Optionale Korrektur des Zählerstands direkt im Header
  (opt-in und mit Warnhinweis), plus Fix der ARIA-Bereichsangabe im
  12-Stunden-Format.
- Rad-Drags der neuen Zeit-/Wähl-Elemente werden von Swipe-Plugins des
  Dashboards abgeschirmt, damit ein Drehen am Rad nicht die Ansicht wechselt.
- README von Grund auf neu strukturiert: ein Einsteiger-Katalog nach
  Themenbereichen, je Karte Code, Erklärung und ein eigenes Bild sowie ein
  aktualisiertes Gesamtbild mit allen Karten. Beispiel-Entitäts-IDs
  anonymisiert.

### Behoben
- **Alle Karten im hellen Theme**: Der Glas-Hintergrund mischte seinen
  Schleier aus `--primary-text-color`. Im hellen Theme ist die dunkel, sodass
  die Fläche den Hintergrund zusätzlich verdunkelte — und darauf stand dann
  dunkler Text. Über einem dunklen Dashboard-Hintergrundbild waren die Karten
  praktisch unlesbar. Gemischt wird jetzt aus der Kartenfläche, die HA ohnehin
  themekorrekt liefert: hell im hellen Theme, dunkel im dunklen. Damit stimmt
  der Kontrast von selbst, ohne Theme-Erkennung und unabhängig davon, was
  hinter dem Dashboard liegt. Bestand seit 1.0.0.
- **Alle Karten im hellen Theme**: `tintBackground` mischte getönte Flächen
  ebenfalls gegen `transparent` — eine 14-%-Tönung war damit zu 86 %
  durchsichtig, und was durchschien, war der Schleier über dem
  Hintergrundbild. Icon-Felder, Kacheln und Balken waren dadurch kaum zu
  erkennen. Gemischt wird jetzt in die Kartenfläche, wodurch die Tönung
  definiert ist und in beiden Themes gleich stark wirkt.
- **M3 Light Card**: Die Wellenanimation rief bei jedem Frame
  `requestUpdate()` und baute damit die komplette Karte samt Farbrad neu auf,
  solange eine Lampe an war. Eine Instanz erzeugte 1820 Renders in 15 Sekunden
  — 73 % eines Dashboards mit 35 Karten. Der Frame schreibt jetzt nur noch das
  `d`-Attribut des einen Pfades: 1820 → 9.
- **M3 Media Card**: Dieselbe Ursache im Fortschrittsbalken — ein `@state`-Feld
  mit Millisekunden-Genauigkeit wurde in `updated()` neu berechnet, sodass
  jeder Render den nächsten auslöste. Die präzise Position ist jetzt entkoppelt,
  reaktiv ist nur noch die ganze Sekunde.
- **M3 Media Card**: Der Power-Knopf der Kompaktansicht trug den Icon-Namen als
  `aria-label`. Alle Icon-Knöpfe haben jetzt lokalisierte Beschriftungen.

### Leistung
- `shouldUpdate` in 15 von 29 Karten (`shared/should-update.ts`). HA weist
  `hass` bei jeder Zustandsänderung im gesamten System neu zu, sodass bisher
  jede Karte bei jedem fremden Sensor neu rendert. Umgestellte Karten rendern
  nur noch, wenn eine ihrer eigenen Entitäten sich ändert. Bewusst ausgenommen
  sind Karten mit Auto-Discovery und solche, deren Entitäten aus dem
  Energie-Dashboard, Statistiken oder der Registry stammen — dort ließe sich
  die Liste nicht vollständig ableiten, und eine unvollständige Liste würde
  eine Karte still aufhören lassen zu reagieren.
- Intl-Formatter werden zwischengespeichert statt bei jedem Aufruf neu gebaut
  (41 Stellen, teils pro Listenzeile pro Render).

### Aufgeräumt
- 27 ungenutzte Konstanten und 30 tote Übersetzungsschlüssel entfernt;
  `noUnusedLocals` und `noUnusedParameters` sind jetzt aktiv.
- Button- und Cover-Karte waren die einzigen zwei von 23 Karten mit Timern
  ohne `disconnectedCallback`; der Arm-Timeout der Leak-Karte wurde nie
  verfolgt. Alle drei räumen jetzt auf.
- Die neun kartenspezifischen `_formatNumber` nutzen jetzt die gemeinsame
  Funktion. Zwei davon fingen einen unbrauchbaren Locale-Tag ab, sieben nicht
  — der Schutz gilt jetzt für alle.

## [1.9.0]

### Neu
- **M3 Supply Card** (`custom:m3-supply-card`): Vorratsverwaltung für
  Verbrauchsmaterial. Ein Vorrat steht groß als Hero mit einem Punkt je
  verbleibender Einheit (ab 40 Stück ein Balken), Stepper mit Wiederholung
  beim Halten und ein „Packung nachgefüllt"-Knopf; weitere Vorräte folgen als
  Zeilen mit Füllstandsbalken, ein Tap macht sie zum Hero. Zustandsfarben und
  Schwellwerte sind pro Artikel einstellbar.
- Reichweiten-Schätzung aus der Historie des Helfers. Geteilt wird durch den
  Zeitraum, den die Daten tatsächlich abdecken, nicht durch das angefragte
  Fenster — der Recorder bewahrt standardmäßig nur 10 Tage auf, sonst
  verspräche die Karte die dreifache Reichweite. Eine Schätzung erscheint erst
  nach mindestens 3 Verbrauchsereignissen und 2 Tagen Beobachtung; wer sofort
  eine Zahl will, setzt `usage_per_week`.
- Benachrichtigung, wenn ein Vorrat zur Neige geht: als Abend-Digest mit allen
  Vorräten in einer Nachricht, wöchentlich oder sofort beim Unterschreiten.
  Auslöse-Niveau wählbar zwischen leer, kritisch und knapp, jeweils über die
  Schwellwerte des einzelnen Artikels. Über `notify_items` lässt sich die
  Meldung auf einzelne Vorräte begrenzen statt auf alle der Karte.
- Anbindung an die To-do-Listen von Home Assistant: ein Chip im Hero schreibt
  den Vorrat auf die Einkaufsliste, `auto_add_to_list` erledigt es ungefragt
  in der Automatisierung — inklusive Dublettenprüfung, damit eine tägliche
  Erinnerung die Liste nicht vollschreibt.

## [1.8.2]

### Behoben
- **Alle Karten mit Benachrichtigung** (Updates, Akku, Steckdosen, NAS): Die
  vom Editor erzeugte Automatisierung stürzte ab, sobald man sie im
  Automatisierungs-Menü von Hand ausführte — also genau bei dem Versuch, das
  Ankommen der Push zu testen. „Ausführen“ überspringt den Auslöser und
  startet die Aktionen ohne Auslöser-Kontext; jede Textvorlage las aber
  `trigger.to_state` und lief in einen `UndefinedError`, ohne dass eine
  Benachrichtigung rausging. Die Vorlagen greifen jetzt auf `s` zu — beim
  echten Auslöser die auslösende Entität, beim Handstart eine
  Beispiel-Entität. Bevorzugt wird eine, auf die die Bedingung gerade
  zutrifft, damit der Test die echte Formulierung mit echten Werten zeigt
  statt eines Geräts, dem nichts fehlt.
- **Versionsstempel**: `CARD_VERSION` stand seit dem ersten Release auf
  `1.0.0`. Die Konsolen-Zeile jeder Karte (`M3-BATTERY-CARD v1.0.0`) nannte
  damit eine Version, die es nie gab — ausgerechnet die Angabe, nach der man
  bei einer Fehlermeldung als Erstes fragt. Steht jetzt auf `1.8.2`.
- **Versionsstempel in der Konfiguration**: `stampVersion()` lief im
  `setConfig()` der Karte und beschrieb damit nur die Kopie im
  Arbeitsspeicher — gespeichert wurde der Stempel nie, kein einziges
  `card_version` landete je in einem Dashboard. Gestempelt wird jetzt beim
  Verlassen des Editors, also auf dem einzigen Weg, auf dem eine
  Konfiguration tatsächlich geschrieben wird.

- **M3 NAS Card**: Die Benachrichtigung ging nie raus — bei keinem Auslöser.
  Die Namenstabelle wurde als roher JSON-Text in `variables` geschrieben;
  Home Assistant reicht so etwas als Zeichenkette weiter, und der Zugriff
  `nas_names.get(...)` scheiterte an „NodeStrClass object has no attribute
  'get'“. In `{{ }}` gefasst rendert HA sie zu einem echten Dictionary.
- **M3 Updates Card**: Meldung und Liste sagten „Update“ doppelt („AdGuard
  Home Update: Update auf 6.2.1 verfügbar“, Zeile „M3 Cards Update“). Der
  `friendly_name` einer Update-Entität endet auf das Wort, das die Karte mit
  Überschrift und Versionsspalte ohnehin sagt. Add-ons und Integrationen
  liefern ein sauberes `title`-Attribut, HACS-Einträge nicht — dort wird die
  Endung jetzt abgeschnitten. Betrifft Einzelmeldung, Sammelmeldung, die
  Update-Liste und die Liste der nicht erreichbaren Komponenten, die einen
  Namen ab sofort alle gleich bilden.

## [1.8.1]

### Geändert
- Nur Dokumentation, keine Änderung am ausgelieferten `m3-cards.js` — das
  Bundle ist byte-identisch mit v1.8.0.
- Neues Übersichtsbild mit allen 22 Karten; das bisherige zeigte noch die
  ersten achtzehn.
- Eigene Screenshots für die M3 Updates Card, die M3 NAS Card und die
  M3 System Card in ihren jeweiligen Abschnitten.
- Die Bildunterschrift des Übersichtsbilds behauptete, alle Namen seien
  generische Demo-Daten. Das stimmte für die Aufnahme nicht; sie nennt jetzt
  die Karten, die für das Bild simulierte Zustände zeigen.

Grund für das Release: HACS rendert das README des veröffentlichten Stands,
nicht das des Standard-Branches. Die Bilder wurden nach dem Tag v1.8.0
ergänzt und waren dort deshalb nicht sichtbar.

## [1.8.0]

### Hinzugefügt
- **Neue Karte: M3 Updates Card** (`custom:m3-updates-card`). Übersicht aller
  verfügbaren Updates in einer Kachel.
  - **Header** in der gemeinsamen Designsprache der Listen-Karten: Icon
    links, Kartenname als Titel, Status als Untertitel („Alles aktuell“ /
    „{n} Updates verfügbar“ / „{name} wird installiert“) und ein Zähler-Chip
    rechts.
  - **Kern-Boxen** für Core, Betriebssystem und Supervisor mit
    `{installed} → {latest}`, MAJOR-Badge und Install-Button. Die
    MAJOR-Erkennung versteht beide Versionsschemata: bei
    HA-Kalenderversionen (`2026.8.1`) zählt der Wechsel von Jahr oder Monat,
    bei SemVer (`5.8.0`) die erste Zahl.
  - **Bestätigungsschritt** vor Kern-Updates (`require_confirm`, Standard an).
    Der Button entschärft sich nach fünf Sekunden von selbst — auf einem
    Wandtablet soll kein scharfer „startet-HA-neu“-Button liegenbleiben.
  - **Gruppierung über die Integration** statt über den `entity_id`-Namen. Bei
    eingebundener zweiter Instanz hätte eine Namensregel zwei
    ununterscheidbare Core-Boxen erzeugt; die zweite Instanz bekommt jetzt
    eine eigene Gruppe. Reihenfolge und Sichtbarkeit der Gruppen sind im
    Editor per Pfeiltasten bzw. `include_types` einstellbar.
  - **Backup-Chip** im Header (`backup_entity`), grün bis `backup_warn_days`,
    danach orange, ohne Zeitstempel rot.
  - **Übersprungene Updates** stehen gedimmt am Ende mit eigenem Button zum
    Wiederanzeigen — und zählen nicht mehr als „aktuell“.
  - **Aufklappbereich** für bereits aktuelle Komponenten, `max_visible` für
    die Update-Liste selbst.
  - **Benachrichtigung** sofort, täglich oder wöchentlich, mit denselben
    Freitextfeldern wie die übrigen Karten.
  - **Verbindungsverlust** während eines Core-Updates wird als solcher
    angezeigt statt als eingefrorenes Banner.
  - Nicht erreichbare Update-Entities zählen nicht als „aktuell“ und lassen
    sich unter den erreichbaren Komponenten aufklappen — mit Gruppe statt
    Version, damit sichtbar wird, welche Integration gerade nichts liefert.
- **Neue Karten: M3 NAS Card und M3 System Card** (`custom:m3-nas-card`,
  `custom:m3-system-card`). Speicherbelegung pro Volume mit Balken, darunter
  CPU, RAM, Temperatur und Netzwerk als Statuskacheln, dazu der Zustand der
  Syncthing-Ordner. Beide teilen sich eine Implementierung und unterscheiden
  sich nur in der Datenquelle: Glances für ein NAS, System Monitor für die
  eigene Instanz.
  - Entitäten werden über den `translation_key` der Entity-Registry erkannt,
    nicht über den Anzeigenamen — den übersetzt Home Assistant, eine
    Namensregel funktioniert nur in einer Sprache.
  - Fehlt ein Prozent-Sensor (System Monitor liefert `disk_use_percent`
    standardmäßig deaktiviert), wird die Belegung aus „belegt“ und „frei“
    berechnet, statt das Volume wegzulassen.
  - Laufwerkssensoren haben Vorrang vor SoC-Thermals — sonst zeigt die Karte
    49 °C, während die Platten bei 32 °C liegen.
  - Mount-Pfade werden gekürzt (`/rootfs` entfällt, UUID-Volumes werden zu
    „Volume a1b2c3d4“), `mount_names` überschreibt das.
  - **Benachrichtigungen** für Sync-Fehler (inklusive `pull_errors`, die auch
    bei Zustand `idle` auftreten), volle Platten und ausbleibende Daten.
    Pausierte Ordner lösen bewusst nichts aus.
- **Eigene Benachrichtigungstexte.** Jedes Benachrichtigungs-Panel hat jetzt
  zwei Freitextfelder für Titel und Nachricht. Leer lassen behält den
  bisherigen Text, sodass sich für bestehende Konfigurationen nichts ändert.
  Platzhalter in geschweiften Klammern werden beim Anlegen der
  Automatisierung durch die passende Vorlage ersetzt; welche es gibt, steht
  je Karte direkt unter den Feldern:
  - Energy: `{wert}`, `{einheit}`, `{zeitraum}`
  - Cost: `{betrag}`, `{waehrung}`, `{budget}`, `{zeitraum}`
  - Battery: `{anzahl}`, `{liste}`, `{geraet}`, `{wert}`
  - Progress: `{geraet}`
  - Power List: `{geraet}`, `{watt}`, `{stunden}`
  - Climate Overview / Top Consumers: `{anzahl}`, `{liste}`
  - Aquarium: `{tage}`
  Emoji sind möglich. Unbekannte Platzhalter bleiben sichtbar stehen, statt
  stillschweigend zu verschwinden — ein Tippfehler fällt so in der Nachricht
  auf, statt eine Lücke zu hinterlassen.

### Behoben
- **M3 Climate Overview Card**: Die Namen an der Vergleichsskala waren
  entweder alle weg oder unlesbar übereinander. Bis acht Räume wurde jeder
  Name gezeichnet — mittig auf seinem Punkt, ohne Prüfung, ob daneben schon
  einer steht; ab neun Räumen fiel die Beschriftung komplett weg. Liegen
  Räume dicht beieinander, überlagerten sich die Namen zu Buchstabensalat.
  Jetzt werden die Namen kollisionsfrei auf zwei Reihen verteilt: kältester
  und wärmster Raum zuerst, damit die Enden der Skala nie ihren Namen
  verlieren, der Rest von links nach rechts, solange Platz ist. Namen am
  Rand rutschen nach innen statt aus der Karte zu ragen. Neue Option
  `show_scale_labels`, falls nur die Punkte gewünscht sind.

## [1.7.0]

### Hinzugefügt
- **Benachrichtigungen direkt aus dem Kachel-Editor.** Acht Karten können
  jetzt eine echte Home-Assistant-Automatisierung anlegen, die auch
  benachrichtigt, wenn kein Dashboard geöffnet ist. Jede hat im Editor einen
  Abschnitt „Benachrichtigung" mit Ein/Aus-Schalter (standardmäßig aus),
  Empfängerauswahl aus den eigenen `notify.*`-Diensten und einer Statuszeile,
  die den tatsächlichen Zustand der Automatisierung anzeigt:
  - **M3 Battery Card** — schwache Batterien; täglich oder wöchentlich als
    Sammelnachricht, oder sofort beim Unterschreiten. Freier Schwellwert
    (Standard 1 %), plus `notify_exclude_entities`, um einzelne Geräte
    stummzuschalten, ohne sie aus der Kachel zu entfernen.
  - **M3 Energy Card** — Tagesertrag bzw. Monatsabschluss.
  - **M3 Cost Card** — Warnung bei fast erreichtem Budget (Standard 90 %)
    und Monatsabschluss.
  - **M3 Progress Card** — „Gerät ist fertig", ausgelöst nur beim echten
    Übergang von einem Lauf- in einen Fertig-Zustand.
  - **M3 Power List Card** — „Gerät läuft seit N Stunden", mit Schwellwert,
    Dauer und Ausschlussliste für Dauerläufer.
  - **M3 Climate Overview Card** — täglicher Digest zum Schimmelrisiko,
    exakt nach derselben Regel wie das Warnsymbol der Kachel.
  - **M3 Top Consumers Card** — Wochenrangliste, sofern die Verbraucher über
    wöchentliche `utility_meter`-Helfer laufen (siehe Einschränkung unten).
  - **M3 Aquarium Card** — die bestehende Reinigungs-Erinnerung nutzt jetzt
    dieselbe Basis und denselben Schalter.

### Geändert
- Die Benachrichtigungs-Mechanik liegt jetzt in einem gemeinsamen Modul
  (`shared/notify-editor.ts`) statt je Karte dupliziert zu sein.
- Das Empfängerfeld hieß „Benachrichtigung an", was sich im Deutschen wie
  ein Ein-Schalter liest. Es heißt jetzt „Empfänger".

### Behoben
- **M3 Power List Card**: Mit gesetztem `max_visible` wurden alle
  ausgeblendeten Geräte als inaktiv behandelt — auch die, die gerade Strom
  verbrauchen und nur wegen des Limits nach unten gerutscht sind. Sie
  erschienen ausgegraut mit durchgestrichenem Stecker-Symbol, und der Zähler
  am Umschalter zählte sie als „inaktive Geräte" mit. Aktive Geräte behalten
  jetzt auch aufgeklappt ihre normale Darstellung und stehen dort oben; der
  Umschalter heißt in dem Fall „N weitere Geräte anzeigen".
- **M3 Power List Card**: Die Balkenlängen richten sich jetzt nach dem
  stärksten Verbraucher insgesamt statt nur nach dem der sichtbaren Zeilen —
  bei Sortierung nach Name oder aufsteigender Leistung konnte der größte
  Verbraucher sonst aus der Skala fallen.
- **M3 Battery Card**: `notify_service` war als Konfigurationsfeld
  deklariert, wurde aber nirgends ausgewertet und hatte keine Wirkung.
- Automatisierungs-IDs wurden aus dem Kartennamen abgeleitet, wodurch zwei
  gleichnamige Karten dieselbe Automatisierung überschrieben. Sie werden
  jetzt einmalig erzeugt und in der Kartenkonfiguration abgelegt; bestehende
  Automatisierungen werden dabei übernommen, nicht verwaist.
- **M3 Energy Card**: Der Meldungstext behauptete „Heute verbraucht", sobald
  die Karte nicht ausdrücklich im Solar-Modus lief — falsch für den
  häufigen Fall, eine Standard-Karte auf einen Erzeugungszähler zu richten.
  Der Text ist jetzt neutral („Heute:"), im Solar-Modus weiterhin „Heute
  erzeugt:".

### Einschränkungen
Ein Jinja-Template in einer Automatisierung kann die Langzeitstatistik nicht
lesen — nur den aktuellen Zustand einer Entität. Energy, Cost und Top
Consumers beziehen ihre Zahlen aber genau daher. Diese drei funktionieren
deshalb nur, wenn eine Entität den Periodenwert bereits als Zustand hält,
also ein periodengebundener `utility_meter`. Ist das nicht der Fall, bleibt
der Schalter gesperrt und der Editor nennt den Grund, statt eine
Automatisierung zu erzeugen, die plausible, aber falsche Zahlen meldet.

## [1.6.0]

### Hinzugefügt
- **M3 Aquarium Card**: Reinigungs-Erinnerung direkt aus dem Kachel-Editor.
  Im Abschnitt „Wartung → Erinnerung“ lassen sich ein oder mehrere
  Benachrichtigungsziele (aus den eigenen `notify.*`-Diensten) und eine
  tägliche Prüfzeit wählen; ein Klick auf „Erinnerung einrichten“ legt eine
  echte Home-Assistant-Automatisierung an, die auch dann benachrichtigt,
  wenn kein Dashboard geöffnet ist. Fehlt ein Intervall-Helfer, wird er
  automatisch mit angelegt. Erneutes Klicken aktualisiert dieselbe
  Automatisierung, statt Duplikate zu erzeugen.
- **M3 Aquarium Card**: neue Option `cleaning_interval_entity` — ein
  `input_number`-Helfer als Reinigungsintervall. Hat Vorrang vor der festen
  Zahl und wird von Kachel-Chip und Erinnerungs-Automatisierung gemeinsam
  gelesen, sodass beide nicht auseinanderlaufen können.

## [1.5.0]

### Hinzugefügt
- **M3 Aquarium Card** (`custom:m3-aquarium-card`) — neue Karte:
  Geräte-Raster (Taglicht, Nachtlicht, Pumpe, Heizer, CO2 + beliebig
  viele weitere Geräte), Tagesbogen-Beleuchtungsplan (manuelle
  Phasenliste oder `schedule`-Helfer), optionale Kamera als Standbild,
  Banner oder echter Live-Stream, Status-Chips (Temperaturabweichung,
  Heizer ohne Leistung, Wasserstand, pH/TDS, fällige Reinigung) und
  vollständiger visueller Editor.
- **M3 Climate Overview Card**: individuelle Farbe pro Raum
  (`rooms[].color`) — überschreibt die automatische Temperatur-Einfärbung
  für einzelne Thermometer, statt nur die fünf globalen Farbstufen zu
  nutzen.
- **Farbstärke-Regler**: jede Karte, die eine Akzent-/Themenfarbe als
  Hintergrund-Tönung verwendet, hat jetzt einen 0–100-Regler direkt neben
  der Farbauswahl im Editor, der steuert, wie kräftig diese Farbe den
  Hintergrund einfärbt (ersetzt die bisher fest einprogrammierten
  Prozentwerte). Unveränderte Karten sehen dabei exakt wie vorher aus —
  der Regler startet immer beim bisherigen Standardwert.
- Deutsche Farbnamen (`grau`, `rot`, `blau`, `grün`, `gelb`, `lila`/
  `violett`, `rosa`, `braun`, `schwarz`, `weiß`, `türkis`, `hellblau`,
  `hellgrün`, `dunkelgrau`) werden jetzt in jedem Farbfeld erkannt, nicht
  nur die englischen Namen.

### Behoben
- **M3 Climate Overview Card**: die Editor-Option „Akzentfarbe“ hatte
  keinerlei Effekt — sie wurde beim Rendern der Karte nie ausgelesen.
  Färbt jetzt korrekt das Header-Icon ein.
- Ein deutscher Farbname wie `grau` in einem Farbfeld ergab bisher keine
  gültige CSS-Farbe und ließ den betroffenen Hintergrund komplett
  durchsichtig werden, statt eine sichtbare Fehlermeldung oder zumindest
  eine erkennbare Farbe zu liefern (siehe „Hinzugefügt“ oben).
- Energie-Statistiken (u.a. Energy-, Cost-, Power-Karten): ein negativer
  „Change“-Wert für einen Zeitraum wird jetzt auf 0 begrenzt, statt
  Balken/Durchschnitte/Summen zu verfälschen — trat vereinzelt auf, wenn
  der Recorder beim Neuladen einer Entität genau an einer Tagesgrenze die
  Kontinuität der Langzeitstatistik verliert und den Wert nach einem
  Zähler-Reset fälschlich als Abnahme statt als neuen Zyklus verbucht.

## [1.4.0]

### Hinzugefügt
- **M3 Counter Card**: neuer Editor-Abschnitt „Kalibrierung“ für
  `utility_meter`-Entitäten — Zählerstand direkt aus dem Dashboard-Editor
  auf einen neuen Wert setzen (z.B. um ihn an einen analogen Zähler
  anzugleichen), ohne Umweg über die Entwicklerwerkzeuge. Erscheint
  automatisch nur bei passenden Entitäten, die Statistik-Historie bleibt
  unangetastet.

### Geändert
- **M3 Energy Card**: die Monatsansicht zeigt jetzt immer alle 12 Monate
  (mit Null für Monate vor Erstellung der Entität) statt bei fehlender
  Historie komplett zu blockieren — verhält sich damit wie länger
  bestehende Zähler.
- **M3 Energy Card**: der Monats-Durchschnitt wird nur noch über Monate mit
  echten Daten gemittelt, statt durch Platzhalter-Nullen vor Erstellung der
  Entität verwässert zu werden.

## [1.3.0]

### Hinzugefügt
- **M3 Energy Card**: neue Option `unit`, um die angezeigte Einheit zu
  überschreiben — nötig für abgeleitete Zähler (z.B. Utility-Meter-Helfer),
  die keine eigene `unit_of_measurement` melden und sonst pauschal "kWh"
  anzeigen würden.

## [1.2.0]

### Hinzugefügt
- **M3 Cost Card**: neuer Preis-Einheit-Modus `custom` — frei definierbare
  Einheit (z.B. "€/m³") plus ein Mengen-Umrechnungsfaktor, damit die Karte
  auch für Wasser, Gas oder beliebige andere Zähler funktioniert, nicht nur
  für kWh-Strompreise.

## [1.1.0]

### Hinzugefügt
- **M3 Climate Overview Card** — raumweise Übersicht aller Temperatur-/
  Feuchte-Sensoren, automatisch gruppiert nach Bereich (Fallback: Gerät
  oder Entity-Name), mit Farbstufen, Vergleichsskala, Hinweis-Chip für
  den auffälligsten Raum sowie optionalen Trendpfeilen und
  Schimmel-Warnungen.
- **M3 Light Card**: echte Farbtemperatur-Steuerung (Presets + Slider),
  HS-Farbrad mit Palette, Szenen-Zeile und Gruppenmitglieder-Liste für
  Licht-Gruppen — inkl. vollständiger Editor-Unterstützung.
- **M3 Energy Flow Card**: Batterie-Knoten im Fluss-Diagramm, `battery_color`
  und `show_battery` sind jetzt tatsächlich wirksam.

### Geändert
- M3 Climate Card und M3 Energy Flow Card nutzen jetzt das gemeinsame
  Erscheinungsbild-Panel im Editor (Eckenradius-Presets, Ecken einzeln).
- Englisches README ist jetzt Standard, Deutsch liegt unter `README.de.md`.

## [1.0.0] — Erste Veröffentlichung (Beta)

Erste öffentliche Version.
