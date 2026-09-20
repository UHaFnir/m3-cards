import type { HomeAssistant } from "../types";

// A thermostat's target, which is not always one number.
//
// In heat/cool ("Auto") a thermostat holds a *band*: `target_temp_low` and
// `target_temp_high`, and no `temperature` at all. Both climate cards read
// `temperature` and were written before anyone here owned such a thermostat —
// the mini showed nothing, and the full card fell back to `target_temp_high`,
// which is worse than nothing because it looks like a single setpoint and is
// silently the top of a band. Reported as issues #21 and #22 against 2.3.2.
//
// So the target is read as one shape with two cases, and everything that draws
// or changes it asks which case it is looking at.

/** Home Assistant's `ClimateEntityFeature` bits, the two this module needs. */
export const CLIMATE_SUPPORT_TARGET = 1;
export const CLIMATE_SUPPORT_TARGET_RANGE = 2;

export type ClimateTarget =
  | { kind: "single"; value?: number }
  | { kind: "range"; low?: number; high?: number };

/** Which bound a control acts on. */
export type TargetBound = "low" | "high";

interface TargetAttributes {
  temperature?: unknown;
  target_temp_low?: unknown;
  target_temp_high?: unknown;
  supported_features?: unknown;
}

const numeric = (value: unknown): number | undefined =>
  typeof value === "number" && !isNaN(value) ? value : undefined;

/**
 * What this entity's target looks like right now.
 *
 * The attributes decide, not the mode: an entity in heat/cool carries the two
 * bounds and nothing else, and one that supports a range while sitting in
 * `heat` carries a single `temperature`. Reading the state that is actually
 * there means a card is never wrong about a vendor that fills both.
 *
 * `supported_features` only breaks a tie when neither is present yet, so an
 * entity that has just come up shows the right kind of control rather than
 * flipping shape a second later.
 */
export function readClimateTarget(attrs: TargetAttributes | undefined): ClimateTarget {
  const low = numeric(attrs?.target_temp_low);
  const high = numeric(attrs?.target_temp_high);
  if (low !== undefined || high !== undefined) return { kind: "range", low, high };

  const single = numeric(attrs?.temperature);
  if (single !== undefined) return { kind: "single", value: single };

  const features = numeric(attrs?.supported_features) ?? 0;
  // eslint-disable-next-line no-bitwise
  if (features & CLIMATE_SUPPORT_TARGET_RANGE) return { kind: "range", low: undefined, high: undefined };
  return { kind: "single", value: undefined };
}

/** Whether the entity can be asked for a band at all. */
export function supportsRange(attrs: TargetAttributes | undefined): boolean {
  const features = numeric(attrs?.supported_features) ?? 0;
  // eslint-disable-next-line no-bitwise
  return (features & CLIMATE_SUPPORT_TARGET_RANGE) !== 0;
}

/**
 * Moves one bound of a band by `delta`, keeping the band a band.
 *
 * The bounds may not cross, and they may not meet: a thermostat asked to heat
 * to 21 and cool to 21 is being asked to do both at once, and Home Assistant
 * hands that straight to an integration that will either refuse it or fight
 * itself. So each bound stops one step short of the other — the smallest gap
 * that still means something — rather than at it.
 */
export function nudgeRange(
  current: { low?: number; high?: number },
  bound: TargetBound,
  delta: number,
  limits: { step: number; min: number; max: number },
): { low: number; high: number } | undefined {
  const { step, min, max } = limits;
  const low = current.low;
  const high = current.high;
  if (low === undefined || high === undefined) return undefined;

  const round = (value: number) => Math.round(value / step) * step;
  if (bound === "low") {
    const next = Math.min(Math.max(round(low + delta), min), round(high - step));
    return { low: next, high };
  }
  const next = Math.max(Math.min(round(high + delta), max), round(low + step));
  return { low, high: next };
}

/** Sends a single setpoint. */
export function setTargetTemperature(
  hass: HomeAssistant | undefined,
  entityId: string,
  temperature: number,
): void {
  hass?.callService("climate", "set_temperature", { entity_id: entityId, temperature });
}

/**
 * Sends both bounds together.
 *
 * Both, always, even when only one moved: `climate.set_temperature` treats an
 * omitted bound as "no opinion", and several integrations then reset it to
 * whatever they had rather than leaving it be.
 */
export function setTargetRange(
  hass: HomeAssistant | undefined,
  entityId: string,
  range: { low: number; high: number },
): void {
  hass?.callService("climate", "set_temperature", {
    entity_id: entityId,
    target_temp_low: range.low,
    target_temp_high: range.high,
  });
}
