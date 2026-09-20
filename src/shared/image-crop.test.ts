import { describe, it, expect } from "vitest";
import { contentInset, insetCss } from "./image-crop";

/** Builds an RGBA buffer and lets a callback decide which pixels are opaque. */
function picture(width: number, height: number, opaque: (x: number, y: number) => boolean) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[(y * width + x) * 4 + 3] = opaque(x, y) ? 255 : 0;
    }
  }
  return data;
}

describe("contentInset", () => {
  it("finds a block of content in the middle of an empty picture", () => {
    // Content from 40..59 in both directions of a 100×100 picture.
    const data = picture(100, 100, (x, y) => x >= 40 && x < 60 && y >= 40 && y < 60);
    const inset = contentInset(data, 100, 100, { padding: 0 })!;
    expect(inset.left).toBeCloseTo(40, 5);
    expect(inset.right).toBeCloseTo(40, 5);
    expect(inset.top).toBeCloseTo(40, 5);
    expect(inset.bottom).toBeCloseTo(40, 5);
  });

  it("ignores a thin stroke crossing the whole picture", () => {
    // The floor plan, plus a no-go line drawn corner to corner — one pixel in
    // every row and every column, which is exactly what a plain alpha bounding
    // box trips over.
    const plan = (x: number, y: number) => x >= 40 && x < 60 && y >= 40 && y < 60;
    const data = picture(100, 100, (x, y) => plan(x, y) || x === y);
    const inset = contentInset(data, 100, 100, { padding: 0 })!;
    expect(inset.left).toBeCloseTo(40, 5);
    expect(inset.top).toBeCloseTo(40, 5);
  });

  it("keeps a stroke that is dense along its own axis", () => {
    // The honest limit: a perfectly vertical line fills its column, so the
    // crop cannot tell it from a wall. It stays, and the picture is only
    // narrowed on the other side.
    const plan = (x: number, y: number) => x >= 40 && x < 60 && y >= 40 && y < 60;
    const data = picture(100, 100, (x, y) => plan(x, y) || x === 5);
    const inset = contentInset(data, 100, 100, { padding: 0 })!;
    expect(inset.left).toBeCloseTo(5, 5);
    expect(inset.right).toBeCloseTo(40, 5);
  });

  it("pads outwards by a share of what it found", () => {
    const data = picture(100, 100, (x, y) => x >= 40 && x < 60 && y >= 40 && y < 60);
    const inset = contentInset(data, 100, 100, { padding: 0.1 })!;
    // The box is 20 % wide, so a tenth of it is 2 % off each side.
    expect(inset.left).toBeCloseTo(38, 5);
    expect(inset.right).toBeCloseTo(38, 5);
  });

  it("leaves a picture that is nearly all content alone", () => {
    const data = picture(100, 100, (x, y) => x >= 1 && x < 99 && y >= 1 && y < 99);
    expect(contentInset(data, 100, 100)).toBeUndefined();
  });

  it("returns nothing for an empty picture", () => {
    expect(contentInset(picture(50, 50, () => false), 50, 50)).toBeUndefined();
  });

  it("never proposes a negative inset", () => {
    // Content hard against the left edge: padding must not push past it.
    const data = picture(100, 100, (x, y) => x < 20 && y >= 40 && y < 60);
    const inset = contentInset(data, 100, 100, { padding: 0.5 })!;
    expect(inset.left).toBe(0);
    expect(inset.top).toBeGreaterThanOrEqual(0);
  });

  it("refuses a buffer smaller than the dimensions claim", () => {
    expect(contentInset(new Uint8ClampedArray(10), 100, 100)).toBeUndefined();
  });
});

describe("insetCss", () => {
  it("writes the four sides in CSS order", () => {
    expect(insetCss({ top: 1, right: 2, bottom: 3, left: 4 })).toBe(
      "inset(1.00% 2.00% 3.00% 4.00%)",
    );
  });
});
