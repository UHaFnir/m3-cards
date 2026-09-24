import type { HomeAssistant } from "../types";

// Shared include/exclude vocabulary for cards that let a user narrow which
// entities they discover, beyond the single include_area + exclude_entities
// pair climate-overview/occupancy/presence expose today. Consumers opt in
// entity-by-entity, so an existing card's filter surface never grows just by
// this module existing — see m3-lights-overview-card for the first user.
export interface EntityFilterConfig {
  include_area?: string[];
  exclude_area?: string[];
  include_entities?: string[];
  exclude_entities?: string[];
  include_labels?: string[];
  exclude_labels?: string[];
  include_state?: string[];
  exclude_state?: string[];
}

// The 8-key subset every EntityFilterConfig consumer wants, pulled off a
// card config once — kept separate from the full config so a discovery dedup
// key built from it doesn't change on every unrelated edit (a color tweak,
// an action change), which would trigger a needless re-discovery.
export function pickEntityFilter(config: EntityFilterConfig): EntityFilterConfig {
  return {
    include_area: config.include_area,
    exclude_area: config.exclude_area,
    include_entities: config.include_entities,
    exclude_entities: config.exclude_entities,
    include_labels: config.include_labels,
    exclude_labels: config.exclude_labels,
    include_state: config.include_state,
    exclude_state: config.exclude_state,
  };
}

export interface FilterEntityContext {
  entityId: string;
  areaId?: string;
  labels: string[];
}

function toSet<T>(values: T[] | undefined): Set<T> | undefined {
  return values?.length ? new Set(values) : undefined;
}

// Everything except state — state needs a live hass.states lookup per entity
// and is checked separately by buildStatePredicate, so callers that already
// have area/label context in hand (e.g. from a registry walk) can filter
// without touching hass at all.
export function buildEntityFilterPredicate(
  filter: EntityFilterConfig | undefined,
): (ctx: FilterEntityContext) => boolean {
  const includeArea = toSet(filter?.include_area);
  const excludeArea = toSet(filter?.exclude_area);
  const includeEntities = toSet(filter?.include_entities);
  const excludeEntities = toSet(filter?.exclude_entities);
  const includeLabels = toSet(filter?.include_labels);
  const excludeLabels = toSet(filter?.exclude_labels);

  return ({ entityId, areaId, labels }) => {
    if (excludeEntities?.has(entityId)) return false;
    if (areaId && excludeArea?.has(areaId)) return false;
    if (excludeLabels?.size && labels.some((l) => excludeLabels.has(l))) return false;
    if (includeEntities && !includeEntities.has(entityId)) return false;
    if (includeArea && (!areaId || !includeArea.has(areaId))) return false;
    if (includeLabels?.size && !labels.some((l) => includeLabels.has(l))) return false;
    return true;
  };
}

export function buildStatePredicate(
  hass: HomeAssistant,
  filter: EntityFilterConfig | undefined,
): (entityId: string) => boolean {
  const includeState = toSet(filter?.include_state);
  const excludeState = toSet(filter?.exclude_state);
  if (!includeState && !excludeState) return () => true;
  return (entityId) => {
    const state = hass.states[entityId]?.state;
    if (state === undefined) return false;
    if (excludeState?.has(state)) return false;
    if (includeState && !includeState.has(state)) return false;
    return true;
  };
}

export function hasStateFilter(filter: EntityFilterConfig | undefined): boolean {
  return !!(filter?.include_state?.length || filter?.exclude_state?.length);
}

function mergedExclude(base?: string[], override?: string[]): string[] | undefined {
  const merged = [...new Set([...(base ?? []), ...(override ?? [])])];
  return merged.length ? merged : undefined;
}

// Layers a narrower filter (e.g. a popup's own filter) on top of a base one.
// include_* is a full override when the narrower side sets it (an include
// list narrows by definition, so there is nothing to union); exclude_* always
// unions, so a base-level exclusion can never be un-excluded by the override.
// inherit=false drops the base entirely — the override becomes the whole
// filter, for a popup/scope that is meant to stand on its own.
export function mergeEntityFilters(
  base: EntityFilterConfig | undefined,
  override: EntityFilterConfig | undefined,
  inherit = true,
): EntityFilterConfig {
  if (!inherit) return { ...override };
  return {
    include_area: override?.include_area?.length ? override.include_area : base?.include_area,
    include_entities: override?.include_entities?.length
      ? override.include_entities
      : base?.include_entities,
    include_labels: override?.include_labels?.length ? override.include_labels : base?.include_labels,
    include_state: override?.include_state?.length ? override.include_state : base?.include_state,
    exclude_area: mergedExclude(base?.exclude_area, override?.exclude_area),
    exclude_entities: mergedExclude(base?.exclude_entities, override?.exclude_entities),
    exclude_labels: mergedExclude(base?.exclude_labels, override?.exclude_labels),
    exclude_state: mergedExclude(base?.exclude_state, override?.exclude_state),
  };
}
