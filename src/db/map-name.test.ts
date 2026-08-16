import { describe, expect, it } from 'vitest';
import { baseMapName, isBonusMap } from './map-name.js';

describe('isBonusMap', () => {
  it('detects bonus maps', () => {
    expect(isBonusMap('surf_utopia_bonus1')).toBe(true);
    expect(isBonusMap('surf_beginner_bonus12')).toBe(true);
  });

  it('leaves main maps alone', () => {
    expect(isBonusMap('surf_utopia')).toBe(false);
    expect(isBonusMap('surf_bonus')).toBe(false);
    expect(isBonusMap('surf_bonus_map')).toBe(false);
    expect(isBonusMap('surf_utopia_bonus1_fix')).toBe(false);
  });
});

describe('baseMapName', () => {
  it('strips the bonus suffix', () => {
    expect(baseMapName('surf_utopia_bonus1')).toBe('surf_utopia');
    expect(baseMapName('surf_beginner_bonus12')).toBe('surf_beginner');
  });

  it('returns main map names unchanged', () => {
    expect(baseMapName('surf_utopia')).toBe('surf_utopia');
    expect(baseMapName('surf_bonus')).toBe('surf_bonus');
  });
});
