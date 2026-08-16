import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../config/index.js';
import type { SteamLink } from '../db/index.js';
import { logger } from '../logger.js';
import type { RankingEntry } from '../scoring/index.js';
import { RoleSyncer } from './role-sync.js';

function rolesConfig(overrides: Partial<Config['roles']> = {}): Config['roles'] {
  return {
    enabled: true,
    mode: 'top3',
    nameTemplate: 'Surf #{rank}',
    setColors: true,
    colors: ['#ffd700', '#c0c0c0', '#cd7f32'],
    hoist: false,
    ...overrides,
  };
}

function entry(rank: number, steamId: string): RankingEntry {
  return {
    rank,
    steamId,
    playerName: `player-${steamId}`,
    points: 1000 - rank,
    firstPlaces: 0,
    mapsFinished: 1,
    totalMaps: 1,
    completionRate: 1,
  };
}

function link(discordId: string, steamId64: string): SteamLink {
  return { discordId, steamId64, linkedAt: 0 };
}

class FakeRole {
  edits: { color?: number; hoist?: boolean }[] = [];

  constructor(
    public id: string,
    public name: string,
    public color = 0,
    public hoist = false,
  ) {}

  edit(options: { color?: number; hoist?: boolean }): Promise<unknown> {
    this.edits.push(options);
    this.color = options.color ?? this.color;
    this.hoist = options.hoist ?? this.hoist;
    return Promise.resolve(this);
  }
}

class FakeMember {
  added: string[] = [];
  removed: string[] = [];

  constructor(
    public id: string,
    private readonly guild: FakeGuild,
    public roleIds: string[] = [],
  ) {}

  get roles(): {
    cache: ReadonlyMap<string, FakeRole>;
    add(role: string): Promise<unknown>;
    remove(role: string): Promise<unknown>;
  } {
    const cache = new Map(
      this.roleIds
        .map((id) => this.guild.rolesById.get(id))
        .filter((role): role is FakeRole => role !== undefined)
        .map((role) => [role.id, role]),
    );
    return {
      cache,
      add: (roleId: string) => {
        this.added.push(roleId);
        this.roleIds.push(roleId);
        return Promise.resolve(this);
      },
      remove: (roleId: string) => {
        this.removed.push(roleId);
        this.roleIds = this.roleIds.filter((id) => id !== roleId);
        return Promise.resolve(this);
      },
    };
  }
}

class FakeGuild {
  id = 'guild-1';
  rolesById = new Map<string, FakeRole>();
  membersById = new Map<string, FakeMember>();
  createdRoleNames: string[] = [];
  memberFetches = 0;
  hasManageRoles = true;
  private nextRoleId = 1;

  addRole(name: string, color = 0, hoist = false): FakeRole {
    const role = new FakeRole(`role-${this.nextRoleId++}`, name, color, hoist);
    this.rolesById.set(role.id, role);
    return role;
  }

  addMember(id: string, ...roles: FakeRole[]): FakeMember {
    const member = new FakeMember(
      id,
      this,
      roles.map((role) => role.id),
    );
    this.membersById.set(id, member);
    return member;
  }

  roleByName(name: string): FakeRole | undefined {
    return [...this.rolesById.values()].find((role) => role.name === name);
  }

  get members() {
    return {
      me: { permissions: { has: () => this.hasManageRoles } },
      fetch: (userId: string): Promise<FakeMember> => {
        this.memberFetches += 1;
        const member = this.membersById.get(userId);
        if (!member) {
          return Promise.reject(Object.assign(new Error('Unknown Member'), { code: 10007 }));
        }
        return Promise.resolve(member);
      },
    };
  }

  get roles() {
    return {
      cache: this.rolesById as ReadonlyMap<string, FakeRole>,
      create: (options: { name: string; color?: number; hoist: boolean }): Promise<FakeRole> => {
        this.createdRoleNames.push(options.name);
        return Promise.resolve(this.addRole(options.name, options.color ?? 0, options.hoist));
      },
    };
  }
}

function setup(options: { config?: Config['roles']; links: SteamLink[]; guild?: FakeGuild }): {
  guild: FakeGuild;
  syncer: RoleSyncer;
  links: SteamLink[];
} {
  const guild = options.guild ?? new FakeGuild();
  const links = options.links;
  const syncer = new RoleSyncer(
    { listSteamLinks: () => Promise.resolve(links) },
    () => Promise.resolve(guild),
    options.config ?? rolesConfig(),
  );
  return { guild, syncer, links };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RoleSyncer', () => {
  it('creates missing roles and assigns them to linked, ranked players only', async () => {
    const { guild, syncer } = setup({
      links: [link('u1', 's1'), link('u2', 's2'), link('u4', 's4')],
    });
    const m1 = guild.addMember('u1');
    const m2 = guild.addMember('u2');
    const m4 = guild.addMember('u4');

    // s3 is rank 3 but not linked; s4 is linked but rank 4 (no role in top3).
    await syncer.sync([entry(1, 's1'), entry(2, 's2'), entry(3, 's3'), entry(4, 's4')]);

    expect(guild.createdRoleNames.sort()).toEqual(['Surf #1', 'Surf #2']);
    expect(m1.added).toEqual([guild.roleByName('Surf #1')?.id]);
    expect(m2.added).toEqual([guild.roleByName('Surf #2')?.id]);
    expect(m4.added).toEqual([]);
    expect(guild.roleByName('Surf #3')).toBeUndefined();
  });

  it('creates roles with the configured color and hoist flag', async () => {
    const { guild, syncer } = setup({
      config: rolesConfig({ hoist: true }),
      links: [link('u1', 's1')],
    });
    guild.addMember('u1');

    await syncer.sync([entry(1, 's1')]);

    const role = guild.roleByName('Surf #1');
    expect(role?.color).toBe(0xffd700);
    expect(role?.hoist).toBe(true);
  });

  it('makes no Discord calls at all when nothing changed', async () => {
    const { guild, syncer } = setup({ links: [link('u1', 's1'), link('u2', 's2')] });
    guild.addMember('u1');
    guild.addMember('u2');
    const ranking = [entry(1, 's1'), entry(2, 's2')];

    await syncer.sync(ranking);
    guild.memberFetches = 0;
    guild.createdRoleNames = [];

    await syncer.sync(ranking);

    expect(guild.memberFetches).toBe(0);
    expect(guild.createdRoleNames).toEqual([]);
  });

  it('swaps roles when ranks change', async () => {
    const { guild, syncer } = setup({ links: [link('u1', 's1'), link('u2', 's2')] });
    const m1 = guild.addMember('u1');
    const m2 = guild.addMember('u2');

    await syncer.sync([entry(1, 's1'), entry(2, 's2')]);
    await syncer.sync([entry(1, 's2'), entry(2, 's1')]);

    const first = guild.roleByName('Surf #1');
    const second = guild.roleByName('Surf #2');
    expect(m1.roleIds).toEqual([second?.id]);
    expect(m2.roleIds).toEqual([first?.id]);
    expect(m1.removed).toEqual([first?.id]);
    expect(m2.removed).toEqual([second?.id]);
    // The existing roles are reused, not recreated.
    expect(guild.createdRoleNames).toEqual(['Surf #1', 'Surf #2']);
  });

  it('gives tied players the same rank role', async () => {
    const { guild, syncer } = setup({ links: [link('u1', 's1'), link('u2', 's2')] });
    const m1 = guild.addMember('u1');
    const m2 = guild.addMember('u2');

    await syncer.sync([entry(1, 's1'), entry(1, 's2')]);

    const first = guild.roleByName('Surf #1');
    expect(m1.roleIds).toEqual([first?.id]);
    expect(m2.roleIds).toEqual([first?.id]);
  });

  it('removes the managed role when a player drops out of the role range', async () => {
    const { guild, syncer, links } = setup({ links: [link('u1', 's1')] });
    const m1 = guild.addMember('u1');

    await syncer.sync([entry(1, 's1')]);
    expect(m1.roleIds).toHaveLength(1);

    // The player unlinks while the bot is running.
    links.length = 0;
    await syncer.sync([entry(1, 's1')]);

    expect(m1.roleIds).toEqual([]);
  });

  it('never touches roles it does not manage', async () => {
    const { guild, syncer } = setup({ links: [link('u1', 's1')] });
    const admin = guild.addRole('Admin');
    const m1 = guild.addMember('u1', admin);

    await syncer.sync([entry(1, 's1')]);

    expect(m1.roleIds).toContain(admin.id);
    expect(m1.removed).toEqual([]);
  });

  it('re-colors and re-hoists an existing role to match the configuration', async () => {
    const { guild, syncer } = setup({
      config: rolesConfig({ hoist: true }),
      links: [link('u1', 's1')],
    });
    const stale = guild.addRole('Surf #1', 0x123456, false);
    guild.addMember('u1', stale);

    await syncer.sync([entry(1, 's1')]);

    expect(stale.edits).toEqual([{ color: 0xffd700, hoist: true }]);
    expect(guild.createdRoleNames).toEqual([]);
  });

  it('leaves colors alone when setColors is off', async () => {
    const { guild, syncer } = setup({
      config: rolesConfig({ setColors: false }),
      links: [link('u1', 's1')],
    });
    const stale = guild.addRole('Surf #1', 0x123456);
    guild.addMember('u1', stale);

    await syncer.sync([entry(1, 's1')]);

    expect(stale.edits).toEqual([]);
    expect(stale.color).toBe(0x123456);
  });

  it('skips linked users who are not guild members', async () => {
    const { syncer } = setup({ links: [link('u-gone', 's1')] });

    await expect(syncer.sync([entry(1, 's1')])).resolves.toBeUndefined();
  });

  it('warns exactly once while Manage Roles is missing and resumes when granted', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const { guild, syncer } = setup({ links: [link('u1', 's1')] });
    const m1 = guild.addMember('u1');
    guild.hasManageRoles = false;

    await syncer.sync([entry(1, 's1')]);
    await syncer.sync([entry(1, 's1')]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Manage Roles');
    expect(guild.createdRoleNames).toEqual([]);
    expect(m1.roleIds).toEqual([]);

    guild.hasManageRoles = true;
    await syncer.sync([entry(1, 's1')]);
    expect(m1.roleIds).toHaveLength(1);

    // A permission flap warns again.
    guild.hasManageRoles = false;
    await syncer.sync([entry(1, 's1')]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
