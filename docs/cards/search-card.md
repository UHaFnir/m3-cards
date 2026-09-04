---
title: M3 Search Card
type: m3-search-card
category: system
display: Search
summary: A Material 3 search bar on the dashboard, opening HA's entity/command search and Assist
table_order: 3
---

A Material 3 search bar that lives on the dashboard itself, opening Home
Assistant's own entity or command quick bar — and Assist. The header's search
button disappears on a narrow screen; this card fills that gap.

<details>
<summary>Configuration, examples & options</summary>

```yaml
type: custom:m3-search-card
placeholder: Search Home Assistant
mode: entity          # entity | command
show_assist: true
```

Tapping the bar opens Home Assistant's quick bar — `entity` searches entities
(the `e` shortcut), `command` runs services and admin actions (the `c`
shortcut, admin accounts only). A configured `tap_action` replaces this
behaviour entirely, for dashboards that want the bar to do something else. If
the profile has keyboard shortcuts turned off, the quick bar has no way to
open, and the card says so instead of pretending to be usable.

The Assist button is shown by default whenever Assist is available, mirroring
the header's own — set `show_assist: false` to drop it.

### Configuration options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `placeholder` / `label` | string | localized | Resting text in the bar. `placeholder` wins if both are set |
| `icon` | string | `mdi:magnify` | Leading icon |
| `mode` | string | `entity` | `entity` or `command` — which quick bar a tap opens |
| `tap_action` | action | – | Replaces the built-in quick-bar behaviour entirely |
| `show_assist` | boolean | `true` | Show the trailing Assist button |
| `assist_icon` | string | `mdi:microphone` | Assist button icon |
| `accent_color` | string | – | Icon and Assist button color |

</details>
