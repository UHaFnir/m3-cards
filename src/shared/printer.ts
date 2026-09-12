import type { HomeAssistant, PrinterStateMap } from "../types";
import { PALETTE } from "./tokens";

// What a 3D printer's state *means*, and which of a device's entities belong
// to which block.
//
// WHY THE MAPPING IS CONFIGURABLE AND THE DEFAULTS ARE ONLY DEFAULTS
//
// Every integration words this differently. Bambu Lab reports a "stage" with
// dozens of values ("printing", "paused", "heatbed_preheating", "idle"),
// OctoPrint reports "Printing"/"Operational", Moonraker reports Klipper's
// "printing"/"complete"/"standby", Prusa Connect something else again. There
// is no set of strings that covers all four, so `state_map` in the card config
// always wins and the table below is what the card falls back to.
//
// The consequence for the code: never test a raw string anywhere but here.

export type PrinterState =
  | "printing"
  | "paused"
  | "idle"
  | "finished"
  | "error"
  | "offline";

const PRINTER_STATES: PrinterState[] = [
  "printing",
  "paused",
  "idle",
  "finished",
  "error",
  "offline",
];

/**
 * Raw status values seen in the wild, lower-cased, mapped onto the six states.
 *
 * Ordered longest-prefix-first is not needed because matching is exact; a
 * value that is not here falls through to the substring rules in
 * `resolvePrinterState`, which is what keeps a vendor's forty stage names from
 * having to be listed one by one.
 */
export const DEFAULT_PRINTER_STATE_MAP: Readonly<Record<string, PrinterState>> = {
  // Bambu Lab (ha-bambulab)
  printing: "printing",
  running: "printing",
  prepare: "printing",
  slicing: "printing",
  paused: "paused",
  pause: "paused",
  idle: "idle",
  standby: "idle",
  finish: "finished",
  finished: "finished",
  complete: "finished",
  completed: "finished",
  success: "finished",
  failed: "error",
  error: "error",
  offline: "offline",
  unavailable: "offline",
  unknown: "offline",
  // OctoPrint
  operational: "idle",
  cancelling: "printing",
  // Moonraker / Klipper
  ready: "idle",
  shutdown: "offline",
  startup: "offline",
};

/**
 * Turns a raw status into one of the six states.
 *
 * Three passes, in order: the user's own map, the table above, then substring
 * rules. The last one exists because Bambu's stage entity reports things like
 * `heatbed_preheating` and `filament_loading` — dozens of values that all mean
 * "the printer is working on a job", and listing them would guarantee missing
 * one on the next firmware.
 */
export function resolvePrinterState(
  raw: string | undefined,
  stateMap?: PrinterStateMap,
): PrinterState {
  if (!raw) return "offline";
  const key = raw.toLowerCase().trim();

  const configured = stateMap?.[key] ?? stateMap?.[raw];
  if (configured && PRINTER_STATES.includes(configured)) return configured;

  const known = DEFAULT_PRINTER_STATE_MAP[key];
  if (known) return known;

  if (key.includes("pause")) return "paused";
  if (key.includes("error") || key.includes("fail")) return "error";
  if (key.includes("offline") || key.includes("disconnect")) return "offline";
  if (key.includes("finish") || key.includes("complete")) return "finished";
  // Anything still unrecognised while a job is clearly under way — preheating,
  // loading filament, cleaning the nozzle — is the printer working.
  if (
    key.includes("print") ||
    key.includes("heat") ||
    key.includes("load") ||
    key.includes("clean") ||
    key.includes("level") ||
    key.includes("calibrat")
  ) {
    return "printing";
  }
  // A state nobody recognises is not an error. Idle is the safe reading: it
  // shows the card without painting a red frame around a healthy machine.
  return "idle";
}

/** The accent each state paints with, from the suite's palette. */
export function printerStateColor(state: PrinterState): string {
  switch (state) {
    case "printing":
      return PALETTE.home;
    case "finished":
    case "idle":
      return PALETTE.ok;
    case "paused":
      return PALETTE.solar;
    case "error":
      return PALETTE.heat;
    default:
      return PALETTE.off;
  }
}

export function printerStateIcon(state: PrinterState): string {
  switch (state) {
    case "printing":
      return "mdi:printer-3d-nozzle";
    case "paused":
      return "mdi:pause";
    case "finished":
      return "mdi:check-circle-outline";
    case "error":
      return "mdi:alert-circle-outline";
    case "offline":
      return "mdi:power-plug-off-outline";
    default:
      return "mdi:printer-3d";
  }
}

/** Whether a job is under way, which is what most blocks key off. */
export function isRunning(state: PrinterState): boolean {
  return state === "printing" || state === "paused";
}

/** What a tap on the primary button should do, given the state. */
export type PrinterIntent = "pause" | "resume" | "start" | "confirm" | "none";

export function primaryIntent(state: PrinterState): PrinterIntent {
  switch (state) {
    case "printing":
      return "pause";
    case "paused":
      return "resume";
    case "idle":
    case "finished":
      return "start";
    case "error":
      // Acknowledging is the only thing that helps, and it is the one the
      // vendor's own app offers here too.
      return "confirm";
    default:
      // Offline: the printer cannot be told anything. The socket switch in the
      // details block is the way back, and that stays live — see the card.
      return "none";
  }
}

export function optimisticPrinterState(
  intent: PrinterIntent,
  current: PrinterState,
): PrinterState {
  switch (intent) {
    case "pause":
      return "paused";
    case "resume":
    case "start":
      return "printing";
    default:
      return current;
  }
}

// ---- discovery --------------------------------------------------------------

/**
 * A printer's companion entities.
 *
 * Matched on the registry's `translation_key` first, the entity_id suffix
 * second, and a device class third. Three passes rather than one because
 * integrations differ in which of them they bother to set: Bambu Lab assigns
 * translation keys, OctoPrint largely does not, and a renamed entity keeps
 * neither its original id nor a key it never had.
 */
export interface DiscoveredPrinter {
  deviceId?: string;
  camera?: string;
  progress?: string;
  remaining?: string;
  layer?: string;
  totalLayers?: string;
  jobName?: string;
  stage?: string;
  nozzleTemp?: string;
  nozzleTarget?: string;
  bedTemp?: string;
  bedTarget?: string;
  chamberTemp?: string;
  speed?: string;
  startTime?: string;
  endTime?: string;
  power?: string;
  online?: string;
  error?: string;
  light?: string;
  /** AMS trays, in slot order, each with whatever it exposes. */
  amsSlots: { type?: string; color?: string; remaining?: string; entity?: string }[];
}

interface RegistryEntry {
  entity_id: string;
  device_id?: string | null;
  translation_key?: string | null;
  platform?: string | null;
}

function suffixOf(entityId: string): string {
  return entityId.slice(entityId.indexOf(".") + 1);
}

function matches(entry: RegistryEntry, keys: string[]): boolean {
  const tk = entry.translation_key ?? undefined;
  if (tk && keys.includes(tk)) return true;
  const suffix = suffixOf(entry.entity_id);
  return keys.some((k) => suffix === k || suffix.endsWith(`_${k}`));
}

const SENSOR_KEYS: Record<string, string[]> = {
  progress: ["print_progress", "progress", "job_percentage", "percent_complete"],
  remaining: ["remaining_time", "time_remaining", "print_time_left", "remaining"],
  layer: ["current_layer", "layer_number", "current_layer_number", "layer"],
  totalLayers: ["total_layer_count", "total_layers", "layer_count"],
  jobName: ["task_name", "print_job_name", "job_name", "current_file", "filename"],
  stage: ["current_stage", "stage", "print_status", "printer_state", "current_state"],
  nozzleTemp: ["nozzle_temperature", "nozzle_temp", "tool0_temperature", "extruder_temperature"],
  nozzleTarget: ["target_nozzle_temperature", "nozzle_target_temperature", "tool0_target"],
  bedTemp: ["bed_temperature", "bed_temp", "heater_bed_temperature"],
  bedTarget: ["target_bed_temperature", "bed_target_temperature", "bed_target"],
  chamberTemp: ["chamber_temperature", "chamber_temp"],
  startTime: ["start_time", "print_start_time"],
  endTime: ["end_time", "estimated_end_time", "finish_time", "print_end_time"],
  power: ["power", "current_power"],
};

/**
 * Collects a printer's companion entities.
 *
 * Diagnostic and config entities are kept on purpose: on a Bambu printer the
 * temperatures, the stage and most of the AMS live in those categories, and
 * dropping them would leave the card with a name and nothing else.
 */
export function discoverPrinter(hass: HomeAssistant, entityId: string): DiscoveredPrinter {
  const found: DiscoveredPrinter = { amsSlots: [] };
  const registry = hass.entities as unknown as Record<string, RegistryEntry> | undefined;
  if (!registry) return found;

  const own = registry[entityId];
  const deviceId = own?.device_id ?? undefined;
  if (!deviceId) return found;
  found.deviceId = deviceId;

  // A Bambu printer registers its AMS units as their own devices, the way the
  // vacuum's dock does — so siblings are gathered from the printer's device
  // and from anything the same integration registered alongside it.
  const devices = hass.devices as unknown as
    | Record<string, { via_device_id?: string | null; id?: string }>
    | undefined;
  const related = new Set<string>([deviceId]);
  for (const [id, device] of Object.entries(devices ?? {})) {
    if (device.via_device_id === deviceId) related.add(id);
  }

  const siblings = Object.values(registry).filter(
    (e) => e.device_id && related.has(e.device_id) && hass.states[e.entity_id],
  );
  const inDomain = (domain: string) => siblings.filter((e) => e.entity_id.startsWith(`${domain}.`));
  const pick = (domain: string, keys: string[]): string | undefined =>
    inDomain(domain).find((e) => matches(e, keys))?.entity_id;

  for (const [field, keys] of Object.entries(SENSOR_KEYS)) {
    const hit = pick("sensor", keys);
    if (hit) (found as unknown as Record<string, unknown>)[field] = hit;
  }

  // Temperatures are worth a second pass on device class: OctoPrint names them
  // nothing recognisable, but it does declare what they are.
  if (!found.nozzleTemp || !found.bedTemp) {
    const temps = inDomain("sensor").filter(
      (e) => hass.states[e.entity_id]?.attributes?.device_class === "temperature",
    );
    const byWord = (words: string[]) =>
      temps.find((e) => words.some((w) => e.entity_id.toLowerCase().includes(w)))?.entity_id;
    found.nozzleTemp ??= byWord(["nozzle", "tool", "extruder", "hotend"]);
    found.bedTemp ??= byWord(["bed"]);
    found.chamberTemp ??= byWord(["chamber"]);
  }

  // The camera may be either domain; `image` is preferred because it is a
  // still the browser can cache, and a stream costs the printer bandwidth it
  // would rather spend on the job.
  found.camera = inDomain("image")[0]?.entity_id ?? inDomain("camera")[0]?.entity_id;

  found.speed = pick("select", ["printing_speed", "speed_profile", "print_speed", "speed"]);
  found.light =
    pick("light", ["chamber_light", "light"]) ?? pick("switch", ["chamber_light", "light"]);
  found.online = pick("binary_sensor", ["online", "connected"]);
  found.error =
    pick("binary_sensor", ["print_error", "hms_errors", "error"]) ??
    pick("sensor", ["print_error", "error"]);

  found.amsSlots = discoverAmsSlots(siblings);
  return found;
}

/**
 * AMS trays, in slot order.
 *
 * Bambu names them `..._tray_1` through `_tray_4` (or `slot_`), so the number
 * in the id is the ordering key rather than the order the registry happened to
 * return them in — a grid that reshuffles between renders is unreadable.
 */
function discoverAmsSlots(siblings: RegistryEntry[]): DiscoveredPrinter["amsSlots"] {
  const bySlot = new Map<string, { type?: string; color?: string; remaining?: string; entity?: string }>();
  for (const entry of siblings) {
    const id = entry.entity_id;
    const slot = /(?:tray|slot)[_ ]?(\d+)/i.exec(id)?.[1];
    if (!slot) continue;
    const existing = bySlot.get(slot) ?? {};
    existing.entity ??= id;
    const lower = id.toLowerCase();
    if (lower.includes("type") || lower.includes("material") || lower.includes("filament")) {
      existing.type ??= id;
    }
    if (lower.includes("color") || lower.includes("colour")) existing.color ??= id;
    if (lower.includes("remain") || lower.includes("level")) existing.remaining ??= id;
    bySlot.set(slot, existing);
  }
  return [...bySlot.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, value]) => value);
}
