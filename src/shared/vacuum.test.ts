import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OptimisticActivity,
  activityColor,
  discoverVacuum,
  fanBarsLit,
  fanSpeedKey,
  optimisticActivity,
  primaryIntent,
  resolveActivity,
} from "./vacuum";
import { PALETTE } from "./tokens";
import type { HomeAssistant } from "../types";

describe("resolveActivity", () => {
  it("passes through the states a vacuum entity reports", () => {
    expect(resolveActivity("cleaning")).toBe("cleaning");
    expect(resolveActivity("docked")).toBe("docked");
    expect(resolveActivity("paused")).toBe("paused");
    expect(resolveActivity("error")).toBe("error");
  });

  it("accepts the legacy returning_home spelling", () => {
    expect(resolveActivity("returning_home")).toBe("returning");
    expect(resolveActivity("returning")).toBe("returning");
  });

  it("treats a missing or unknown state as unavailable", () => {
    expect(resolveActivity(undefined)).toBe("unavailable");
    expect(resolveActivity("unknown")).toBe("unavailable");
    expect(resolveActivity("unavailable")).toBe("unavailable");
  });

  it("treats a vendor-specific state as idle, not as an error", () => {
    // A Valetudo or Dreame vacuum reporting its own vocabulary is not broken,
    // and painting the card red for it would be a lie.
    expect(resolveActivity("segment_cleaning")).toBe("idle");
    expect(resolveActivity("spot_cleaning")).toBe("idle");
  });
});

describe("activityColor", () => {
  it("uses the suite palette rather than its own hex values", () => {
    expect(activityColor("cleaning")).toBe(PALETTE.home);
    expect(activityColor("docked")).toBe(PALETTE.ok);
    expect(activityColor("paused")).toBe(PALETTE.solar);
    expect(activityColor("returning")).toBe(PALETTE.media);
    expect(activityColor("error")).toBe(PALETTE.heat);
    expect(activityColor("unavailable")).toBe(PALETTE.off);
  });
});

describe("primaryIntent", () => {
  it("offers the action that makes sense from each state", () => {
    expect(primaryIntent("docked")).toBe("start");
    expect(primaryIntent("idle")).toBe("start");
    expect(primaryIntent("cleaning")).toBe("pause");
    expect(primaryIntent("paused")).toBe("resume");
  });

  it("offers nothing while returning or errored", () => {
    expect(primaryIntent("returning")).toBe("none");
    expect(primaryIntent("error")).toBe("none");
    expect(primaryIntent("unavailable")).toBe("none");
  });
});

describe("optimisticActivity", () => {
  it("maps each command onto the state it produces", () => {
    expect(optimisticActivity("start", "docked")).toBe("cleaning");
    expect(optimisticActivity("resume", "paused")).toBe("cleaning");
    expect(optimisticActivity("pause", "cleaning")).toBe("paused");
    expect(optimisticActivity("return", "cleaning")).toBe("returning");
    expect(optimisticActivity("stop", "cleaning")).toBe("idle");
  });

  it("leaves the state alone when there is nothing to do", () => {
    expect(optimisticActivity("none", "error")).toBe("error");
  });
});

describe("OptimisticActivity", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the guess while the real state still lags", () => {
    const o = new OptimisticActivity();
    o.set("cleaning");
    expect(o.resolve("docked")).toEqual({ activity: "cleaning", pending: true });
  });

  it("stops guessing once the poll confirms it", () => {
    const o = new OptimisticActivity();
    o.set("cleaning");
    expect(o.resolve("cleaning")).toEqual({ activity: "cleaning", pending: false });
    // And stays settled afterwards, rather than re-arming on the next tick.
    expect(o.resolve("docked")).toEqual({ activity: "docked", pending: false });
  });

  it("lets an error through immediately, guess or no guess", () => {
    // The one state the user must not be kept from seeing for the sake of a
    // smooth animation.
    const o = new OptimisticActivity();
    o.set("cleaning");
    expect(o.resolve("error")).toEqual({ activity: "error", pending: false });
  });

  it("gives up when the confirmation never arrives", () => {
    const expired = vi.fn();
    const o = new OptimisticActivity(70_000, expired);
    o.set("cleaning");
    expect(o.resolve("docked").pending).toBe(true);
    vi.advanceTimersByTime(70_001);
    expect(expired).toHaveBeenCalledOnce();
    expect(o.resolve("docked")).toEqual({ activity: "docked", pending: false });
  });

  it("clear() drops the guess and its timer", () => {
    const expired = vi.fn();
    const o = new OptimisticActivity(70_000, expired);
    o.set("cleaning");
    o.clear();
    vi.advanceTimersByTime(70_001);
    expect(expired).not.toHaveBeenCalled();
    expect(o.resolve("docked").pending).toBe(false);
  });
});

describe("fanBarsLit", () => {
  it("lights every bar when there is nothing to choose between", () => {
    expect(fanBarsLit(0, 1)).toBe(4);
  });

  it("spreads three steps across the four bars without starting at one", () => {
    // A three-step vacuum on its lowest setting should not look like it is
    // running at a quarter power.
    expect(fanBarsLit(0, 3)).toBe(1);
    expect(fanBarsLit(1, 3)).toBe(3);
    expect(fanBarsLit(2, 3)).toBe(4);
  });

  it("maps four steps one to one", () => {
    expect([0, 1, 2, 3].map((i) => fanBarsLit(i, 4))).toEqual([1, 2, 3, 4]);
  });

  it("never returns zero bars", () => {
    for (let total = 1; total <= 8; total++) {
      for (let i = 0; i < total; i++) {
        expect(fanBarsLit(i, total)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("fanSpeedKey", () => {
  it("normalises the vendor spellings it knows", () => {
    expect(fanSpeedKey("Balanced")).toBe("balanced");
    expect(fanSpeedKey("Max+")).toBe("max_plus");
    expect(fanSpeedKey("max plus")).toBe("max_plus");
  });

  it("returns nothing for a speed it has no translation for", () => {
    expect(fanSpeedKey("Teppichboost")).toBeUndefined();
  });
});

// --- discovery ---------------------------------------------------------------

function fakeHass(
  entities: Record<string, { device_id?: string; translation_key?: string }>,
): HomeAssistant {
  const states: Record<string, unknown> = {};
  const registry: Record<string, unknown> = {};
  for (const [entityId, entry] of Object.entries(entities)) {
    states[entityId] = { state: "on", attributes: {} };
    registry[entityId] = { entity_id: entityId, ...entry };
  }
  return { states, entities: registry } as unknown as HomeAssistant;
}

describe("discoverVacuum", () => {
  it("finds companions on the vacuum's own device", () => {
    const hass = fakeHass({
      "vacuum.sushi": { device_id: "dev1" },
      "select.sushi_mop_intensity": { device_id: "dev1", translation_key: "mop_intensity" },
      "sensor.sushi_cleaning_progress": { device_id: "dev1", translation_key: "cleaning_progress" },
      "image.sushi_downstairs": { device_id: "dev1" },
      "binary_sensor.sushi_mop_attached": { device_id: "dev1", translation_key: "mop_attached" },
      "switch.sushi_mop_washing": { device_id: "dev1", translation_key: "mop_washing" },
      "sensor.sushi_filter_time_left": { device_id: "dev1", translation_key: "filter_time_left" },
    });
    const found = discoverVacuum(hass, "vacuum.sushi");
    expect(found.deviceId).toBe("dev1");
    expect(found.mopIntensity).toBe("select.sushi_mop_intensity");
    expect(found.progress).toBe("sensor.sushi_cleaning_progress");
    expect(found.map).toBe("image.sushi_downstairs");
    expect(found.binary.mop_attached).toBe("binary_sensor.sushi_mop_attached");
    expect(found.switches.mop_washing).toBe("switch.sushi_mop_washing");
    expect(found.consumables.filter).toBe("sensor.sushi_filter_time_left");
  });

  it("still finds a renamed entity, because it matches the translation key", () => {
    // The entity_id is the user's to change; the translation key is not.
    const hass = fakeHass({
      "vacuum.sushi": { device_id: "dev1" },
      "sensor.staubsauger_restlaufzeit_hauptbuerste": {
        device_id: "dev1",
        translation_key: "main_brush_time_left",
      },
    });
    const found = discoverVacuum(hass, "vacuum.sushi");
    expect(found.consumables.main_brush).toBe("sensor.staubsauger_restlaufzeit_hauptbuerste");
  });

  it("falls back to the entity_id suffix when no translation key is set", () => {
    const hass = fakeHass({
      "vacuum.sushi": { device_id: "dev1" },
      "select.sushi_mop_mode": { device_id: "dev1" },
    });
    expect(discoverVacuum(hass, "vacuum.sushi").mopMode).toBe("select.sushi_mop_mode");
  });

  it("ignores entities belonging to another device", () => {
    const hass = fakeHass({
      "vacuum.sushi": { device_id: "dev1" },
      "select.other_mop_mode": { device_id: "dev2", translation_key: "mop_mode" },
    });
    expect(discoverVacuum(hass, "vacuum.sushi").mopMode).toBeUndefined();
  });

  it("ignores a registry entry with no state behind it", () => {
    // Disabled entities stay in the registry; rendering a block for one would
    // produce a control that can never do anything.
    const hass = fakeHass({ "vacuum.sushi": { device_id: "dev1" } });
    (hass.entities as Record<string, unknown>)["button.sushi_reset_filter"] = {
      entity_id: "button.sushi_reset_filter",
      device_id: "dev1",
      translation_key: "reset_filter",
    };
    expect(discoverVacuum(hass, "vacuum.sushi").deviceId).toBe("dev1");
    expect(Object.keys(discoverVacuum(hass, "vacuum.sushi").consumables)).toHaveLength(0);
  });

  it("returns nothing useful when the vacuum has no device", () => {
    const hass = fakeHass({ "vacuum.sushi": {} });
    const found = discoverVacuum(hass, "vacuum.sushi");
    expect(found.deviceId).toBeUndefined();
    expect(found.consumables).toEqual({});
  });

  it("does not let mop_mode swallow mop_intensity", () => {
    const hass = fakeHass({
      "vacuum.sushi": { device_id: "dev1" },
      "select.sushi_mop_mode": { device_id: "dev1", translation_key: "mop_mode" },
      "select.sushi_mop_intensity": { device_id: "dev1", translation_key: "mop_intensity" },
    });
    const found = discoverVacuum(hass, "vacuum.sushi");
    expect(found.mopMode).toBe("select.sushi_mop_mode");
    expect(found.mopIntensity).toBe("select.sushi_mop_intensity");
  });
});
