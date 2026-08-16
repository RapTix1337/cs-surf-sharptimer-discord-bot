import { describe, expect, it } from 'vitest';
import type { Config } from '../config/index.js';
import { isManagedRoleName, roleForRank } from './rank-roles.js';

const GOLD = 0xffd700;
const SILVER = 0xc0c0c0;
const BRONZE = 0xcd7f32;

function rolesConfig(overrides: Partial<Config['roles']> = {}): Config['roles'] {
  return {
    enabled: true,
    mode: 'top10',
    nameTemplate: 'Surf #{rank}',
    setColors: true,
    colors: ['#ffd700', '#c0c0c0', '#cd7f32'],
    hoist: false,
    ...overrides,
  };
}

describe('roleForRank', () => {
  describe('every-rank mode', () => {
    const config = rolesConfig({ mode: 'every-rank' });

    it('assigns a templated role to every rank', () => {
      expect(roleForRank(1, config)?.name).toBe('Surf #1');
      expect(roleForRank(7, config)?.name).toBe('Surf #7');
      expect(roleForRank(250, config)?.name).toBe('Surf #250');
    });

    it('colors ranks from the color list in order, later ranks colorless', () => {
      expect(roleForRank(1, config)?.color).toBe(GOLD);
      expect(roleForRank(2, config)?.color).toBe(SILVER);
      expect(roleForRank(3, config)?.color).toBe(BRONZE);
      expect(roleForRank(4, config)?.color).toBe(0);
    });
  });

  describe('top3 mode', () => {
    const config = rolesConfig({ mode: 'top3' });

    it('assigns roles to ranks 1-3 only', () => {
      expect(roleForRank(1, config)?.name).toBe('Surf #1');
      expect(roleForRank(3, config)?.name).toBe('Surf #3');
      expect(roleForRank(4, config)).toBeNull();
    });
  });

  describe('top10 mode', () => {
    const config = rolesConfig({ mode: 'top10' });

    it('assigns roles to ranks 1-10 only', () => {
      expect(roleForRank(1, config)?.name).toBe('Surf #1');
      expect(roleForRank(10, config)?.name).toBe('Surf #10');
      expect(roleForRank(11, config)).toBeNull();
    });
  });

  describe('bundled mode', () => {
    const config = rolesConfig({ mode: 'bundled' });

    it('gives ranks 1-3 individual templated roles', () => {
      expect(roleForRank(1, config)?.name).toBe('Surf #1');
      expect(roleForRank(2, config)?.name).toBe('Surf #2');
      expect(roleForRank(3, config)?.name).toBe('Surf #3');
    });

    it('maps ranks 4-1000 onto the fixed group roles', () => {
      expect(roleForRank(4, config)?.name).toBe('Top Ten');
      expect(roleForRank(10, config)?.name).toBe('Top Ten');
      expect(roleForRank(11, config)?.name).toBe('Top 100');
      expect(roleForRank(100, config)?.name).toBe('Top 100');
      expect(roleForRank(101, config)?.name).toBe('Top 500');
      expect(roleForRank(500, config)?.name).toBe('Top 500');
      expect(roleForRank(501, config)?.name).toBe('Top 1000');
      expect(roleForRank(1000, config)?.name).toBe('Top 1000');
    });

    it('assigns no role beyond rank 1000', () => {
      expect(roleForRank(1001, config)).toBeNull();
    });

    it('colors the group roles from list positions after the top 3', () => {
      const colored = rolesConfig({
        mode: 'bundled',
        colors: ['#111111', '#222222', '#333333', '#444444', '#555555'],
      });
      expect(roleForRank(1, colored)?.color).toBe(0x111111);
      expect(roleForRank(5, colored)?.color).toBe(0x444444); // Top Ten
      expect(roleForRank(50, colored)?.color).toBe(0x555555); // Top 100
      expect(roleForRank(200, colored)?.color).toBe(0); // Top 500, list exhausted
    });
  });

  it('leaves colors unmanaged when setColors is off', () => {
    const config = rolesConfig({ mode: 'top3', setColors: false });
    expect(roleForRank(1, config)?.color).toBeNull();
  });

  it('applies the hoist flag from the configuration', () => {
    expect(roleForRank(1, rolesConfig({ hoist: true }))?.hoist).toBe(true);
    expect(roleForRank(1, rolesConfig({ hoist: false }))?.hoist).toBe(false);
  });

  it('supports custom name templates', () => {
    const config = rolesConfig({ mode: 'top3', nameTemplate: 'Rank {rank} Surfer' });
    expect(roleForRank(2, config)?.name).toBe('Rank 2 Surfer');
  });
});

describe('isManagedRoleName', () => {
  const config = rolesConfig({ mode: 'top10' });

  it('recognizes names the template can produce, for any rank', () => {
    expect(isManagedRoleName('Surf #1', config)).toBe(true);
    expect(isManagedRoleName('Surf #999', config)).toBe(true);
  });

  it('rejects unrelated role names', () => {
    expect(isManagedRoleName('Admin', config)).toBe(false);
    expect(isManagedRoleName('Surf #', config)).toBe(false);
    expect(isManagedRoleName('Surf #1x', config)).toBe(false);
    expect(isManagedRoleName('xSurf #1', config)).toBe(false);
  });

  it('treats the fixed group names as managed only in bundled mode', () => {
    expect(isManagedRoleName('Top Ten', rolesConfig({ mode: 'bundled' }))).toBe(true);
    expect(isManagedRoleName('Top 1000', rolesConfig({ mode: 'bundled' }))).toBe(true);
    expect(isManagedRoleName('Top Ten', config)).toBe(false);
  });

  it('escapes regex specials in the template', () => {
    const config = rolesConfig({ nameTemplate: 'Surf (#{rank})' });
    expect(isManagedRoleName('Surf (#12)', config)).toBe(true);
    expect(isManagedRoleName('Surf #12', config)).toBe(false);
  });
});
