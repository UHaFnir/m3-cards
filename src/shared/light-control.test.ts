import { describe, it, expect, vi } from "vitest";
import { isDimmable, toggleLightSet, setLightSetBrightness, setBrightnessAverage } from "./light-control";
import type { HassEntity, HomeAssistant } from "../types";

function state(entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return { entity_id, state, attributes, last_changed: "", last_updated: "" };
}

function fakeHass(states: HassEntity[]): { hass: HomeAssistant; callService: ReturnType<typeof vi.fn> } {
  const callService = vi.fn().mockResolvedValue(undefined);
  const statesById = Object.fromEntries(states.map((s) => [s.entity_id, s]));
  return { hass: { states: statesById, callService } as unknown as HomeAssistant, callService };
}

describe("isDimmable", () => {
  it("is true for a light with a non-onoff color mode", () => {
    expect(isDimmable(state("light.a", "on", { supported_color_modes: ["brightness"] }))).toBe(true);
  });

  it("is true for a light with brightness but no reported color modes", () => {
    expect(isDimmable(state("light.a", "on", { brightness: 128 }))).toBe(true);
  });

  it("is false for an onoff-only light", () => {
    expect(isDimmable(state("light.a", "on", { supported_color_modes: ["onoff"] }))).toBe(false);
  });

  it("is false for a switch, even with a brightness-shaped attribute", () => {
    expect(isDimmable(state("switch.a", "on", { brightness: 128 }))).toBe(false);
  });
});

describe("toggleLightSet", () => {
  it("turns everything off when any member is on", () => {
    const { hass, callService } = fakeHass([state("light.a", "on"), state("light.b", "off")]);
    toggleLightSet(hass, ["light.a", "light.b"]);
    expect(callService).toHaveBeenCalledWith(
      "homeassistant",
      "turn_off",
      {},
      { entity_id: ["light.a", "light.b"] },
    );
  });

  it("turns everything on when all members are off", () => {
    const { hass, callService } = fakeHass([state("light.a", "off"), state("switch.b", "off")]);
    toggleLightSet(hass, ["light.a", "switch.b"]);
    expect(callService).toHaveBeenCalledWith(
      "homeassistant",
      "turn_on",
      {},
      { entity_id: ["light.a", "switch.b"] },
    );
  });

  it("does nothing for an empty set", () => {
    const { hass, callService } = fakeHass([]);
    toggleLightSet(hass, []);
    expect(callService).not.toHaveBeenCalled();
  });
});

describe("setLightSetBrightness", () => {
  it("sets dimmable lights in one call and turns on non-dimmable members separately", () => {
    const { hass, callService } = fakeHass([
      state("light.a", "off", { supported_color_modes: ["brightness"] }),
      state("light.b", "off", { supported_color_modes: ["onoff"] }),
      state("switch.c", "off"),
    ]);
    setLightSetBrightness(hass, ["light.a", "light.b", "switch.c"], 40);
    expect(callService).toHaveBeenCalledWith("light", "turn_on", { entity_id: ["light.a"], brightness_pct: 40 });
    expect(callService).toHaveBeenCalledWith("homeassistant", "turn_on", {}, { entity_id: ["light.b", "switch.c"] });
  });

  it("passes transition through to the dimmable call only", () => {
    const { hass, callService } = fakeHass([state("light.a", "off", { supported_color_modes: ["brightness"] })]);
    setLightSetBrightness(hass, ["light.a"], 60, 2);
    expect(callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: ["light.a"],
      brightness_pct: 60,
      transition: 2,
    });
  });

  it("never turns non-dimmable members off at 0%", () => {
    const { hass, callService } = fakeHass([state("switch.a", "on")]);
    setLightSetBrightness(hass, ["switch.a"], 0);
    expect(callService).not.toHaveBeenCalled();
  });
});

describe("setBrightnessAverage", () => {
  it("averages only the dimmable members that are on", () => {
    const { hass } = fakeHass([
      state("light.a", "on", { supported_color_modes: ["brightness"], brightness: 255 }),
      state("light.b", "on", { supported_color_modes: ["brightness"], brightness: 0 }),
      state("light.c", "off", { supported_color_modes: ["brightness"], brightness: 255 }),
      state("switch.d", "on"),
    ]);
    expect(setBrightnessAverage(hass, ["light.a", "light.b", "light.c", "switch.d"])).toBe(50);
  });

  it("is 0 when nothing dimmable is on", () => {
    const { hass } = fakeHass([state("light.a", "off", { supported_color_modes: ["brightness"] })]);
    expect(setBrightnessAverage(hass, ["light.a"])).toBe(0);
  });
});
