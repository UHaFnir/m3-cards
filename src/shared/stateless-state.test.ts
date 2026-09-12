import { describe, it, expect } from "vitest";
import { STATELESS_DOMAINS } from "../const";

/**
 * The rule chip-buttons applies when deciding whether to print an entity's
 * state next to its name. Pinned here because the decision is a one-liner in
 * a render function, and the symptom of getting it wrong — a chip reading
 * "Full clean  Unknown" — looks like a broken entity rather than a broken
 * default.
 */
function showsState(domain: string, configured: boolean | undefined): boolean {
  return configured ?? !STATELESS_DOMAINS.has(domain);
}

describe("whether a chip prints the entity state", () => {
  it("stays quiet for domains whose state says nothing", () => {
    // A button is "unknown" until pressed and a timestamp after; neither is
    // worth the width.
    for (const domain of ["button", "script", "scene", "input_button"]) {
      expect(showsState(domain, undefined), domain).toBe(false);
    }
  });

  it("still prints it for domains where the state is the point", () => {
    for (const domain of ["switch", "light", "sensor", "binary_sensor"]) {
      expect(showsState(domain, undefined), domain).toBe(true);
    }
  });

  it("lets the config override in both directions", () => {
    expect(showsState("button", true)).toBe(true);
    expect(showsState("switch", false)).toBe(false);
  });
});
