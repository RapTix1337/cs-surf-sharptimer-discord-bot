import type { Client } from 'discord.js';
import { PermissionFlagsBits, RESTJSONErrorCodes } from 'discord.js';
import type { Config } from '../config/index.js';
import type { SteamLink } from '../db/index.js';
import { logger } from '../logger.js';
import type { RankingEntry } from '../scoring/index.js';
import type { RoleSpec } from './rank-roles.js';
import { isManagedRoleName, roleForRank } from './rank-roles.js';

/** The slice of a Discord role the syncer needs; satisfied by Role. */
export interface SyncRole {
  id: string;
  name: string;
  /** Color integer; 0 = colorless. */
  color: number;
  hoist: boolean;
  edit(options: { color?: number; hoist?: boolean }): Promise<unknown>;
}

/** The slice of a guild member the syncer needs; satisfied by GuildMember. */
export interface SyncMember {
  id: string;
  roles: {
    cache: ReadonlyMap<string, SyncRole>;
    add(role: string): Promise<unknown>;
    remove(role: string): Promise<unknown>;
  };
}

/** The slice of a Discord guild the syncer needs; satisfied by Guild. */
export interface SyncGuild {
  id: string;
  members: {
    me: { permissions: { has(permission: bigint): boolean } } | null;
    fetch(userId: string): Promise<SyncMember>;
  };
  roles: {
    cache: ReadonlyMap<string, SyncRole>;
    create(options: { name: string; color?: number; hoist: boolean }): Promise<SyncRole>;
  };
}

/** The slice of the BotRepository the syncer needs. */
export interface SteamLinkStore {
  listSteamLinks(): Promise<SteamLink[]>;
}

function isMemberGoneError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code: unknown }).code
      : null;
  return (
    code === RESTJSONErrorCodes.UnknownMember ||
    code === RESTJSONErrorCodes.UnknownUser ||
    code === RESTJSONErrorCodes.UnknownGuild
  );
}

/**
 * Keeps the guild's rank roles in line with the current ranking. Only linked
 * players are touched. Missing roles are created on demand; existing managed
 * roles are re-colored/re-hoisted when the configuration changed.
 *
 * Role assignments are only written when a player's rank role actually
 * changed: the syncer remembers what it assigned last (per process) and skips
 * players whose target role is unchanged, so a steady leaderboard costs no
 * Discord API writes at all. The flip side: a manual role change to a player
 * whose rank is stable is only repaired after a restart or their next rank
 * change.
 */
export class RoleSyncer {
  private warnedMissingPermission = false;
  /**
   * Managed role name each reconciled user ended up with (null = none).
   * Users absent from the map have unknown state and get reconciled.
   */
  private readonly assigned = new Map<string, string | null>();

  constructor(
    private readonly store: SteamLinkStore,
    private readonly fetchGuild: () => Promise<SyncGuild>,
    private readonly config: Config['roles'],
  ) {}

  async sync(ranking: RankingEntry[]): Promise<void> {
    const guild = await this.fetchGuild();
    if (!this.checkPermission(guild)) {
      return;
    }

    const links = await this.store.listSteamLinks();
    const desired = this.desiredAssignments(ranking, links);

    // Reconcile every linked user plus everyone this process assigned a role
    // to before (covers players who unlink or drop off the ranking while the
    // bot is running).
    const userIds = new Set([...desired.keys(), ...this.assigned.keys()]);

    const rolesByName = new Map<string, SyncRole>();
    for (const userId of userIds) {
      const spec = desired.get(userId) ?? null;
      // Unknown users yield undefined here, which never equals string | null,
      // so they always get reconciled.
      if (this.assigned.get(userId) === (spec?.name ?? null)) {
        continue;
      }
      const role = spec ? await this.ensureRole(guild, rolesByName, spec) : null;
      await this.reconcileMember(guild, userId, role);
    }
  }

  /** discordId → the role spec the user should hold (null = no rank role). */
  private desiredAssignments(
    ranking: RankingEntry[],
    links: SteamLink[],
  ): Map<string, RoleSpec | null> {
    const rankBySteamId = new Map(ranking.map((entry) => [entry.steamId, entry.rank]));
    const desired = new Map<string, RoleSpec | null>();
    for (const link of links) {
      const rank = rankBySteamId.get(link.steamId64);
      desired.set(link.discordId, rank === undefined ? null : roleForRank(rank, this.config));
    }
    return desired;
  }

  /**
   * Finds the role by name (creating it if needed) and aligns its color and
   * hoist flag with the configuration. Looked-up roles are memoized per sync
   * run so each role is checked at most once per tick.
   */
  private async ensureRole(
    guild: SyncGuild,
    rolesByName: Map<string, SyncRole>,
    spec: RoleSpec,
  ): Promise<SyncRole> {
    const memoized = rolesByName.get(spec.name);
    if (memoized) {
      return memoized;
    }

    let role: SyncRole | undefined;
    for (const candidate of guild.roles.cache.values()) {
      if (candidate.name === spec.name) {
        role = candidate;
        break;
      }
    }

    if (!role) {
      role = await guild.roles.create({
        name: spec.name,
        ...(spec.color !== null ? { color: spec.color } : {}),
        hoist: spec.hoist,
      });
      logger.info(`Created rank role "${spec.name}".`);
    } else {
      const patch: { color?: number; hoist?: boolean } = {};
      if (spec.color !== null && role.color !== spec.color) {
        patch.color = spec.color;
      }
      if (role.hoist !== spec.hoist) {
        patch.hoist = spec.hoist;
      }
      if (Object.keys(patch).length > 0) {
        await role.edit(patch);
        logger.info(`Updated rank role "${spec.name}" to match the configuration.`);
      }
    }

    rolesByName.set(spec.name, role);
    return role;
  }

  /**
   * Gives the member exactly the target role (or none): removes all other
   * managed roles they hold and adds the target if missing.
   */
  private async reconcileMember(
    guild: SyncGuild,
    userId: string,
    role: SyncRole | null,
  ): Promise<void> {
    let member: SyncMember;
    try {
      member = await guild.members.fetch(userId);
    } catch (error) {
      if (isMemberGoneError(error)) {
        // Linked but not (or no longer) in the guild — nothing to manage.
        this.assigned.delete(userId);
        return;
      }
      throw error;
    }

    for (const held of member.roles.cache.values()) {
      if (held.id !== role?.id && isManagedRoleName(held.name, this.config)) {
        await member.roles.remove(held.id);
        logger.info(`Removed rank role "${held.name}" from member ${userId}.`);
      }
    }
    if (role && !member.roles.cache.has(role.id)) {
      await member.roles.add(role.id);
      logger.info(`Assigned rank role "${role.name}" to member ${userId}.`);
    }

    this.assigned.set(userId, role?.name ?? null);
  }

  /** Warns once (not every tick) while the Manage Roles permission is missing. */
  private checkPermission(guild: SyncGuild): boolean {
    const me = guild.members.me;
    if (me && me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      if (this.warnedMissingPermission) {
        this.warnedMissingPermission = false;
        logger.info('Manage Roles permission granted — role sync resumed.');
      }
      return true;
    }
    if (!this.warnedMissingPermission) {
      this.warnedMissingPermission = true;
      logger.warn(
        'The bot is missing the Manage Roles permission in this guild — ' +
          'role sync is paused until the permission is granted.',
      );
    }
    return false;
  }
}

/**
 * Resolves the configured guild via the Discord client. Fails (and thereby
 * skips the scheduler run) when the guild cannot be fetched.
 */
export function createGuildFetcher(client: Client, guildId: string): () => Promise<SyncGuild> {
  return async () => await client.guilds.fetch(guildId);
}
