import { describe, it, expect } from "vitest";
import { formatClock } from "./formatting";

describe("formatClock", () => {
  const now = Date.parse("2026-09-13T15:00:00Z");

  it("drops the date when the time is today", () => {
    // A chip saying when the print finishes needs the number, not nine words
    // of date around it.
    expect(formatClock("2026-09-13T15:55:00Z", "de-DE", now)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("keeps a short date when the job runs past midnight", () => {
    const out = formatClock("2026-09-14T02:10:00Z", "de-DE", now)!;
    expect(out).toContain("14");
    expect(out).toMatch(/\d{2}:\d{2}$/);
  });

  it("returns nothing for a value that is not a timestamp", () => {
    expect(formatClock("unknown", "de-DE", now)).toBeUndefined();
    expect(formatClock(undefined, "de-DE", now)).toBeUndefined();
  });
});
