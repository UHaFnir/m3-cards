import { describe, it, expect } from "vitest";
import { valueFromPointer, handleGeometry, isDragIntent } from "./wave-slider";

describe("valueFromPointer", () => {
  const hRect = { left: 0, top: 0, width: 200, height: 56 };

  it("clamps at the low end, respecting a custom min", () => {
    expect(valueFromPointer(hRect, -50, 0, "horizontal", 1, 100)).toBe(1);
    expect(valueFromPointer(hRect, 0, 0, "horizontal", 1, 100)).toBe(1);
  });

  it("clamps at the high end", () => {
    expect(valueFromPointer(hRect, 500, 0, "horizontal", 1, 100)).toBe(100);
    expect(valueFromPointer(hRect, 200, 0, "horizontal", 1, 100)).toBe(100);
  });

  it("maps the midpoint horizontally", () => {
    expect(valueFromPointer(hRect, 100, 0, "horizontal", 1, 100)).toBe(50);
  });

  it("inverts vertically: the bottom edge is min, the top is max", () => {
    const vRect = { left: 0, top: 0, width: 56, height: 200 };
    // Pointer at the very bottom (clientY = top + height) maps to min.
    expect(valueFromPointer(vRect, 0, 200, "vertical", 1, 100)).toBe(1);
    // Pointer at the very top (clientY = top) maps to max.
    expect(valueFromPointer(vRect, 0, 0, "vertical", 1, 100)).toBe(100);
    // Midpoint.
    expect(valueFromPointer(vRect, 0, 100, "vertical", 1, 100)).toBe(50);
  });

  it("returns min for a zero-size rect instead of dividing by zero", () => {
    expect(valueFromPointer({ left: 0, top: 0, width: 0, height: 0 }, 10, 10, "horizontal", 1, 100)).toBe(1);
    expect(valueFromPointer({ left: 0, top: 0, width: 0, height: 0 }, 10, 10, "vertical", 1, 100)).toBe(1);
  });
});

describe("handleGeometry", () => {
  it("parks the handle at the start at 0%", () => {
    const { handlePos, activeEnd } = handleGeometry(200, 0, 6, 12);
    expect(handlePos).toBe(3);
    expect(activeEnd).toBe(0);
  });

  it("parks the handle at the end at 100%", () => {
    const { handlePos, trackStart } = handleGeometry(200, 100, 6, 12);
    expect(handlePos).toBe(197);
    expect(trackStart).toBe(200);
  });

  it("splits active/track around the handle with a gap on both sides", () => {
    const { handlePos, activeEnd, trackStart } = handleGeometry(200, 50, 6, 12);
    expect(activeEnd).toBeCloseTo(handlePos - 6 - 3, 5);
    expect(trackStart).toBeCloseTo(handlePos + 6 + 3, 5);
  });

  it("degenerates to a fixed point at zero length", () => {
    const { handlePos, activeEnd, trackStart } = handleGeometry(0, 50, 6, 12);
    expect(handlePos).toBe(3);
    expect(activeEnd).toBe(0);
    expect(trackStart).toBe(0);
  });
});

describe("isDragIntent", () => {
  it("is false for a pure cross-axis move on a horizontal slider", () => {
    expect(isDragIntent(0, 20, "horizontal", 8)).toBe(false);
  });

  it("is false for a pure cross-axis move on a vertical slider", () => {
    expect(isDragIntent(20, 0, "vertical", 8)).toBe(false);
  });

  it("is false below the threshold along the axis", () => {
    expect(isDragIntent(5, 0, "horizontal", 8)).toBe(false);
  });

  it("is true above the threshold along the axis and dominant over cross movement", () => {
    expect(isDragIntent(15, 2, "horizontal", 8)).toBe(true);
    expect(isDragIntent(2, 15, "vertical", 8)).toBe(true);
  });

  it("is false when cross movement matches or exceeds axis movement, even above threshold", () => {
    expect(isDragIntent(15, 15, "horizontal", 8)).toBe(false);
  });
});
