import { describe, it, expect, vi } from "vitest";
import {
  nudgeRange,
  readClimateTarget,
  setTargetRange,
  supportsRange,
} from "./climate-target";
import type { HomeAssistant } from "../types";

describe("readClimateTarget", () => {
  it("reads a single setpoint", () => {
    expect(readClimateTarget({ temperature: 21 })).toEqual({ kind: "single", value: 21 });
  });

  it("reads a band when the entity carries one", () => {
    // What an Ecobee in Auto reports: two bounds and no `temperature` at all.
    expect(readClimateTarget({ target_temp_low: 19, target_temp_high: 24 })).toEqual({
      kind: "range",
      low: 19,
      high: 24,
    });
  });

  it("prefers the band when an entity fills both", () => {
    expect(
      readClimateTarget({ temperature: 21, target_temp_low: 19, target_temp_high: 24 }),
    ).toEqual({ kind: "range", low: 19, high: 24 });
  });

  it("keeps a half-filled band a band", () => {
    expect(readClimateTarget({ target_temp_high: 24 })).toEqual({
      kind: "range",
      low: undefined,
      high: 24,
    });
  });

  it("uses supported_features only when no value has arrived yet", () => {
    // An entity that has just come up should draw the control it will need,
    // rather than a single setpoint that turns into a band a second later.
    expect(readClimateTarget({ supported_features: 2 })).toEqual({
      kind: "range",
      low: undefined,
      high: undefined,
    });
    expect(readClimateTarget({ supported_features: 1 })).toEqual({
      kind: "single",
      value: undefined,
    });
  });

  it("treats a missing entity as a single unknown target", () => {
    expect(readClimateTarget(undefined)).toEqual({ kind: "single", value: undefined });
  });
});

describe("supportsRange", () => {
  it("reads the bit out of supported_features", () => {
    expect(supportsRange({ supported_features: 3 })).toBe(true);
    expect(supportsRange({ supported_features: 1 })).toBe(false);
    expect(supportsRange(undefined)).toBe(false);
  });
});

describe("nudgeRange", () => {
  const limits = { step: 0.5, min: 7, max: 35 };

  it("moves the bound it was given", () => {
    expect(nudgeRange({ low: 19, high: 24 }, "low", 0.5, limits)).toEqual({ low: 19.5, high: 24 });
    expect(nudgeRange({ low: 19, high: 24 }, "high", -0.5, limits)).toEqual({ low: 19, high: 23.5 });
  });

  it("stops each bound one step short of the other", () => {
    // Heating to 21 and cooling to 21 asks a thermostat to do both at once.
    expect(nudgeRange({ low: 23.5, high: 24 }, "low", 5, limits)).toEqual({ low: 23.5, high: 24 });
    expect(nudgeRange({ low: 19, high: 19.5 }, "high", -5, limits)).toEqual({ low: 19, high: 19.5 });
  });

  it("respects the entity's own limits", () => {
    expect(nudgeRange({ low: 7, high: 24 }, "low", -5, limits)).toEqual({ low: 7, high: 24 });
    expect(nudgeRange({ low: 19, high: 35 }, "high", 5, limits)).toEqual({ low: 19, high: 35 });
  });

  it("lands on the step, not between two of them", () => {
    expect(nudgeRange({ low: 19.2, high: 24 }, "low", 0.5, limits)).toEqual({ low: 19.5, high: 24 });
  });

  it("does nothing when a bound is missing", () => {
    expect(nudgeRange({ low: undefined, high: 24 }, "low", 0.5, limits)).toBeUndefined();
  });
});

describe("setTargetRange", () => {
  it("always sends both bounds", () => {
    // An omitted bound reads as "no opinion", and integrations then reset it.
    const callService = vi.fn();
    setTargetRange({ callService } as unknown as HomeAssistant, "climate.upstairs", {
      low: 19,
      high: 24,
    });
    expect(callService).toHaveBeenCalledWith("climate", "set_temperature", {
      entity_id: "climate.upstairs",
      target_temp_low: 19,
      target_temp_high: 24,
    });
  });
});
