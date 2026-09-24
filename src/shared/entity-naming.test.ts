import { describe, it, expect } from "vitest";
import { stripAreaFromEntityName } from "./entity-naming";

describe("stripAreaFromEntityName", () => {
  it("strips a trailing area name", () => {
    expect(stripAreaFromEntityName("Licht Wohnzimmer", "Wohnzimmer")).toBe("Licht");
  });

  it("strips a leading area name", () => {
    expect(stripAreaFromEntityName("Wohnzimmer Licht", "Wohnzimmer")).toBe("Licht");
  });

  it("is case-insensitive", () => {
    expect(stripAreaFromEntityName("Licht wohnzimmer", "Wohnzimmer")).toBe("Licht");
  });

  it("only strips a whole word, not a substring", () => {
    expect(stripAreaFromEntityName("Wohnzimmerlicht", "Wohnzimmer")).toBe("Wohnzimmerlicht");
  });

  it("leaves the name alone without an area", () => {
    expect(stripAreaFromEntityName("Licht Wohnzimmer", undefined)).toBe("Licht Wohnzimmer");
    expect(stripAreaFromEntityName("Licht Wohnzimmer", "")).toBe("Licht Wohnzimmer");
  });

  it("falls back to the original name if stripping would leave nothing", () => {
    expect(stripAreaFromEntityName("Wohnzimmer", "Wohnzimmer")).toBe("Wohnzimmer");
  });

  it("collapses the resulting double space", () => {
    expect(stripAreaFromEntityName("Deckenlicht Wohnzimmer Süd", "Wohnzimmer")).toBe("Deckenlicht Süd");
  });
});
