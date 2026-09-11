import { describe, it, expect } from "vitest";
import { clampPan, PAN_ZOOM_IDENTITY } from "./pan-zoom";

describe("clampPan", () => {
  it("pins the offset to zero at 1x, where there is nothing to pan", () => {
    expect(clampPan({ scale: 1, x: 120, y: -80 }, 400, 300)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("allows half the overhang in each direction", () => {
    // At 2x the picture is twice the frame, so half of it hangs off each edge.
    expect(clampPan({ scale: 2, x: 500, y: 500 }, 400, 300)).toEqual({
      scale: 2,
      x: 200,
      y: 150,
    });
    expect(clampPan({ scale: 2, x: -500, y: -500 }, 400, 300)).toEqual({
      scale: 2,
      x: -200,
      y: -150,
    });
  });

  it("leaves an offset inside the bounds alone", () => {
    expect(clampPan({ scale: 2, x: 30, y: -20 }, 400, 300)).toEqual({ scale: 2, x: 30, y: -20 });
  });

  it("never lets the picture be dragged fully out of frame", () => {
    for (const scale of [1.2, 2, 3.7]) {
      const clamped = clampPan({ scale, x: 1e6, y: 1e6 }, 400, 300);
      expect(clamped.x).toBeLessThanOrEqual(((scale - 1) * 400) / 2 + 0.001);
      expect(clamped.y).toBeLessThanOrEqual(((scale - 1) * 300) / 2 + 0.001);
    }
  });

  it("survives a zero-sized frame, which is what the first paint reports", () => {
    expect(clampPan({ scale: 2, x: 10, y: 10 }, 0, 0)).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it("identity is the neutral state", () => {
    expect(PAN_ZOOM_IDENTITY).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
