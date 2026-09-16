import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRINTER_STATE_MAP,
  discoverPrinter,
  isRunning,
  optimisticPrinterState,
  primaryIntent,
  resolveAmsTray,
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
      "image.p1s_chamber": { device_id: "dev", translation_key: "camera" },
      "select.p1s_speed": { device_id: "dev", translation_key: "printing_speed" },
    });
    const found = discoverPrinter(hass, "sensor.p1s_stage");
    expect(found.stage).toBe("sensor.p1s_stage");
    expect(found.progress).toBe("sensor.p1s_progress");
    expect(found.nozzleTemp).toBe("sensor.p1s_nozzle");
    expect(found.camera).toBe("image.p1s_chamber");
    expect(found.speed).toBe("select.p1s_speed");
  });

  it("does not mistake a model thumbnail for the chamber camera", () => {
    // Bambu registers three image-ish entities and only one of them is the
    // chamber. Taking whichever came first showed the model's own thumbnail as
    // a live view — wrong in the most convincing way possible.
    const hass = fakeHass({
      "sensor.p1s_stage": { device_id: "dev", translation_key: "stage" },
      "image.p1s_pick_image": { device_id: "dev", translation_key: "pick_image" },
      "image.p1s_cover_image": { device_id: "dev", translation_key: "cover_image" },
      "camera.p1s_kamera": { device_id: "dev", translation_key: "camera" },
    });
    expect(discoverPrinter(hass, "sensor.p1s_stage").camera).toBe("camera.p1s_kamera");
  });

  it("does not read a target temperature as the current one", () => {
    // The suffix pass matches `..._target_nozzle_temperature` for `nozzleTemp`
    // too, so without a guard the winner is whichever the registry listed first.
    const hass = fakeHass({
      "sensor.p1s_stage": { device_id: "dev", translation_key: "stage" },
      "sensor.p1s_target_nozzle_temperature": { device_id: "dev" },
      "sensor.p1s_nozzle_temperature": { device_id: "dev" },
    });
    const found = discoverPrinter(hass, "sensor.p1s_stage");
    expect(found.nozzleTemp).toBe("sensor.p1s_nozzle_temperature");
    expect(found.nozzleTarget).toBe("sensor.p1s_target_nozzle_temperature");
  });

  it("finds Bambu's German entity ids by translation key alone", () => {
    // Entity ids are localised when they are created, so a German install has
    // nothing an English suffix rule could match. The keys are language-free.
    const hass = fakeHass({
      "sensor.p1s_aktueller_arbeitsschritt": { device_id: "dev", translation_key: "stage" },
      "sensor.p1s_druckfortschritt": { device_id: "dev", translation_key: "print_progress" },
      "sensor.p1s_name_der_aufgabe": { device_id: "dev", translation_key: "subtask_name" },
      "sensor.p1s_gcode_dateiname": { device_id: "dev", translation_key: "gcode_file" },
      "sensor.p1s_temperatur_der_duse": { device_id: "dev", translation_key: "nozzle_temp" },
      "sensor.p1s_zieltemperatur_der_duse": {
        device_id: "dev",
        translation_key: "target_nozzle_temp",
      },
      "sensor.p1s_druckbetttemperatur": { device_id: "dev", translation_key: "bed_temp" },
      "sensor.p1s_zieltemperatur_des_druckbett": {
        device_id: "dev",
        translation_key: "target_bed_temp",
      },
      "sensor.p1s_gesamtzahl_der_schichten": { device_id: "dev", translation_key: "total_layers" },
      "sensor.p1s_verbleibende_zeit": { device_id: "dev", translation_key: "remaining_time" },
    });
    const found = discoverPrinter(hass, "sensor.p1s_aktueller_arbeitsschritt");
    expect(found.progress).toBe("sensor.p1s_druckfortschritt");
    // The job's name, not the file it came from.
    expect(found.jobName).toBe("sensor.p1s_name_der_aufgabe");
    expect(found.nozzleTemp).toBe("sensor.p1s_temperatur_der_duse");
    expect(found.nozzleTarget).toBe("sensor.p1s_zieltemperatur_der_duse");
    expect(found.bedTemp).toBe("sensor.p1s_druckbetttemperatur");
    expect(found.bedTarget).toBe("sensor.p1s_zieltemperatur_des_druckbett");
    expect(found.totalLayers).toBe("sensor.p1s_gesamtzahl_der_schichten");
    expect(found.remaining).toBe("sensor.p1s_verbleibende_zeit");
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

describe("resolveAmsTray", () => {
  // Bambu's real shape, taken off a P1S: one sensor per slot, everything else
  // in its attributes.
  const bambu = {
    state: "Bambu PETG HF",
    attributes: { type: "PETG", color: "#000000FF", remain: 44, empty: false },
  };

  it("reads a tray that publishes one entity with attributes", () => {
    expect(resolveAmsTray({ state: bambu })).toEqual({
      material: "PETG",
      color: "#000000FF",
      remaining: 44,
      empty: false,
    });
  });

  it("prefers dedicated entities where an integration splits them", () => {
    const tray = resolveAmsTray({ state: bambu, material: "PLA", remaining: 90 });
    expect(tray.material).toBe("PLA");
    expect(tray.remaining).toBe(90);
    expect(tray.color).toBe("#000000FF");
  });

  it("treats -1 remaining as unknown, not as an empty spool", () => {
    const tray = resolveAmsTray({
      state: { state: "PLA", attributes: { type: "PLA", remain: -1 } },
    });
    expect(tray.remaining).toBeUndefined();
    expect(tray.empty).toBe(false);
  });

  it("falls back to the entity state when there is no type attribute", () => {
    expect(resolveAmsTray({ state: { state: "ABS", attributes: {} } }).material).toBe("ABS");
  });

  it("is empty when the tray says so, and when it says nothing", () => {
    expect(resolveAmsTray({ state: { state: "PLA", attributes: { empty: true } } }).empty).toBe(true);
    expect(resolveAmsTray({ state: { state: "unknown", attributes: {} } }).empty).toBe(true);
    expect(resolveAmsTray({}).empty).toBe(true);
  });
});

describe("AMS discovery", () => {
  it("keeps two AMS units apart instead of merging their slots", () => {
    // Both units number their trays 1–4, so without the unit in the key the
    // second one's filament simply is not on the card.
    const hass = fakeHass({
      "sensor.p1s_stage": { device_id: "dev", translation_key: "stage" },
      "sensor.p1s_ams_1_slot_1": { device_id: "ams1", translation_key: "tray" },
      "sensor.p1s_ams_1_slot_2": { device_id: "ams1", translation_key: "tray" },
      "sensor.p1s_ams_2_slot_1": { device_id: "ams2", translation_key: "tray" },
      "sensor.p1s_ams_2_slot_2": { device_id: "ams2", translation_key: "tray" },
    }, { ams1: { via_device_id: "dev" }, ams2: { via_device_id: "dev" } });
    const slots = discoverPrinter(hass, "sensor.p1s_stage").amsSlots;
    expect(slots.map((s) => s.entity)).toEqual([
      "sensor.p1s_ams_1_slot_1",
      "sensor.p1s_ams_1_slot_2",
      "sensor.p1s_ams_2_slot_1",
      "sensor.p1s_ams_2_slot_2",
    ]);
  });

  it("sorts by slot number, not by registry order", () => {
    const hass = fakeHass({
      "sensor.p1s_stage": { device_id: "dev", translation_key: "stage" },
      "sensor.p1s_tray_4": { device_id: "dev", translation_key: "tray" },
      "sensor.p1s_tray_10": { device_id: "dev", translation_key: "tray" },
      "sensor.p1s_tray_2": { device_id: "dev", translation_key: "tray" },
    });
    expect(discoverPrinter(hass, "sensor.p1s_stage").amsSlots.map((s) => s.entity)).toEqual([
      "sensor.p1s_tray_2",
      "sensor.p1s_tray_4",
      "sensor.p1s_tray_10",
    ]);
  });
});

describe("job-control buttons", () => {
  it("finds Bambu's pause, resume and stop by translation key", () => {
    // Real German entity ids from a P1S; the keys are what make them findable.
    const hass = fakeHass({
      "sensor.p1s_druckstatus": { device_id: "dev", translation_key: "print_status" },
      "button.p1s_druckvorgang_anhalten": { device_id: "dev", translation_key: "pause" },
      "button.p1s_druckvorgang_fortsetzen": { device_id: "dev", translation_key: "resume" },
      "button.p1s_druckvorgang_beenden": { device_id: "dev", translation_key: "stop" },
      "button.p1s_aktualisierung_erzwingen": { device_id: "dev", translation_key: "refresh" },
    });
    const found = discoverPrinter(hass, "sensor.p1s_druckstatus");
    expect(found.pauseButton).toBe("button.p1s_druckvorgang_anhalten");
    expect(found.resumeButton).toBe("button.p1s_druckvorgang_fortsetzen");
    expect(found.stopButton).toBe("button.p1s_druckvorgang_beenden");
  });

  it("never takes an emergency stop for the job's stop button", () => {
    // Moonraker's emergency_stop halts the firmware. Its id ends in _stop, so
    // the suffix pass would match it — and the stop dialog would then confirm
    // a cancellation and kill the printer.
    const hass = fakeHass({
      "sensor.klipper_state": { device_id: "dev" },
      "button.klipper_emergency_stop": { device_id: "dev" },
      "button.klipper_firmware_restart": { device_id: "dev" },
    });
    expect(discoverPrinter(hass, "sensor.klipper_state").stopButton).toBeUndefined();
  });

  it("finds the real job stop next to an emergency stop", () => {
    const hass = fakeHass({
      "sensor.klipper_state": { device_id: "dev" },
      "button.klipper_emergency_stop": { device_id: "dev" },
      "button.klipper_cancel_print": { device_id: "dev" },
    });
    expect(discoverPrinter(hass, "sensor.klipper_state").stopButton).toBe("button.klipper_cancel_print");
  });
});
