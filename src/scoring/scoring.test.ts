import { describe, expect, it } from 'vitest';
import type { MapScore, ScoringConfig, ScoringRecord } from './scoring.js';
import { buildRanking, computeMapPotentials, scoreMaps } from './scoring.js';

const defaultConfig: ScoringConfig = {
  basePoints: 20,
  potPerFinisher: 15,
  rankWeight: 0.5,
  timeWeight: 0.5,
  outlierCap: 3,
  bonusWeight: 0.25,
};

function record(
  mapName: string,
  steamId: string,
  timerTicks: number,
  overrides: Partial<ScoringRecord> = {},
): ScoringRecord {
  return {
    mapName,
    isBonus: /_bonus\d+$/.test(mapName),
    steamId,
    playerName: `player-${steamId}`,
    timerTicks,
    ...overrides,
  };
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected an item at index ${index}`);
  }
  return item;
}

function scoreSingleMap(records: ScoringRecord[], config: ScoringConfig): MapScore {
  const maps = scoreMaps(records, config);
  expect(maps).toHaveLength(1);
  return at(maps, 0);
}

describe('scoreMaps', () => {
  it('reproduces the worked example from the spec (45.2s / 47.1s / 61.0s)', () => {
    // The spec's example times expressed in ticks; the formula only depends on
    // ratios, so any tick rate reproduces the documented 50 / 41 / 20 split.
    const map = scoreSingleMap(
      [
        record('surf_example', 'a', 452),
        record('surf_example', 'b', 471),
        record('surf_example', 'c', 610),
      ],
      defaultConfig,
    );

    expect(map.finisherCount).toBe(3);
    const [first, second, third] = [at(map.entries, 0), at(map.entries, 1), at(map.entries, 2)];

    expect(first.rank).toBe(1);
    expect(first.rankScore).toBe(1);
    expect(first.timeScore).toBe(1);
    expect(first.points).toBe(50);

    expect(second.rank).toBe(2);
    expect(second.rankScore).toBeCloseTo(0.5, 10);
    expect(second.timeScore).toBeCloseTo(139 / 158, 10);
    expect(second.points).toBeCloseTo(20 + 30 * (0.25 + 0.5 * (139 / 158)), 10);

    expect(third.rank).toBe(3);
    expect(third.rankScore).toBe(0);
    expect(third.timeScore).toBe(0);
    expect(third.points).toBe(20);

    expect(map.entries.map((entry) => Math.round(entry.points))).toEqual([50, 41, 20]);
  });

  it('pays only the base points to a sole finisher (N=1)', () => {
    const map = scoreSingleMap([record('surf_lonely', 'a', 1234)], defaultConfig);

    expect(map.finisherCount).toBe(1);
    expect(map.entries).toHaveLength(1);
    expect(at(map.entries, 0)).toMatchObject({
      rank: 1,
      rankScore: 1,
      timeScore: 1,
      mapPoints: 20,
      points: 20,
    });
  });

  it('gives tied players the same rank and skips the next rank', () => {
    const map = scoreSingleMap(
      [record('surf_tie', 'a', 100), record('surf_tie', 'b', 100), record('surf_tie', 'c', 150)],
      defaultConfig,
    );

    expect(map.entries.map((entry) => entry.rank)).toEqual([1, 1, 3]);
    // Both leaders score identically and get the full pot.
    expect(at(map.entries, 0).points).toBe(50);
    expect(at(map.entries, 1).points).toBe(50);
    expect(at(map.entries, 2).points).toBe(20);
  });

  it('handles ties in the middle of the field', () => {
    const map = scoreSingleMap(
      [
        record('surf_tie2', 'a', 100),
        record('surf_tie2', 'b', 120),
        record('surf_tie2', 'c', 120),
        record('surf_tie2', 'd', 140),
      ],
      defaultConfig,
    );

    expect(map.entries.map((entry) => entry.rank)).toEqual([1, 2, 2, 4]);
    expect(at(map.entries, 1).rankScore).toBeCloseTo(2 / 3, 10);
    expect(at(map.entries, 2).rankScore).toBeCloseTo(2 / 3, 10);
    expect(at(map.entries, 1).timeScore).toBe(at(map.entries, 2).timeScore);
    expect(at(map.entries, 1).points).toBe(at(map.entries, 2).points);
    expect(at(map.entries, 3).rankScore).toBe(0);
  });

  it('gives everyone full points when all times are identical', () => {
    const map = scoreSingleMap(
      [record('surf_same', 'a', 100), record('surf_same', 'b', 100), record('surf_same', 'c', 100)],
      defaultConfig,
    );

    for (const entry of map.entries) {
      expect(entry.rank).toBe(1);
      expect(entry.rankScore).toBe(1);
      expect(entry.timeScore).toBe(1);
      expect(entry.points).toBe(50);
    }
  });

  it('caps outlier times so slow stragglers do not distort the time score', () => {
    // tLast (500) exceeds cap * tFirst (300): the scale ends at 300 instead.
    const map = scoreSingleMap(
      [
        record('surf_outlier', 'a', 100),
        record('surf_outlier', 'b', 150),
        record('surf_outlier', 'c', 500),
      ],
      defaultConfig,
    );

    expect(at(map.entries, 0).timeScore).toBe(1);
    expect(at(map.entries, 1).timeScore).toBeCloseTo((300 - 150) / (300 - 100), 10);
    expect(at(map.entries, 1).points).toBeCloseTo(20 + 30 * (0.5 * 0.5 + 0.5 * 0.75), 10);
    // The outlier sits beyond the capped scale and is clamped to 0.
    expect(at(map.entries, 2).timeScore).toBe(0);
    expect(at(map.entries, 2).points).toBe(20);
  });

  it('treats a scale collapsed by the cap like an all-identical field', () => {
    // outlierCap 1 collapses the scale to exactly tFirst, so tFirst ==
    // tLastCapped even though the raw ticks differ; per the spec everyone
    // gets timeScore 1 in that case.
    const map = scoreSingleMap(
      [record('surf_cap1', 'a', 100), record('surf_cap1', 'b', 100), record('surf_cap1', 'c', 120)],
      { ...defaultConfig, outlierCap: 1 },
    );

    expect(map.entries.map((entry) => entry.timeScore)).toEqual([1, 1, 1]);
  });

  it('applies the bonus weight to bonus tracks', () => {
    const bonus = scoreSingleMap(
      [
        record('surf_map_bonus1', 'a', 100),
        record('surf_map_bonus1', 'b', 150),
        record('surf_map_bonus1', 'c', 200),
      ],
      defaultConfig,
    );

    expect(bonus.isBonus).toBe(true);
    expect(bonus.weight).toBe(0.25);
    expect(at(bonus.entries, 0).mapPoints).toBe(50);
    expect(at(bonus.entries, 0).points).toBe(12.5);
    expect(at(bonus.entries, 2).mapPoints).toBe(20);
    expect(at(bonus.entries, 2).points).toBe(5);
  });

  it('respects custom rank/time weights', () => {
    const rankOnly: ScoringConfig = { ...defaultConfig, rankWeight: 1, timeWeight: 0 };
    const map = scoreSingleMap(
      [
        record('surf_weights', 'a', 100),
        record('surf_weights', 'b', 101),
        record('surf_weights', 'c', 200),
      ],
      rankOnly,
    );

    // Pure rank scoring: 20 + 30 * {1, 0.5, 0}.
    expect(map.entries.map((entry) => entry.points)).toEqual([50, 35, 20]);
  });

  it('collapses duplicate rows for the same player to their best time', () => {
    const map = scoreSingleMap(
      [record('surf_dupe', 'a', 120), record('surf_dupe', 'a', 100), record('surf_dupe', 'b', 110)],
      defaultConfig,
    );

    expect(map.finisherCount).toBe(2);
    expect(at(map.entries, 0)).toMatchObject({ steamId: 'a', timerTicks: 100, rank: 1 });
    expect(at(map.entries, 1)).toMatchObject({ steamId: 'b', timerTicks: 110, rank: 2 });
  });

  it('returns maps alphabetically and entries best time first', () => {
    const maps = scoreMaps(
      [
        record('surf_zebra', 'a', 100),
        record('surf_alpha', 'b', 300),
        record('surf_alpha', 'a', 200),
      ],
      defaultConfig,
    );

    expect(maps.map((map) => map.mapName)).toEqual(['surf_alpha', 'surf_zebra']);
    expect(at(maps, 0).entries.map((entry) => entry.steamId)).toEqual(['a', 'b']);
  });

  it('returns an empty list for no records', () => {
    expect(scoreMaps([], defaultConfig)).toEqual([]);
  });
});

describe('buildRanking', () => {
  it('aggregates points, first places and completion rate across maps', () => {
    const maps = scoreMaps(
      [
        // Main map: the spec example.
        record('surf_example', 'alice', 452),
        record('surf_example', 'bob', 471),
        record('surf_example', 'carol', 610),
        // Second main map: bob alone.
        record('surf_solo', 'bob', 999),
        // Bonus: alice and bob tied at the top.
        record('surf_example_bonus1', 'alice', 100),
        record('surf_example_bonus1', 'bob', 100),
      ],
      defaultConfig,
    );
    const ranking = buildRanking(maps);

    expect(ranking.map((entry) => entry.steamId)).toEqual(['bob', 'alice', 'carol']);
    expect(ranking.map((entry) => entry.rank)).toEqual([1, 2, 3]);

    const [bob, alice, carol] = [at(ranking, 0), at(ranking, 1), at(ranking, 2)];
    // Bonus tie pays both leaders the full 35 map points, weighted to 8.75.
    expect(bob.points).toBeCloseTo(20 + 30 * (0.25 + 0.5 * (139 / 158)) + 20 + 8.75, 10);
    expect(alice.points).toBeCloseTo(50 + 8.75, 10);
    expect(carol.points).toBe(20);

    expect(bob.firstPlaces).toBe(2); // surf_solo + shared bonus lead
    expect(alice.firstPlaces).toBe(2); // surf_example + shared bonus lead
    expect(carol.firstPlaces).toBe(0);

    expect(bob.completionRate).toBe(1);
    expect(alice.completionRate).toBeCloseTo(2 / 3, 10);
    expect(carol.completionRate).toBeCloseTo(1 / 3, 10);
    expect(carol.mapsFinished).toBe(1);
    expect(carol.totalMaps).toBe(3);
  });

  it('gives players with equal totals the same rank and skips the next rank', () => {
    const maps = scoreMaps(
      [record('surf_tie', 'a', 100), record('surf_tie', 'b', 100), record('surf_tie', 'c', 130)],
      defaultConfig,
    );
    const ranking = buildRanking(maps);

    expect(ranking.map((entry) => entry.rank)).toEqual([1, 1, 3]);
  });

  it('returns an empty ranking for no maps', () => {
    expect(buildRanking([])).toEqual([]);
  });
});

describe('computeMapPotentials', () => {
  const maps = scoreMaps(
    [
      record('surf_example', 'alice', 452),
      record('surf_example', 'bob', 471),
      record('surf_example', 'carol', 610),
      record('surf_solo', 'bob', 999),
      record('surf_example_bonus1', 'alice', 100),
    ],
    defaultConfig,
  );

  function potentialFor(steamId: string, mapName: string) {
    const potential = computeMapPotentials(maps, steamId, defaultConfig).find(
      (entry) => entry.mapName === mapName,
    );
    if (!potential) {
      throw new Error(`no potential entry for ${mapName}`);
    }
    return potential;
  }

  it('is the gap to rank 1 for a finished map', () => {
    const potential = potentialFor('bob', 'surf_example');
    expect(potential.finished).toBe(true);
    expect(potential.rank).toBe(2);
    expect(potential.firstPlacePoints).toBe(50);
    expect(potential.potential).toBeCloseTo(50 - (20 + 30 * (0.25 + 0.5 * (139 / 158))), 10);
  });

  it('is zero for the player holding rank 1', () => {
    expect(potentialFor('alice', 'surf_example').potential).toBe(0);
  });

  it('is zero for a sole finisher', () => {
    const potential = potentialFor('bob', 'surf_solo');
    expect(potential.finished).toBe(true);
    expect(potential.firstPlacePoints).toBe(20);
    expect(potential.potential).toBe(0);
  });

  it('assumes N+1 finishers for an unfinished map', () => {
    // surf_solo has one finisher; carol taking it over would make two:
    // 20 + 15 * 1 = 35 points for the new rank 1.
    const potential = potentialFor('carol', 'surf_solo');
    expect(potential.finished).toBe(false);
    expect(potential.rank).toBeNull();
    expect(potential.currentPoints).toBe(0);
    expect(potential.firstPlacePoints).toBe(35);
    expect(potential.potential).toBe(35);
  });

  it('weights the potential of bonus tracks', () => {
    // The bonus has one finisher (alice); bob joining makes 2: (20 + 15) * 0.25.
    const potential = potentialFor('bob', 'surf_example_bonus1');
    expect(potential.finished).toBe(false);
    expect(potential.isBonus).toBe(true);
    expect(potential.potential).toBeCloseTo(35 * 0.25, 10);
  });

  it('is zero for a player sharing rank 1', () => {
    const tiedMaps = scoreMaps(
      [record('surf_tie', 'a', 100), record('surf_tie', 'b', 100), record('surf_tie', 'c', 130)],
      defaultConfig,
    );
    expect(at(computeMapPotentials(tiedMaps, 'b', defaultConfig), 0).potential).toBe(0);
  });
});
