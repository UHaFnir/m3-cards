---
title: M3 NAS Card / M3 System Card
type: m3-nas-card
category: system
display: NAS
summary: NAS volumes, CPU, RAM, network via Glances or Synology DSM + Syncthing
table_order: 2
section_order: 20
also_type: m3-system-card
also_display: System
also_summary: The same, fed by the System Monitor integration
also_table_order: 3
---

Two tiles sharing one implementation: per-volume usage, with CPU, RAM,
temperature and network as compact status tiles below, and optionally the
state of your Syncthing folders. The NAS Card reads the **Glances** or the
**Synology DSM** integration, the System Card the **System Monitor**
integration — otherwise they are identical.

<img src="docs/images/nas-card.png" alt="M3 NAS Card" width="440">

<img src="docs/images/system-card.png" alt="M3 System Card" width="440">

<sub>The NAS Card on top with two volumes and the Syncthing folders, the
System Card for your own instance below. Drive names come from `mount_names` —
Glances otherwise reports paths like `/rootfs/srv/dev-disk-by-uuid-…`.</sub>

<details>
<summary>Configuration, examples & options</summary>

```yaml
type: custom:m3-nas-card
name: NAS

# or, for a Synology NAS:
type: custom:m3-nas-card
name: NAS
source: synology_dsm

# or, for your own HA instance:
type: custom:m3-system-card
name: Home Assistant
```

### Setting up the data source

The System Card only needs the built-in **System Monitor** integration.

For a **Synology** NAS, `source: synology_dsm` reads Home Assistant's built-in
**Synology DSM** integration — nothing has to be installed on the NAS itself.
Add it under *Settings → Devices & services* (it is usually discovered over
SSDP), and the card lights up from the entities it creates. See
[Synology](#synology) below for what maps onto what.

The NAS Card needs **Glances** with its REST API running on the NAS; then add
the Glances integration in HA with the host and port `61208`. In a container a
host bind is required, otherwise Glances only reports the container's own
filesystems instead of the real volumes:

```yaml
services:
  glances:
    image: nicolargo/glances:latest-full
    network_mode: host
    pid: host
    restart: unless-stopped
    environment:
      - GLANCES_OPT=-w --disable-webui
    volumes:
      - /:/rootfs:ro
```

`--disable-webui` serves only the API HA needs, without also exposing an
unauthenticated web UI on the network.

### Detection

Entities are matched by their `translation_key` from the entity registry,
**not** by display name — Home Assistant localises those, so a name-based rule
would only work in one language. The label (mount point, sensor name,
interface) comes from the `unique_id`.

When no percentage sensor is enabled — System Monitor ships `disk_use_percent`
disabled by default — the card derives usage from "used" and "free" rather
than dropping the volume.

Mount paths are shortened for display (`/rootfs` stripped, UUID volumes become
"Volume a1b2c3d4"). `mount_names` overrides this per path, `exclude_mounts`
hides individual ones.

### Synology

With `source: synology_dsm` the card reads the same sections from the Synology
DSM integration. The matching works exactly as above — by `translation_key`,
not by display name:

| Synology `translation_key` | Card section |
|---|---|
| `volume_percentage_used` | Volume row, the percentage and the bar |
| `volume_size_used` | Volume row, the "used / total" line |
| `volume_size_total` | Volume row, the "used / total" line |
| `volume_status` | Volume row colour when the volume is unhealthy |
| `cpu_total_load` | CPU tile |
| `memory_real_usage` | RAM tile |
| `disk_temp` (per drive) | Temperature tile |
| `temperature` (chassis) | Temperature tile, when no drive sensor exists |
| `network_down` / `network_up` | Network tile |
| *uptime* (no `translation_key`) | Uptime in the subtitle |

**Volumes are named, not mounted.** Glances reports a mount path; Synology has
none and reports a DSM volume id instead. `exclude_mounts`, `mount_names` and
`disks[].mount` therefore take that id — `volume_1`, `volume_2` — and the card
shows it as "Volume 1" unless `mount_names` says otherwise:

```yaml
type: custom:m3-nas-card
source: synology_dsm
mount_names:
  volume_1: Media
exclude_mounts:
  - volume_2
```

Everything else behaves as it does for the other sources: `auto_discover`,
`config_entry_id` (for more than one NAS), `max_visible`, the `show_*` toggles,
the thresholds and the notifications all work unchanged.

Some sensors Synology needs are **disabled by default** in Home Assistant.
`volume_size_total` is one of them — without it the volume row shows the
percentage but no "used / total" line — and so is the uptime sensor. Enable
them under *Settings → Devices & services → Synology DSM → entities* if you
want those. A section the NAS does not report simply does not render; nothing
falls back to a zero.

A volume whose `volume_status` is `crashed`, `degraded` or `attention` takes
the critical/warning colour on its own row whatever its fill level says. The
per-drive SMART sensors and the security-status binary sensor are **not** shown:
DSM does not expose which drives make up which volume, so there is no row to
attach them to without adding a section the card does not have.

### Temperature

Glances reports drive and SoC sensors in one list, and the SoC always runs
hotter. The card therefore prefers drive sensors whenever any exist —
otherwise it would read 49 °C while the disks sit at 32 °C.
`temperature_labels` pins the selection explicitly.

The same preference covers Synology: `disk_temp` is labelled with the drive
(`sda`), the chassis `temperature` sensor is not, so the drives win and the
chassis reading is only used when a model exposes no per-drive sensor. The
per-volume `volume_disk_temp_avg` / `_max` sensors are deliberately ignored —
they average the very drives already being read.

### Synchronisation

With the **Syncthing** integration set up, the card lists every folder with
its state and size; while a transfer runs, the progress replaces the size.
Without the integration the section simply stays empty.

### Notifications

The **Notification** section creates an automation with up to three triggers:

- **Sync errors** — a folder goes to `error`, or `errors` / `pull_errors`
  rises above 0. The latter matters: Syncthing accumulates pull errors while
  the folder state still reads `idle`. **Paused folders never trigger** —
  that is a setting, not a fault.
- **Volume full** — usage above `notify_disk_threshold`.
- **Unreachable** — the sensors report `unavailable`; off by default, because
  it fires on every restart.

Messages use the names the card displays. The raw entity names would be
unusable ("Syncthing (http://…) ABCDEFG HA Share HA Share"), so the mapping is
written into the automation during setup.

### Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `source` | `glances` \| `systemmonitor` \| `synology_dsm` | per card type | Data source |
| `config_entry_id` | string | – | Restrict to one instance when several exist |
| `exclude_mounts` | list\<string\> | – | Mount points to hide; DSM volume ids (`volume_1`) with `synology_dsm` |
| `mount_names` | object | – | Mount path → display name; keyed by DSM volume id with `synology_dsm` |
| `disks` | list | – | Explicit volume order and naming; `mount:` is the DSM volume id with `synology_dsm` |
| `disk_warn` / `disk_critical` | number | `80` / `90` | Percent thresholds for the row colour |
| `temp_warn` / `temp_critical` | number | `55` / `65` | Temperature thresholds in °C |
| `temperature_labels` | list\<string\> | – | Temperature sensors to consider |
| `max_visible` | number | `4` | Drives shown directly, rest behind "show more" |
| `show_cpu` / `show_memory` / `show_temperature` / `show_network` | boolean | `true` | Status tiles |
| `show_uptime` | boolean | `true` | Uptime in the subtitle |
| `show_sync` | boolean | `true` | Syncthing section |
| `sync_entities` | list\<string\> | – | Specific Syncthing folders instead of all |
| `notify_service` | list\<string\> | – | Notification targets (without the `notify.` prefix) |
| `notify_sync_errors` | boolean | `true` | Notify on sync errors |
| `notify_disk_full` | boolean | `true` | Notify when a volume fills up |
| `notify_disk_threshold` | number | `90` | Threshold for that |
| `notify_offline` | boolean | `false` | Notify when the source goes silent |
| `notify_offline_minutes` | number | `10` | Grace period before it does |
| `notify_title` / `notify_message` | string | – | Custom title/message, empty = built-in text |
| `name` / `icon` | string | "NAS" / `mdi:nas` | Header |
| `ok_color` / `warn_color` / `critical_color` / `offline_color` | string | see above | Status colours |
| `accent_opacity` | number | `18` | Header tint strength |
| `text_color` / `secondary_text_color` | string | theme default | Name / secondary text |
| `card_background` | string | glass/solid background | Card background |
| `animation` | `auto` \| `on` \| `off` | `auto` | Expander animation |
| `glass_background` | boolean | `true` | Frosted glass background |
| `radius` / `corners` | number / object | `28` | Corner radius, optional per corner |

</details>
