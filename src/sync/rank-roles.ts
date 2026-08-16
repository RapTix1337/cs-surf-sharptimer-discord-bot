import type { Config } from '../config/index.js';

type RolesConfig = Config['roles'];

/**
 * Bundled-mode tiers below the individual #1–#3 roles. The names are fixed —
 * the name template only applies to per-rank roles.
 */
export const BUNDLED_GROUPS = [
  { name: 'Top Ten', minRank: 4, maxRank: 10 },
  { name: 'Top 100', minRank: 11, maxRank: 100 },
  { name: 'Top 500', minRank: 101, maxRank: 500 },
  { name: 'Top 1000', minRank: 501, maxRank: 1000 },
] as const;

/** What a rank role should look like according to the configuration. */
export interface RoleSpec {
  name: string;
  /**
   * Discord color integer, or null when the bot does not manage colors
   * (ROLES_SET_COLORS=false). 0 means "explicitly colorless".
   */
  color: number | null;
  hoist: boolean;
}

function parseHexColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/**
 * The color for the role at the given position in the role order: rank 1, 2,
 * 3, ... — or, in bundled mode, #1, #2, #3, Top Ten, Top 100, Top 500,
 * Top 1000. Positions beyond the configured color list are colorless.
 */
function colorForPosition(position: number, config: RolesConfig): number | null {
  if (!config.setColors) {
    return null;
  }
  const hex = config.colors[position];
  return hex === undefined ? 0 : parseHexColor(hex);
}

function rankRole(rank: number, config: RolesConfig): RoleSpec {
  return {
    name: config.nameTemplate.replaceAll('{rank}', String(rank)),
    color: colorForPosition(rank - 1, config),
    hoist: config.hoist,
  };
}

/**
 * The role a player at the given rank (1-based) should hold, or null when the
 * rank earns no role in the configured mode.
 */
export function roleForRank(rank: number, config: RolesConfig): RoleSpec | null {
  switch (config.mode) {
    case 'every-rank':
      return rankRole(rank, config);
    case 'top3':
      return rank <= 3 ? rankRole(rank, config) : null;
    case 'top10':
      return rank <= 10 ? rankRole(rank, config) : null;
    case 'bundled': {
      if (rank <= 3) {
        return rankRole(rank, config);
      }
      for (const [index, group] of BUNDLED_GROUPS.entries()) {
        if (rank >= group.minRank && rank <= group.maxRank) {
          return {
            name: group.name,
            color: colorForPosition(3 + index, config),
            hoist: config.hoist,
          };
        }
      }
      return null;
    }
  }
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Whether a role name is one the bot manages under the current configuration:
 * any name the template can produce (for any rank) plus, in bundled mode, the
 * fixed group names. Outdated rank roles are only ever removed from players
 * when their name matches this, so unrelated roles are never touched. Note
 * that changing the name template (or leaving bundled mode) orphans the roles
 * created under the old configuration — those have to be deleted by hand.
 */
export function isManagedRoleName(name: string, config: RolesConfig): boolean {
  const pattern = new RegExp(
    `^${config.nameTemplate.replace(REGEX_SPECIALS, '\\$&').replaceAll('\\{rank\\}', '\\d+')}$`,
  );
  if (pattern.test(name)) {
    return true;
  }
  return config.mode === 'bundled' && BUNDLED_GROUPS.some((group) => group.name === name);
}
