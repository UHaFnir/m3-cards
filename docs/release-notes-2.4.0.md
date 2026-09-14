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
  suite's Expressive sliders. The dock is discovered as the separate device it
  is — without that the card loses the tanks, the dust emptying and the mop
  washing.

- **M3 Vacuum Maintenance Card** (`m3-vacuum-maintenance-card`) — filters,
  brushes, sensors and mop with the life they have left, plus **reminders for
  the chores nothing counts**. "Change the mop every three runs" is not a
  sensor; the card works out when it is due, shows it, and lets it be ticked
  off. Both vacuum cards can build real Home Assistant automations from their
  editors.

- **M3 Printer Card** (`m3-printer-card`) — a 3D printer as one card instead of
  sixteen tiles. Built against Bambu Lab's integration and deliberately not tied
  to it: `state_map` and a three-pass resolver mean OctoPrint, Moonraker and
  Prusa Connect land in the right blocks too, and a value nothing recognises
  reads as idle rather than as an error. The camera is a still, not a stream,
  and the badge says so. The socket the printer hangs on stays usable while
  everything else dims — it is the one control that can bring the machine back.

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

### Behaviour changes

- **The aquarium card's schedule bar is redrawn.** Same data, same behaviour —
  it is now the same geometry as the suite's discrete sliders, with real gaps
  either side of each handle, so the aquarium's day and the vacuum's suction
  scale read as one control rather than two designs in one suite.

- **A chip button for a stateless domain no longer prints a state.** A scene
  showed a timestamp and a script showed "off", neither of which says anything.
  `show_state: true` brings it back for anyone who wants it.

---

**Deutsche Fassung**

**Beim Update:** keine Konfigurationsoption wurde entfernt oder umbenannt,
bestehende Konfigurationen laden unverändert. Zwei Dinge sehen anders aus, ohne
dass jemand darum gebeten hätte: der Zeitplanbalken der Aquarium-Karte ist in
der Form neu gezeichnet, die die übrigen Regler der Sammlung verwenden, und ein
Chip-Knopf für eine Szene, ein Skript oder einen Button schreibt keinen Zustand
mehr unter seinen Namen. Siehe „Achtung beim Update" am Ende.

Das Maschinen-Release. Vier der fünf neuen Karten drehen sich um etwas, das eine
Aufgabe erledigt und dann wieder stillsteht: ein Saugroboter und seine Wartung,
ein 3D-Drucker, und die Haushaltsgeräte, die vorher eine Reihe Kacheln mit
„Standby" waren. Sie teilen einen Gedanken — **der Zustand entscheidet, was
gezeichnet wird** —, weil eine ruhende Maschine nichts über Fortschritt zu sagen
hat und ein Dashboard, das das Feld trotzdem stehen lässt, die meiste Zeit einen
Strich anzeigt.

Daneben die Änderung, die alle Karten betrifft: **alle eigenen Textfelder jeder
Karte nehmen jetzt Jinja2-Templates.** Name, Symbol, Farbe, Beschriftung — was
eine Karte aus ihrer eigenen Konfiguration liest — wird über den
`render_template`-Websocket von Home Assistant abonniert und bekommt einen neuen
Wert gepusht, sobald sich etwas ändert, das das Template liest. Bisher hieß eine
zusammengesetzte Beschriftung: ein Template-Sensor in der `configuration.yaml`,
für jede Karte, die einen wollte.

Die Sammlung registriert 44 Karten.

### Neu

- **M3 Vacuum Card** (`m3-vacuum-card`) — der Roboter selbst: wo er ist, was er
  tut, und die Handvoll Bedienelemente, die man tatsächlich drückt. Jeder Befehl
  wird optimistisch gezeichnet, weil die Integration alle dreißig Sekunden
  nachfragt und von sich aus nichts schickt; ein Druck, der eine halbe Minute
  lang nichts bewirkte, las sich als kaputter Knopf. Räume sind Chips aus
  `vacuum.clean_area` und werden nur angeboten, wenn die Fähigkeitsbits der
  Maschine sagen, dass sie sie bedienen kann. Saugstufe und Wischmenge bekommen
  die Expressive-Regler der Sammlung. Die Station wird als das eigene Gerät
  erkannt, das sie ist — ohne das fehlen der Karte Tanks, Staubentleerung und
  Moppwäsche.

- **M3 Vacuum Maintenance Card** (`m3-vacuum-maintenance-card`) — Filter,
  Bürsten, Sensoren und Mopp mit ihrer Restlaufzeit, dazu **Erinnerungen für die
  Aufgaben, die niemand zählt**. „Alle drei Fahrten den Wischmopp wechseln" ist
  kein Sensor; die Karte rechnet aus, wann es fällig ist, zeigt es und lässt es
  abhaken. Beide Saugerkarten können aus ihren Editoren heraus echte
  Automationen anlegen.

- **M3 Printer Card** (`m3-printer-card`) — ein 3D-Drucker als eine Karte statt
  sechzehn Kacheln. Gegen die Bambu-Lab-Integration gebaut und bewusst nicht an
  sie gebunden: `state_map` und ein dreistufiger Auflöser sorgen dafür, dass
  OctoPrint, Moonraker und Prusa Connect ebenfalls in den richtigen Blöcken
  landen — und was niemand erkennt, gilt als bereit und nicht als Fehler. Die
  Kamera ist ein Standbild, kein Stream, und das Abzeichen sagt es auch. Die
  Steckdose, an der der Drucker hängt, bleibt bedienbar, während alles andere
  abdunkelt: sie ist das Einzige, was die Maschine zurückholen kann.

- **M3 Appliance Card** (`m3-appliance-card`) — Waschmaschine, Trockner, Ofen,
  Kühlschrank, Kaffeemaschine, Katzenklo, Drucker, NAS: die Geräte mit Auftrag,
  Phase und Endzeit — mit einer Karte, die die Phase zeigt, solange etwas läuft,
  und aus dem Weg geht, wenn nicht.

- **M3 Search Card** (`m3-search-card`) — ein Material-3-Suchfeld über
  Entitäten, Bereiche und Geräte, mit einer Schnellleiste auf dem Treffer.

- **Jinja2-Templates in allen eigenen Textfeldern jeder Karte.** Templates in
  einer *verschachtelten* Kartenkonfiguration bleiben bewusst unangetastet und
  werden dieser Karte wörtlich übergeben — sie rendert sie selbst, und zwar live.

- **Ein Kompaktmodus für die Lichtkarte** (`compact: true`): ohne Ein/Aus-Knopf,
  dafür schaltet das Symbol in der Kopfzeile — dieselbe Aufteilung wie bei der
  nativen Tile-Karte. Es geht um Breite in einem zweispaltigen Raster.

- Kleineres: `show_color_temp` für die Lichtkarte, eine Aktion auf der Kopfzeile
  der Raumkarte, konfigurierbares Tippen und Halten auf der Anwesenheitskarte
  samt Feldern im Editor, Popups pro Person ebendort, ein Popup für die
  Gerätekarte und `source: synology_dsm` für die NAS-Karte.

### Geändert

- **Der gemeinsame Popup-Rahmen nimmt Titel und Größe.** Beides freiwillig; wer
  nichts übergibt, bekommt genau das Bisherige.

- **Das `hold_action` der Anwesenheitskarte läuft über den gemeinsamen
  Handler.** Vorher setzte sie zwei Arten selbst um und ignorierte den Rest
  stillschweigend — `more-info`, `toggle` und `perform-action` taten nichts, und
  nichts sagte es.

- **Der Regelabgleich für Zustände und die Zuordnung Domäne → Standardaktion
  sind gemeinsame Helfer** statt privater Methoden auf zwei Karten, die beide
  dieselben Antworten brauchen.

- **Die Benachrichtigungen der NAS-Karte lösen ihre Datenträger über die
  Erkennung der Karte auf**, damit der Auslöser „Datenträger voll" auf einer
  m3-system-card etwas zu beobachten findet.

- **Die Saugerkarten benutzen Kopfzeile und Falt-Pfeil der Sammlung** statt
  eigener Kopien. Der Pfeil liegt jetzt an einer Stelle, sodass die nächste
  faltbare Karte ihn erbt.

### Achtung beim Update

- **Der Zeitplanbalken der Aquarium-Karte ist neu gezeichnet.** Gleiche Daten,
  gleiches Verhalten — er hat jetzt dieselbe Geometrie wie die Regler der
  Sammlung, mit echten Lücken beidseits jedes Griffs. Der Tag im Aquarium und
  die Saugstufe lesen sich damit als ein Bedienelement statt als zwei Entwürfe.

- **Ein Chip-Knopf einer zustandslosen Domäne schreibt keinen Zustand mehr
  hin.** Eine Szene zeigte einen Zeitstempel, ein Skript „aus" — beides sagt
  nichts. `show_state: true` holt es zurück.
