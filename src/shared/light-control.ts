import type { HassEntity, HomeAssistant } from "../types";

// Toggle/dim logic shared between m3-light-card's group-member row and any
// card that controls a *set* of lights at once (lights overview, lights
// dimmer overview). Kept domain-free of anything render-related — hosts own
// their own throttling and UI, this module only ever calls hass.callService.

/** Whether an entity's brightness can be set, not just switched on/off. */
export function isDimmable(stateObj: HassEntity): boolean {
  if (!stateObj.entity_id.startsWith("light.")) return false;
  const modes: string[] = (stateObj.attributes.supported_color_modes as string[] | undefined) ?? [];
  return modes.some((m) => m !== "onoff") || (modes.length === 0 && stateObj.attributes.brightness !== undefined);
}

// Any light on means the set reads as on, so a tap turns everything off — a
// plain toggle would flip each lamp individually and leave a chequerboard.
//
// `homeassistant` rather than `light`, because the set is not always in the
// light domain: a lamp on a smart plug is a `switch`, and a manual room takes
// whatever entity ids it is given. `light.turn_on` simply fails on those. The
// generic service covers every switchable domain, and for a real light it
// does exactly what `light.turn_on` did.
export function toggleLightSet(hass: HomeAssistant, ids: string[]): void {
  if (ids.length === 0) return;
  const anyOn = ids.some((id) => hass.states[id]?.state === "on");
  hass.callService("homeassistant", anyOn ? "turn_off" : "turn_on", {}, { entity_id: ids });
}

// Dimmable lights get one light.turn_on call with the whole set, so they fade
// together instead of racing each other's transition. Non-dimmable members
// (a switch, or an onoff-only light) only understand on/off, so they're only
// turned on — dragging to 0% doesn't switch them off, same as a light card's
// own slider never turns its light off at min brightness.
export function setLightSetBrightness(
  hass: HomeAssistant,
  ids: string[],
  pct: number,
  transition?: number,
): void {
  const dimmable: string[] = [];
  const switchable: string[] = [];
  for (const id of ids) {
    const stateObj = hass.states[id];
    if (stateObj && isDimmable(stateObj)) {
      dimmable.push(id);
    } else {
      switchable.push(id);
    }
  }
  if (dimmable.length) {
    const data: Record<string, unknown> = { entity_id: dimmable, brightness_pct: pct };
    if (transition !== undefined) data.transition = transition;
    hass.callService("light", "turn_on", data);
  }
  if (switchable.length && pct > 0) {
    hass.callService("homeassistant", "turn_on", {}, { entity_id: switchable });
  }
}

/** Mean brightness (%) of the set's dimmable members that are currently on; 0 if none are. */
export function setBrightnessAverage(hass: HomeAssistant, ids: string[]): number {
  const onDimmable = ids
    .map((id) => hass.states[id])
    .filter((stateObj): stateObj is HassEntity => !!stateObj && stateObj.state === "on" && isDimmable(stateObj));
  if (!onDimmable.length) return 0;
  const total = onDimmable.reduce((sum, stateObj) => {
    const brightness255 = stateObj.attributes.brightness as number | undefined;
    return sum + (brightness255 !== undefined ? Math.round((brightness255 / 255) * 100) : 0);
  }, 0);
  return Math.round(total / onDimmable.length);
}
