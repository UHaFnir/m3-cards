---
title: M3 Search Card
type: m3-search-card
category: household
display: Search
summary: A Material 3 search bar that opens Home Assistant's own search and Assist
table_order: 9
section_order: 39
---

A Material 3 search bar on the dashboard itself. It looks like the M3 search
bar in its resting state — a 56px pill, a leading search icon, placeholder
text, an optional trailing Assist button — and a tap opens Home Assistant's
own quick bar, the same dialog the `E` key opens.

It exists because Home Assistant's own search entry point is in the header,
and the header's search button is **not rendered at all on a narrow screen**.
On a phone or a wall tablet there is no way to reach the entity search from a
dashboard except by keyboard, which those devices do not have. The same is
true of the header's Assist button, which is why this card can carry one.

Nothing is configured to make it work: the card reads no entity and needs no
setup.

<details>
<summary>Configuration, examples & options</summary>

```yaml
type: custom:m3-search-card
```

A bar that opens the command palette instead, with its own text and no Assist
button:

```yaml
type: custom:m3-search-card
mode: command
placeholder: Run a command
icon: mdi:console
show_assist: false
accent_color: primary
radius: 28
```

Or one that ignores the search entirely and navigates somewhere — `tap_action`
replaces the built-in behaviour rather than running alongside it:

```yaml
type: custom:m3-search-card
placeholder: Everything in the house
icon: mdi:home-search
tap_action:
  action: navigate
  navigation_path: /lovelace/all
```

### How it opens the dialog

`ha-quick-bar` is code-split out of the frontend's main bundle, and the only
thing that pulls it in is Home Assistant's own caller, which passes the dialog
manager an `import()` callback alongside the dialog tag. A card loaded as its
own Lovelace resource cannot name that module path, so firing a bare
`show-dialog` event lands on a custom element that was never defined and fails
with *"Unknown dialog type loaded"*.

So the card asks for the dialog the way a keyboard does: it dispatches the
`keydown` Home Assistant already listens for, and the frontend's own handler
does the lazy import and opens what it built. That makes the card depend on
the shortcut — user-visible, listed in Home Assistant's own `Shift+?` dialog —
instead of on an internal module path.

Three things can take those shortcuts away, and the card checks all three
rather than drawing a control that silently does nothing:

- **Keyboard shortcuts** can be switched off per user under *Profile →
  Keyboard shortcuts*. The bar dims and says so.
- **The command palette (`C`) is registered for admins only.** On a non-admin
  account `mode: command` opens the entity search instead, which is at least a
  search; the editor says so too.
- **Assist needs the `conversation` integration.** It is part of
  `default_config`, so it is normally there — where it is not, the trailing
  button is left out.

### One known limitation: the back gesture does not close the dialog

On Android, swiping back while the quick bar is open navigates the dashboard
away instead of closing the dialog. That is not this card's doing and it is
not fixable from here: Home Assistant's more-info dialog pushes a history
entry when it opens (`{dialog: "ha-more-info-dialog"}`), which is what gives
the back gesture something to pop — and the quick bar pushes nothing at all,
so the gesture reaches the router instead.

It is worth stating plainly because this card is what makes the quick bar
reachable on a phone in the first place, which is exactly where the back
gesture is the reflex. Close it with the dialog's own close button or with
`Esc`. If the frontend ever pushes an entry for the quick bar too, this
disappears on its own with no change here.

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `placeholder` | string | `Search Home Assistant`, or `Run a command` in command mode | The resting text in the bar |
| `label` | string | – | Alias for `placeholder`, for consistency with the cards that call their one piece of text a label. `placeholder` wins if both are set |
| `icon` | string | `mdi:magnify` | Leading icon |
| `mode` | `entity` \| `command` | `entity` | Which quick bar a tap opens. `command` needs an admin account |
| `show_assist` | boolean | `true` | Trailing Assist button. Drawn only when Assist is actually reachable |
| `assist_icon` | string | `mdi:microphone` | Icon on the Assist button |
| `tap_action` | Action | – | Standard Home Assistant action config. Once set it **replaces** opening the search |
| `accent_color` | string | – (neutral, as M3's own search bar is) | Colors the leading icon and the Assist button's well |
| `text_color` | string | – | Override text color |
| `secondary_text_color` | string | – | Override the placeholder color |
| `card_background` | string | – | Override background color |
| `radius` | number (px) | `28` | Card corner radius — 28 is half of the 56px bar, i.e. a full pill |
| `corners` | object | – | Optional per-corner override, same as every other card |
| `glass_background` | boolean | `true` | Frosted glass background |
| `animation` | `auto` \| `on` \| `off` | `auto` | The press feedback (a corner-radius morph); `auto` respects `prefers-reduced-motion` |

</details>
