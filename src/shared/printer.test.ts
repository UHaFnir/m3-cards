import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRINTER_STATE_MAP,
  discoverPrinter,
  isRunning,
  optimisticPrinterState,
  primaryIntent,
  printerStateColor,
  resolvePrinterState,
} from "./printer";
import { PALETTE } from "./tokens";
import type { HomeAssistant } from "../types";

describe("resolvePrinterState", () => {
  it("knows the values the common integrations report", () => {
    expect(resolvePrinterState("printing")).toBe("printing");
    expect(resolvePrinterState("paused")).toBe("paused");
    expect(resolvePrinterState("idle")).toBe("idle");
    expect(resolvePrinterState("Operational")).toBe("idle"); // OctoPrint
    expect(resolvePrinterState("standby")).toBe("idle"); // Klipper
    expect(resolvePrinterState("finish")).toBe("finished"); // Bambu
    expect(resolvePrinterState("complete")).toBe("finished");
    expect(resolvePrinterState("failed")).toBe("error");
  });

  it("reads a Bambu stage it has never seen as work in progress", () => {
    // The stage entity has dozens of these and gains more each firmware.
    // Listing them would guarantee missing one.
    for (const stage of [
      "heatbed_preheating",
      "filament_loading",
      "cleaning_nozzle_tip",
      "auto_bed_leveling",
      "calibrating_extrusion",
    ]) {
      expect(resolvePrinterState(stage), stage).toBe("printing");
    }
  });

  it("treats an unrecognised value as idle, not as an error", () => {
    // A red frame around a healthy machine is worse than a vague status line.
    expect(resolvePrinterState("waiting_for_user")).toBe("idle");
    expect(resolvePrinterState("zzz")).toBe("idle");
  });

  it("maps missing and unknown to offline", () => {
    expect(resolvePrinterState(undefined)).toBe("offline");
    expect(resolvePrinterState("unavailable")).toBe("offline");
    expect(resolvePrinterState("unknown")).toBe("offline");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolvePrinterState("  PRINTING ")).toBe("printing");
  });

  it("lets the configured map win over everything", () => {
    // The whole point: a fourth integration wording it differently is a config
    // change, not a code change.
    expect(resolvePrinterState("beschaeftigt", { beschaeftigt: "printing" })).toBe("printing");
    // …including over a value the built-in table would have read otherwise.
    expect(resolvePrinterState("idle", { idle: "offline" })).toBe("offline");
  });

  it("ignores a map entry that is not one of the six states", () => {
    expect(
      resolvePrinterState("printing", { printing: "nonsense" as unknown as "printing" }),
    ).toBe("printing");
  });
});

describe("printerStateColor", () => {
  it("uses the suite palette rather than its own hex values", () => {
    expect(printerStateColor("printing")).toBe(PALETTE.home);
    expect(printerStateColor("idle")).toBe(PALETTE.ok);
    expect(printerStateColor("finished")).toBe(PALETTE.ok);
    expect(printerStateColor("paused")).toBe(PALETTE.solar);
    expect(printerStateColor("error")).toBe(PALETTE.heat);
    expect(printerStateColor("offline")).toBe(PALETTE.off);
  });
});

describe("primaryIntent", () => {
  it("offers what makes sense from each state", () => {
    expect(primaryIntent("printing")).toBe("pause");
    expect(primaryIntent("paused")).toBe("resume");
    expect(primaryIntent("error")).toBe("confirm");
  });

  it("offers nothing while offline, because nothing would arrive", () => {
    expect(primaryIntent("offline")).toBe("none");
  });

  it("offers no Start when nothing says what starting would do", () => {
    expect(primaryIntent("idle")).toBe("none");
    expect(primaryIntent("finished")).toBe("none");
  });

  it("offers Start once a start action is configured", () => {
    expect(primaryIntent("idle", true)).toBe("start");
    expect(primaryIntent("finished", true)).toBe("start");
  });
});

describe("isRunning", () => {
  it("counts paused as running — the job still exists", () => {
    expect(isRunning("printing")).toBe(true);
    expect(isRunning("paused")).toBe(true);
    expect(isRunning("idle")).toBe(false);
    expect(isRunning("finished")).toBe(false);
  });
});

describe("optimisticPrinterState", () => {
  it("maps each command onto the state it produces", () => {
    expect(optimisticPrinterState("pause", "printing")).toBe("paused");
    expect(optimisticPrinterState("resume", "paused")).toBe("printing");
    expect(optimisticPrinterState("start", "idle")).toBe("printing");
  });

  it("leaves the state alone where there is nothing to predict", () => {
    expect(optimisticPrinterState("confirm", "error")).toBe("error");
    expect(optimisticPrinterState("none", "offline")).toBe("offline");
  });
});

describe("the default state map", () => {
  it("only ever maps onto the six states", () => {
    const allowed = ["printing", "paused", "idle", "finished", "error", "offline"];
    for (const [raw, state] of Object.entries(DEFAULT_PRINTER_STATE_MAP)) {
      expect(allowed, raw).toContain(state);
    }
  });

  it("is keyed in lower case, since that is what lookups use", () => {
    for (const key of Object.keys(DEFAULT_PRINTER_STATE_MAP)) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});

// --- discovery ---------------------------------------------------------------

function fakeHass(
  entities: Record<string, { device_id?: string; translation_key?: string; device_class?: string }>,
  devices: Record<string, { via_device_id?: string }> = {},
): HomeAssistant {
  const states: Record<string, unknown> = {};
  const registry: Record<string, unknown> = {};
  for (const [id, entry] of Object.entries(entities)) {
    states[id] = {
      state: "1",
      attributes: entry.device_class ? { device_class: entry.device_class } : {},
    };
    registry[id] = { entity_id: id, ...entry };
  }
  return { states, entities: registry, devices } as unknown as HomeAssistant;
}

describe("discoverPrinter", () => {
  it("finds companions by translation key", () => {
    const hass = fakeHass({
      "sensor.p1s_stage": { device_id: "dev", translation_key: "current_stage" },
      "sensor.p1s_progress": { device_id: "dev", translation_key: "print_progress" },
      "sensor.p1s_nozzle": { device_id: "dev", translation_key: "nozzle_temperature" },
      "image.p1s_cover": { device_id: "dev" },
      "select.p1s_speed": { device_id: "dev", translation_key: "printing_speed" },
    });
    const found = discoverPrinter(hass, "sensor.p1s_stage");
    expect(found.stage).toBe("sensor.p1s_stage");
    expect(found.progress).toBe("sensor.p1s_progress");
    expect(found.nozzleTemp).toBe("sensor.p1s_nozzle");
    expect(found.camera).toBe("image.p1s_cover");
    expect(found.speed).toBe("select.p1s_speed");
  });

  it("falls back to the device class when nothing is named recognisably", () => {
    // OctoPrint sets no translation keys, but it does declare temperatures.
    const hass = fakeHass({
      "sensor.octo_state": { device_id: "dev" },
      "sensor.octo_tool0": { device_id: "dev", device_class: "temperature" },
      "sensor.octo_bed_actual": { device_id: "dev", device_class: "temperature" },
    });
    const found = discoverPrinter(hass, "sensor.octo_state");
    expect(found.nozzleTemp).toBe("sensor.octo_tool0");
    expect(found.bedTemp).toBe("sensor.octo_bed_actual");
  });

  it("reaches an AMS registered as its own device via the printer", () => {
    const hass = fakeHass(
      {
        "sensor.p1s_stage": { device_id: "printer" },
        "sensor.ams_tray_1_type": { device_id: "ams" },
        "sensor.ams_tray_1_color": { device_id: "ams" },
      },
      { printer: {}, ams: { via_device_id: "printer" } },
    );
    const found = discoverPrinter(hass, "sensor.p1s_stage");
    expect(found.amsSlots).toHaveLength(1);
    expect(found.amsSlots[0].type).toBe("sensor.ams_tray_1_type");
    expect(found.amsSlots[0].color).toBe("sensor.ams_tray_1_color");
  });

  it("orders AMS trays by their number, not by registry order", () => {
    const hass = fakeHass({
      "sensor.p1s_stage": { device_id: "dev" },
      "sensor.ams_tray_4_type": { device_id: "dev" },
      "sensor.ams_tray_2_type": { device_id: "dev" },
      "sensor.ams_tray_1_type": { device_id: "dev" },
    });
    const found = discoverPrinter(hass, "sensor.p1s_stage");
    expect(found.amsSlots.map((s) => s.type)).toEqual([
      "sensor.ams_tray_1_type",
      "sensor.ams_tray_2_type",
      "sensor.ams_tray_4_type",
    ]);
  });

  it("ignores another device's entities", () => {
    const hass = fakeHass(
      {
        "sensor.p1s_stage": { device_id: "printer" },
        "sensor.other_progress": { device_id: "elsewhere", translation_key: "print_progress" },
      },
      { printer: {}, elsewhere: {} },
    );
    expect(discoverPrinter(hass, "sensor.p1s_stage").progress).toBeUndefined();
  });

  it("returns nothing useful when the entity has no device", () => {
    const hass = fakeHass({ "sensor.loose": {} });
    const found = discoverPrinter(hass, "sensor.loose");
    expect(found.deviceId).toBeUndefined();
    expect(found.amsSlots).toEqual([]);
  });
});
