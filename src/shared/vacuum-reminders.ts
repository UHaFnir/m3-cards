import type { HomeAssistant, VacuumReminderConfig } from "../types";

// Recurring chores a vacuum does not track itself — changing the mop pad,
// wiping the sensors, emptying a bin the dock has no sensor for.
//
// THE PROBLEM THIS SOLVES
//
// "Every three runs" needs a reference point: three runs *since what*. The
// integration counts total runs since the machine was new and never resets, so
// the count alone cannot say whether the mop was changed yesterday.
//
// Two ways out, and the card offers both because they suit different people.
//
// Without a helper the reminder simply fires on every multiple of `every`:
// run 3, 6, 9. Nothing to set up, and it cannot be acknowledged early — if you
// change the mop after two runs it will still nag on the third.
//
// With `counter_entity` — an `input_number` holding the meter reading at the
// last acknowledgement — it becomes a real "N runs since you last did this",
// which can be marked done from the card and survives a browser change,
// because it lives in Home Assistant rather than here.

export type ReminderBasis = "runs" | "hours";

export interface ReminderState {
  /** Config this was computed from, carried through for rendering. */
  config: VacuumReminderConfig;
  basis: ReminderBasis;
  /** Whatever the meter reads now — runs, or hours of runtime. */
  meter: number;
  /** How far past the last acknowledgement, when that is knowable. */
  since?: number;
  /** How many more until it comes due. Negative once it is overdue. */
  remaining?: number;
  /** 0..1 towards the next due point, for a bar. */
  progress: number;
  due: boolean;
  /** True only when a counter entity makes acknowledging meaningful. */
  acknowledgeable: boolean;
}

function numeric(hass: HomeAssistant | undefined, entityId: string | undefined): number | undefined {
  if (!entityId) return undefined;
  const value = parseFloat(hass?.states[entityId]?.state ?? "");
  return isNaN(value) ? undefined : value;
}

/**
 * Works out where a reminder stands.
 *
 * `totals` are the discovered lifetime sensors; a reminder naming neither
 * `every_runs` nor `every_hours` is not a reminder and returns nothing.
 */
export function reminderState(
  hass: HomeAssistant | undefined,
  config: VacuumReminderConfig,
  totals: { runs?: string; hours?: string },
): ReminderState | undefined {
  const basis: ReminderBasis = config.every_hours ? "hours" : "runs";
  const every = basis === "hours" ? config.every_hours : config.every_runs;
  if (!every || every <= 0) return undefined;

  const meter = numeric(hass, basis === "hours" ? totals.hours : totals.runs);
  if (meter === undefined) return undefined;

  const mark = numeric(hass, config.counter_entity);
  if (mark === undefined) {
    // No reference point: fall back to multiples of `every`. Only whole runs
    // divide sensibly, so an hours-based reminder without a mark compares
    // against the remainder instead of an exact hit.
    const position = meter % every;
    const due = basis === "runs" ? Math.floor(meter) > 0 && Math.floor(meter) % every === 0 : false;
    return {
      config,
      basis,
      meter,
      progress: Math.min(1, position / every),
      due,
      acknowledgeable: false,
    };
  }

  const since = meter - mark;
  const remaining = every - since;
  return {
    config,
    basis,
    meter,
    since,
    remaining,
    progress: Math.min(1, Math.max(0, since / every)),
    due: since >= every,
    acknowledgeable: true,
  };
}

export function reminderStates(
  hass: HomeAssistant | undefined,
  configs: VacuumReminderConfig[] | undefined,
  totals: { runs?: string; hours?: string },
): ReminderState[] {
  return (configs ?? [])
    .map((config) => reminderState(hass, config, totals))
    .filter((state): state is ReminderState => !!state);
}

/**
 * Marks a reminder done by writing the current meter into its helper.
 *
 * Only possible with a counter entity — without one there is nowhere to put
 * the answer, which is exactly why the card does not offer the button then.
 */
export function acknowledgeReminder(hass: HomeAssistant | undefined, state: ReminderState): void {
  if (!hass || !state.acknowledgeable || !state.config.counter_entity) return;
  hass.callService("input_number", "set_value", {
    entity_id: state.config.counter_entity,
    value: Math.floor(state.meter),
  });
}
