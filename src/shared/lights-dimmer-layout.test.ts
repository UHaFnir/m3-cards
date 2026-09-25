import { describe, it, expect } from "vitest";
import { viewportSize } from "./lights-dimmer-layout";

describe("viewportSize", () => {
  it("caps horizontal height to full rows of the given column count", () => {
    expect(viewportSize({ orientation: "horizontal", maxItems: 5, columns: 2, tileSize: 64, gap: 8 })).toEqual({
      maxHeight: `${3 * 64 + 2 * 8}px`,
    });
  });

  it("caps horizontal height to one row at columns=1", () => {
    expect(viewportSize({ orientation: "horizontal", maxItems: 3, columns: 1, tileSize: 64, gap: 8 })).toEqual({
      maxHeight: "208px",
    });
  });

  it("is unbounded without maxItems", () => {
    expect(viewportSize({ orientation: "horizontal", columns: 2, tileSize: 64, gap: 8 })).toEqual({});
    expect(viewportSize({ orientation: "horizontal", maxItems: 0, columns: 2, tileSize: 64, gap: 8 })).toEqual({});
  });

  it("splits vertical column width across the container for exactly n visible", () => {
    expect(viewportSize({ orientation: "vertical", maxItems: 4, columns: 1, tileSize: 180, gap: 8 })).toEqual({
      columnWidth: "calc((100% - 24px) / 4)",
    });
  });

  it("is unset for vertical without maxItems", () => {
    expect(viewportSize({ orientation: "vertical", columns: 1, tileSize: 180, gap: 8 })).toEqual({});
  });
});
