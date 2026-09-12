import { describe, it, expect, vi } from "vitest";
import { reminderState, reminderStates, acknowledgeReminder } from "./vacuum-reminders";
import type { HomeAssistant } from "../types";

function hassWith(states: Record<string, string>): HomeAssistant {
  const out: Record<string, unknown> = {};
  for (const [id, state] of Object.entries(states)) out[id] = { state, attributes: {} };
  return { states: out, callService: vi.fn() } as unknown as HomeAssistant;
}

const TOTALS = { runs: "sensor.runs", hours: "sensor.hours" };

describe("reminderState without a counter helper", () => {
  it("comes due on every multiple", () => {
    const cfg = { name: "Mop", every_runs: 3 };
    for (const [runs, due] of [["3", true], ["4", false], ["6", true], ["9", true]] as const) {
      const s = reminderState(hassWith({ "sensor.runs": runs }), cfg, TOTALS)!;
      expect(s.due, `runs=${runs}`).toBe(due);
    }
  });

  it("is not due at zero, before anything has happened", () => {
    expect(reminderState(hassWith({ "sensor.runs": "0" }), { name: "Mop", every_runs: 3 }, TOTALS)!.due)
      .toBe(false);
  });

  it("says it cannot be acknowledged, because there is nowhere to record it", () => {
    const s = reminderState(hassWith({ "sensor.runs": "3" }), { name: "Mop", every_runs: 3 }, TOTALS)!;
    expect(s.acknowledgeable).toBe(false);
    expect(s.since).toBeUndefined();
  });
});

describe("reminderState with a counter helper", () => {
  const cfg = { name: "Mop", every_runs: 3, counter_entity: "input_number.mop" };

  it("counts from the last acknowledgement", () => {
    const s = reminderState(
      hassWith({ "sensor.runs": "937", "input_number.mop": "935" }),
      cfg,
      TOTALS,
    )!;
    expect(s.since).toBe(2);
    expect(s.remaining).toBe(1);
    expect(s.due).toBe(false);
    expect(s.acknowledgeable).toBe(true);
  });

  it("comes due once the interval is reached, and stays due after", () => {
    const at = (runs: string) =>
      reminderState(hassWith({ "sensor.runs": runs, "input_number.mop": "935" }), cfg, TOTALS)!;
    expect(at("938").due).toBe(true);
    expect(at("940").due).toBe(true);
    expect(at("940").remaining).toBe(-2);
  });

  it("clamps the bar rather than overflowing it", () => {
    const s = reminderState(
      hassWith({ "sensor.runs": "999", "input_number.mop": "935" }),
      cfg,
      TOTALS,
    )!;
    expect(s.progress).toBe(1);
  });
});

describe("reminderState edges", () => {
  it("ignores a reminder with no interval", () => {
    expect(reminderState(hassWith({ "sensor.runs": "5" }), { name: "x" }, TOTALS)).toBeUndefined();
    expect(
      reminderState(hassWith({ "sensor.runs": "5" }), { name: "x", every_runs: 0 }, TOTALS),
    ).toBeUndefined();
  });

  it("ignores one whose meter does not exist", () => {
    expect(reminderState(hassWith({}), { name: "x", every_runs: 3 }, TOTALS)).toBeUndefined();
  });

  it("uses the runtime meter when the interval is in hours", () => {
    const s = reminderState(
      hassWith({ "sensor.runs": "937", "sensor.hours": "357" }),
      { name: "Filter", every_hours: 50 },
      TOTALS,
    )!;
    expect(s.basis).toBe("hours");
    expect(s.meter).toBe(357);
  });

  it("lets every_runs win when both are given", () => {
    const s = reminderState(
      hassWith({ "sensor.runs": "9", "sensor.hours": "100" }),
      { name: "x", every_runs: 3, every_hours: 50 },
      TOTALS,
    )!;
    // every_hours is checked first for the basis, so this pins the documented
    // precedence rather than leaving it to whichever branch is read first.
    expect(s.basis).toBe("hours");
  });
});

describe("reminderStates", () => {
  it("drops the ones that cannot be computed and keeps the order", () => {
    const list = reminderStates(
      hassWith({ "sensor.runs": "10" }),
      [{ name: "a", every_runs: 5 }, { name: "broken" }, { name: "b", every_runs: 2 }],
      TOTALS,
    );
    expect(list.map((s) => s.config.name)).toEqual(["a", "b"]);
  });

  it("copes with no reminders at all", () => {
    expect(reminderStates(hassWith({}), undefined, TOTALS)).toEqual([]);
  });
});

describe("acknowledgeReminder", () => {
  it("writes the current meter into the helper", () => {
    const hass = hassWith({ "sensor.runs": "940.7", "input_number.mop": "935" });
    const state = reminderState(
      hass,
      { name: "Mop", every_runs: 3, counter_entity: "input_number.mop" },
      TOTALS,
    )!;
    acknowledgeReminder(hass, state);
    expect(hass.callService).toHaveBeenCalledWith("input_number", "set_value", {
      entity_id: "input_number.mop",
      value: 940,
    });
  });

  it("does nothing without a helper, since there is nowhere to put the answer", () => {
    const hass = hassWith({ "sensor.runs": "3" });
    const state = reminderState(hass, { name: "Mop", every_runs: 3 }, TOTALS)!;
    acknowledgeReminder(hass, state);
    expect(hass.callService).not.toHaveBeenCalled();
  });
});
