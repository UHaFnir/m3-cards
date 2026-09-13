import { describe, it, expect } from "vitest";
import { confirmVisuals, type ConfirmRequest } from "./confirm-dialog";

const question = (extra: Partial<ConfirmRequest> = {}): ConfirmRequest => ({
  title: "Really stop?",
  confirmLabel: "Stop",
  cancelLabel: "Cancel",
  onConfirm: () => {},
  ...extra,
});

describe("confirmVisuals", () => {
  it("treats a question as destructive unless it says otherwise", () => {
    // Nothing neutral is worth a modal dialog, so the red is the default and
    // the caller has to opt out of it rather than into it.
    expect(confirmVisuals(question()).destructive).toBe(true);
    expect(confirmVisuals(question({ destructive: false })).destructive).toBe(false);
  });

  it("leads with a warning icon, or a question mark when not destructive", () => {
    expect(confirmVisuals(question()).icon).toBe("mdi:alert-outline");
    expect(confirmVisuals(question({ destructive: false })).icon).toBe("mdi:help-circle-outline");
  });

  it("lets a caller name its own icon", () => {
    expect(confirmVisuals(question({ icon: "mdi:stop" })).icon).toBe("mdi:stop");
  });

  it("takes the theme's primary when neutral, never a card-scoped variable", () => {
    // The dialog renders outside `ha-card`, so a `--m3pr-accent` set inline
    // there would resolve to nothing.
    expect(confirmVisuals(question({ destructive: false })).accent).toBe("var(--primary-color)");
  });

  it("is safe with no question pending — the dialog renders closed and empty", () => {
    expect(confirmVisuals(undefined).destructive).toBe(true);
  });
});
