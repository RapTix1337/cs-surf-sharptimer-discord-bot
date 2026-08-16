/**
 * Pure scoring engine — no IO, no Discord, no database. Takes a list of
 * personal-best records plus the scoring configuration and produces per-map
 * points, the overall ranking and the improvement potential per player+map.
 *
 * Points are a pure function of the current records: everything is recomputed
 * from scratch on every call, so configuration changes apply retroactively.
 *
 * Per map with N finishers:
 *
 *   base          = basePoints                   (completion bonus, N=1 pays only this)
 *   pot           = potPerFinisher * (N - 1)     (competition pot, rank 1 gets it in full)
 *   rankScore     = (N - rank) / (N - 1)         (1.0 for rank 1, 0.0 for the last)
 *   tLastCapped   = min(tLast, outlierCap * tFirst)
 *   timeScore     = clamp((tLastCapped - tYou) / (tLastCapped - tFirst), 0, 1)
 *   score         = rankWeight * rankScore + timeWeight * timeScore
 *   mapPoints     = base + pot * score
 *   points        = mapPoints * weight           (weight: 1.0 main map, bonusWeight for bonuses)
 *
 * Ties (identical ticks) share a rank and the next rank is skipped. If every
 * counted time is identical (tFirst == tLastCapped) the timeScore is 1.0 for
 * everyone. Totals stay unrounded; round only for display.
 */

export interface ScoringConfig {
  basePoints: number;
  potPerFinisher: number;
  rankWeight: number;
  timeWeight: number;
  outlierCap: number;
  bonusWeight: number;
}

/** One personal best. Structurally satisfied by the read layer's RecordRow. */
export interface ScoringRecord {
  mapName: string;
  isBonus: boolean;
  steamId: string;
  playerName: string;
  timerTicks: number;
}

export interface MapScoreEntry {
  steamId: string;
  playerName: string;
  timerTicks: number;
  /** Competition ranking: ties share a rank, the next rank is skipped. */
  rank: number;
  rankScore: number;
  timeScore: number;
  /** Points before the map weight is applied. */
  mapPoints: number;
  /** Points after the map weight is applied — what the player actually earns. */
  points: number;
}

export interface MapScore {
  mapName: string;
  isBonus: boolean;
  weight: number;
  finisherCount: number;
  /** Sorted best time first. */
  entries: MapScoreEntry[];
}

export interface RankingEntry {
  /** Competition ranking on total points: ties share a rank. */
  rank: number;
  steamId: string;
  playerName: string;
  /** Unrounded total across all maps and bonuses. */
  points: number;
  /** Number of maps/bonuses where the player holds rank 1 (shared or not). */
  firstPlaces: number;
  mapsFinished: number;
  totalMaps: number;
  /** mapsFinished / totalMaps, in [0, 1]. */
  completionRate: number;
}

export interface MapPotential {
  mapName: string;
  isBonus: boolean;
  finished: boolean;
  /** The player's rank on the map, or null if they have not finished it. */
  rank: number | null;
  /** Weighted points the player currently earns on the map (0 if unfinished). */
  currentPoints: number;
  /**
   * Weighted points the player would earn holding rank 1. For unfinished maps
   * this assumes the player joins as a new finisher (N+1 finishers).
   */
  firstPlacePoints: number;
  /** firstPlacePoints - currentPoints; the basis for /improve and /unfinished. */
  potential: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mapWeight(isBonus: boolean, config: ScoringConfig): number {
  return isBonus ? config.bonusWeight : 1;
}

/** Unweighted points for holding rank 1 on a map with the given finisher count. */
function firstPlaceMapPoints(finisherCount: number, config: ScoringConfig): number {
  const pot = config.potPerFinisher * (finisherCount - 1);
  return config.basePoints + pot * (config.rankWeight + config.timeWeight);
}

/**
 * Scores every map and bonus in the record list. Records for the same player
 * on the same map are collapsed to their best time (the database's primary
 * key already guarantees uniqueness; this keeps the math safe regardless).
 * Maps are returned in alphabetical order, entries best time first.
 */
export function scoreMaps(records: ScoringRecord[], config: ScoringConfig): MapScore[] {
  const byMap = new Map<string, { isBonus: boolean; best: Map<string, ScoringRecord> }>();
  for (const record of records) {
    let map = byMap.get(record.mapName);
    if (!map) {
      map = { isBonus: record.isBonus, best: new Map() };
      byMap.set(record.mapName, map);
    }
    const existing = map.best.get(record.steamId);
    if (!existing || record.timerTicks < existing.timerTicks) {
      map.best.set(record.steamId, record);
    }
  }

  return [...byMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mapName, { isBonus, best }]) => scoreMap(mapName, isBonus, [...best.values()], config));
}

function scoreMap(
  mapName: string,
  isBonus: boolean,
  records: ScoringRecord[],
  config: ScoringConfig,
): MapScore {
  const sorted = [...records].sort(
    (a, b) =>
      a.timerTicks - b.timerTicks ||
      a.playerName.localeCompare(b.playerName) ||
      a.steamId.localeCompare(b.steamId),
  );

  const n = sorted.length;
  const weight = mapWeight(isBonus, config);
  const first = sorted[0];
  const last = sorted[n - 1];
  if (first === undefined || last === undefined) {
    return { mapName, isBonus, weight, finisherCount: 0, entries: [] };
  }

  const pot = config.potPerFinisher * (n - 1);
  const tFirst = first.timerTicks;
  const tLastCapped = Math.min(last.timerTicks, config.outlierCap * tFirst);
  const spread = tLastCapped - tFirst;

  const entries: MapScoreEntry[] = [];
  let rank = 0;
  let previousTicks = Number.NaN;
  for (let i = 0; i < n; i++) {
    const record = sorted[i];
    if (record === undefined) {
      continue;
    }
    if (record.timerTicks !== previousTicks) {
      rank = i + 1;
    }
    previousTicks = record.timerTicks;
    const rankScore = n === 1 ? 1 : (n - rank) / (n - 1);
    const timeScore = spread <= 0 ? 1 : clamp01((tLastCapped - record.timerTicks) / spread);
    const score = config.rankWeight * rankScore + config.timeWeight * timeScore;
    const mapPoints = config.basePoints + pot * score;
    entries.push({
      steamId: record.steamId,
      playerName: record.playerName,
      timerTicks: record.timerTicks,
      rank,
      rankScore,
      timeScore,
      mapPoints,
      points: mapPoints * weight,
    });
  }

  return { mapName, isBonus, weight, finisherCount: n, entries };
}

/**
 * Aggregates map scores into the overall ranking: total points, number of
 * first places and completion rate per player. Ties on total points share a
 * rank (competition ranking); order within a tie is alphabetical.
 */
export function buildRanking(mapScores: MapScore[]): RankingEntry[] {
  const totalMaps = mapScores.length;
  const players = new Map<
    string,
    { playerName: string; points: number; firstPlaces: number; mapsFinished: number }
  >();

  for (const map of mapScores) {
    for (const entry of map.entries) {
      let player = players.get(entry.steamId);
      if (!player) {
        player = { playerName: entry.playerName, points: 0, firstPlaces: 0, mapsFinished: 0 };
        players.set(entry.steamId, player);
      }
      player.playerName = entry.playerName;
      player.points += entry.points;
      player.mapsFinished += 1;
      if (entry.rank === 1) {
        player.firstPlaces += 1;
      }
    }
  }

  const sorted = [...players.entries()].sort(
    ([aId, a], [bId, b]) =>
      b.points - a.points || a.playerName.localeCompare(b.playerName) || aId.localeCompare(bId),
  );

  const ranking: RankingEntry[] = [];
  let rank = 0;
  let position = 0;
  let previousPoints = Number.NaN;
  for (const [steamId, player] of sorted) {
    position += 1;
    if (player.points !== previousPoints) {
      rank = position;
    }
    previousPoints = player.points;
    ranking.push({
      rank,
      steamId,
      playerName: player.playerName,
      points: player.points,
      firstPlaces: player.firstPlaces,
      mapsFinished: player.mapsFinished,
      totalMaps,
      completionRate: totalMaps === 0 ? 0 : player.mapsFinished / totalMaps,
    });
  }
  return ranking;
}

/**
 * Improvement potential per map for one player: how many extra points rank 1
 * on that map would be worth to them. For maps the player has not finished the
 * hypothetical rank 1 is computed with one additional finisher (N+1). Returned
 * in the same order as the given map scores; sorting is up to the caller.
 */
export function computeMapPotentials(
  mapScores: MapScore[],
  steamId: string,
  config: ScoringConfig,
): MapPotential[] {
  return mapScores.map((map) => {
    const entry = map.entries.find((candidate) => candidate.steamId === steamId);
    const finisherCount = entry ? map.finisherCount : map.finisherCount + 1;
    const firstPlacePoints = firstPlaceMapPoints(finisherCount, config) * map.weight;
    const currentPoints = entry?.points ?? 0;
    return {
      mapName: map.mapName,
      isBonus: map.isBonus,
      finished: entry !== undefined,
      rank: entry?.rank ?? null,
      currentPoints,
      firstPlacePoints,
      potential: firstPlacePoints - currentPoints,
    };
  });
}
