# M3 Cards 2.4.1

**Upgrading:** no configuration option was removed or renamed, so existing
configs load unchanged. Two things look different without having been asked
for: the two setpoints of a heat/cool thermostat are now drawn in the heat and
cool colours instead of plain text, and a chip row that scrolls now fades at
the edge it is hiding something behind. Both follow colours and options you
have already set.

A small release about things the cards were not saying. A thermostat in
heat/cool mode showed two numbers and left you to work out which was which. A
counter card with `adjustable: true` pointed at a plain sensor drew no pencil
and gave no reason. A chip row with more chips than fit simply ended at the
card's edge. None of these was a crash, and all three were the card knowing
something and keeping it to itself.

The suite registers 44 cards.

### Added

- **The counter card can correct a `utility_meter`.** Its pencil could write an
  `input_number` or shift an offset helper — the two cases the author happened
  to have, and not the common one: an energy or water reading is a
  `utility_meter` far more often than it is a helper. Pointed at one, the
  pencil now calls `utility_meter.calibrate`, behind a confirmation that names
  the old reading, the new one, and what the statistics engine will do about
  the difference. A meter carries history and the rewrite cannot be undone from
  the card, so the question is asked before anything is sent.

  It refuses the tempting shortcut on purpose. A meter must never be corrected
  through its *source*: a falling source reads as a meter change and the whole
  new value is added on the next rise — 18,899 to 40,793 in one five-minute
  row, the last time that was learned here. So the platform is checked before
  the domain, and a helper that happens to feed a meter still gets offset mode
  while the meter itself gets calibrated.

- **The button card can embed its own row of chip buttons**, via `chip_buttons`,
  reusing the editor and rendering of the standalone Chip Buttons Card. The
  layout follows the card's height: at a normal single-row height the chips sit
  right-aligned beside the icon and text, and once the card is resized taller
  they move to a bottom-anchored bar whose alignment `chip_buttons_justify`
  sets. That switch is a CSS container query rather than JS measuring height,
  so it follows the dashboard editor instantly as the card is dragged.
  `chip_buttons_layout` decides what happens when there are more chips than
  fit: `wrap` (the default) breaks onto a second line, `scroll` keeps one line
  and scrolls it. Contributed by **@UHaFnir**.

### Changed

- **The two setpoints of a heat/cool band are coloured.** Both climate cards
  drew the band's numbers in plain text. On the full card that leaves an
  11-pixel label as the only thing saying which number is which; on the mini
  card, where the two sit side by side with no room for a label at all, it
  leaves their order. Each bound now carries the colour of the end it is:
  "Heat to" in the heat colour, "Cool above" in the cool one, taken from the
  same `mode_colors` as the mode row, so an override there retunes the band
  too. Nothing new to configure. Suggested by **@enotbay** in #21.

  The low bound is the warm one. It reads backwards as a scale and correctly as
  a control: `target_temp_low` is the number the heating obeys, which is also
  the way round Home Assistant's own thermostat has it.

- **A scrolling chip row fades at the edge that has something behind it.** The
  fades lived on the chip-buttons card as an inline observer, so the row the
  button card now embeds would have had to copy them, and the vacuum card's own
  row had none at all. They moved into the shared module, which is why all
  three behave the same now: a mask appears only on a side with content
  scrolled out of view, and a row that fits has none at either end.

### Fixed

- **`adjustable: true` could silently do nothing.** On a plain `sensor` with no
  `adjust_entity` there is nothing to write to, and the card simply left the
  pencil out — an option that looks set, has no effect, and says nothing about
  why. The pencil is now drawn greyed with the reason on it. `adjustable` and
  `adjust_entity` were also undocumented; the counter card's page now has a
  section on all three ways a reading can be corrected.

- **The counter card pointed at a service that does not exist.** Its repair
  instructions named `recorder.adjust_sum_statistics`, which is a websocket
  command rather than a service and answers "not found" when called as one. The
  confirmation and the documentation now point at Developer tools → Statistics
  → "Adjust sum", which is the same operation where it actually lives.
