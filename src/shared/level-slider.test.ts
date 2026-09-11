import { describe, it, expect } from "vitest";
import { stepAtFraction, fractionOfStep } from "./level-slider";

describe("stepAtFraction", () => {
  it("snaps to the nearest step, not the one just passed", () => {
    // Five steps sit at 0, .25, .5, .75, 1 — a finger just past the middle
    // belongs to the middle step, not the next one.
    expect(stepAtFraction(0.5, 5)).toBe(2);
    expect(stepAtFraction(0.51, 5)).toBe(2);
    expect(stepAtFraction(0.62, 5)).toBe(2);
    expect(stepAtFraction(0.63, 5)).toBe(3);
  });

  it("reaches both ends", () => {
    expect(stepAtFraction(0, 5)).toBe(0);
    expect(stepAtFraction(1, 5)).toBe(4);
  });

  it("clamps a drag that leaves the track", () => {
    // Pointer capture keeps delivering moves well past either edge.
    expect(stepAtFraction(-3, 5)).toBe(0);
    expect(stepAtFraction(4.2, 5)).toBe(4);
  });

  it("survives a single step without dividing by zero", () => {
    expect(stepAtFraction(0.7, 1)).toBe(0);
    expect(fractionOfStep(0, 1)).toBe(0);
  });
});

describe("fractionOfStep", () => {
  it("spreads the steps evenly from end to end", () => {
    expect([0, 1, 2, 3, 4].map((i) => fractionOfStep(i, 5))).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("round-trips with stepAtFraction for every step", () => {
    for (let count = 2; count <= 8; count++) {
      for (let i = 0; i < count; i++) {
        expect(stepAtFraction(fractionOfStep(i, count), count)).toBe(i);
      }
    }
  });
});
