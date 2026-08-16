/** SharpTimer stores bonus tracks as their own "map" named `<map>_bonus<N>`. */
const BONUS_SUFFIX = /_bonus\d+$/;

export function isBonusMap(mapName: string): boolean {
  return BONUS_SUFFIX.test(mapName);
}

/** Returns the main map a bonus belongs to; main maps are returned unchanged. */
export function baseMapName(mapName: string): string {
  return mapName.replace(BONUS_SUFFIX, '');
}
