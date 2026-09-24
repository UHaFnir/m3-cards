// Shared with future callers, not just the lights dimmer overview: any card
// that shows an entity's friendly name next to its room (a per-entity tile,
// a list row) can end up with the room name twice — once from the entity
// itself ("Licht Wohnzimmer"), once from the card's own room caption. Kept
// here so the next such card reuses it instead of re-deriving the same
// regex. Currently wired into m3-lights-dimmer-overview-card only.

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes an area's name from an entity's friendly name, wherever it
 * appears as a whole word (case-insensitive, either end): "Licht
 * Wohnzimmer" / "Wohnzimmer Licht" both become "Licht" for area
 * "Wohnzimmer". Falls back to the original name if stripping would leave
 * nothing (the area name was the whole name) or `areaName` is empty.
 */
export function stripAreaFromEntityName(entityName: string, areaName: string | undefined): string {
  const area = areaName?.trim();
  if (!area) return entityName;
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(area)}(\\s|$)`, "i");
  const stripped = entityName.replace(pattern, " ").replace(/\s+/g, " ").trim();
  return stripped || entityName;
}
