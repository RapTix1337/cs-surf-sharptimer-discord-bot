import { describe, expect, it, vi } from 'vitest';
import type { RankingEntry } from '../scoring/index.js';
import type { LeaderboardChannel, LeaderboardMessage, MessageRefStore } from './leaderboard.js';
import {
  buildLeaderboardEmbed,
  buildLeaderboardView,
  LEADERBOARD_LIMIT,
  LEADERBOARD_MESSAGE_KEY,
  leaderboardFingerprint,
  LeaderboardUpdater,
} from './leaderboard.js';

function entry(overrides: Partial<RankingEntry> & { rank: number }): RankingEntry {
  return {
    steamId: `7656119000000000${overrides.rank}`,
    playerName: `player${overrides.rank}`,
    points: 100,
    firstPlaces: 0,
    mapsFinished: 4,
    totalMaps: 5,
    completionRate: 0.8,
    ...overrides,
  };
}

const STATS = { mapCount: 4, bonusCount: 1 };

describe('buildLeaderboardView', () => {
  it('renders rank, name, rounded points, first places and completion rate', () => {
    const view = buildLeaderboardView(
      [
        entry({ rank: 1, playerName: 'alice', points: 123.4, firstPlaces: 3 }),
        entry({ rank: 2, playerName: 'bob', points: 99.6, completionRate: 0.5 }),
      ],
      STATS,
    );

    expect(view.codeBlock).toBe(true);
    expect(view.lines[0]).toContain('Player');
    expect(view.lines[1]).toContain('#1');
    expect(view.lines[1]).toContain('alice');
    expect(view.lines[1]).toContain('123');
    expect(view.lines[1]).toContain('3');
    expect(view.lines[1]).toContain('80%');
    expect(view.lines[2]).toContain('#2');
    expect(view.lines[2]).toContain('bob');
    expect(view.lines[2]).toContain('100');
    expect(view.lines[2]).toContain('50%');
    expect(view.footer).toBe('2 ranked player(s) • 4 map(s), 1 bonus(es) • Last updated');
  });

  it('caps the table at the leaderboard limit', () => {
    const ranking = Array.from({ length: LEADERBOARD_LIMIT + 10 }, (_, i) =>
      entry({ rank: i + 1, points: 1000 - i }),
    );
    const view = buildLeaderboardView(ranking, STATS);
    // Header plus one line per shown player.
    expect(view.lines).toHaveLength(LEADERBOARD_LIMIT + 1);
    expect(view.footer).toContain(`${ranking.length} ranked player(s)`);
  });

  it('renders a friendly message when there are no records', () => {
    const view = buildLeaderboardView([], { mapCount: 0, bonusCount: 0 });
    expect(view.codeBlock).toBe(false);
    expect(view.lines).toEqual(['No records found yet — go set some times!']);
    expect(view.footer).toContain('0 ranked player(s)');
  });
});

describe('leaderboardFingerprint', () => {
  it('is stable for identical content', () => {
    const ranking = [entry({ rank: 1 }), entry({ rank: 2, playerName: 'bob' })];
    const a = leaderboardFingerprint(buildLeaderboardView(ranking, STATS));
    const b = leaderboardFingerprint(buildLeaderboardView([...ranking], { ...STATS }));
    expect(a).toBe(b);
  });

  it('changes when the ranking changes', () => {
    const a = leaderboardFingerprint(buildLeaderboardView([entry({ rank: 1 })], STATS));
    const b = leaderboardFingerprint(
      buildLeaderboardView([entry({ rank: 1, points: 101 })], STATS),
    );
    expect(a).not.toBe(b);
  });

  it('changes when the map counts change', () => {
    const ranking = [entry({ rank: 1 })];
    const a = leaderboardFingerprint(buildLeaderboardView(ranking, STATS));
    const b = leaderboardFingerprint(buildLeaderboardView(ranking, { ...STATS, mapCount: 5 }));
    expect(a).not.toBe(b);
  });
});

describe('buildLeaderboardEmbed', () => {
  it('renders the view as a code-block embed with footer and timestamp', () => {
    const view = buildLeaderboardView([entry({ rank: 1, playerName: 'alice' })], STATS);
    const embed = buildLeaderboardEmbed(view).toJSON();
    expect(embed.title).toBe('Overall Ranking');
    expect(embed.description).toContain('```');
    expect(embed.description).toContain('alice');
    expect(embed.footer?.text).toBe(view.footer);
    expect(embed.timestamp).toBeDefined();
  });

  it('does not include the timestamp in the fingerprint', () => {
    const view = buildLeaderboardView([entry({ rank: 1 })], STATS);
    const before = leaderboardFingerprint(view);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
      expect(leaderboardFingerprint(buildLeaderboardView([entry({ rank: 1 })], STATS))).toBe(
        before,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

interface Mocks {
  store: MessageRefStore & { refs: Map<string, { channelId: string; messageId: string }> };
  channel: LeaderboardChannel & {
    fetchMock: ReturnType<typeof vi.fn>;
    sendMock: ReturnType<typeof vi.fn>;
  };
  message: LeaderboardMessage & { editMock: ReturnType<typeof vi.fn> };
  updater: LeaderboardUpdater;
}

function createMocks(): Mocks {
  const refs = new Map<string, { channelId: string; messageId: string }>();
  const store = {
    refs,
    getMessageRef: vi.fn(async (key: string) => refs.get(key) ?? null),
    upsertMessageRef: vi.fn(async (key: string, ref: { channelId: string; messageId: string }) => {
      refs.set(key, ref);
    }),
  };

  const editMock = vi.fn(async () => undefined);
  const message = { id: 'message-1', edit: editMock, editMock };

  const fetchMock = vi.fn(async () => message);
  const sendMock = vi.fn(async () => message);
  const channel = {
    id: 'channel-1',
    messages: { fetch: fetchMock },
    send: sendMock,
    fetchMock,
    sendMock,
  };

  const updater = new LeaderboardUpdater(store, async () => channel);
  return { store, channel, message, updater };
}

const RANKING = [entry({ rank: 1, playerName: 'alice', points: 123 })];

describe('LeaderboardUpdater', () => {
  it('creates the message and persists the reference when none is stored', async () => {
    const { updater, channel, store } = createMocks();

    await updater.update(RANKING, STATS);

    expect(channel.sendMock).toHaveBeenCalledTimes(1);
    expect(store.refs.get(LEADERBOARD_MESSAGE_KEY)).toEqual({
      channelId: 'channel-1',
      messageId: 'message-1',
    });
  });

  it('creates a new message when the stored reference points to another channel', async () => {
    const { updater, channel, store } = createMocks();
    store.refs.set(LEADERBOARD_MESSAGE_KEY, { channelId: 'old-channel', messageId: 'old' });

    await updater.update(RANKING, STATS);

    expect(channel.fetchMock).not.toHaveBeenCalled();
    expect(channel.sendMock).toHaveBeenCalledTimes(1);
    expect(store.refs.get(LEADERBOARD_MESSAGE_KEY)?.channelId).toBe('channel-1');
  });

  it('edits the existing message on the first run after a start', async () => {
    const { updater, channel, message, store } = createMocks();
    store.refs.set(LEADERBOARD_MESSAGE_KEY, { channelId: 'channel-1', messageId: 'message-1' });

    await updater.update(RANKING, STATS);

    expect(channel.sendMock).not.toHaveBeenCalled();
    expect(message.editMock).toHaveBeenCalledTimes(1);
  });

  it('skips the edit when the content did not change', async () => {
    const { updater, message } = createMocks();

    await updater.update(RANKING, STATS);
    await updater.update(RANKING, STATS);
    await updater.update([...RANKING], { ...STATS });

    expect(message.editMock).not.toHaveBeenCalled();
  });

  it('edits when the content changed', async () => {
    const { updater, message } = createMocks();

    await updater.update(RANKING, STATS);
    await updater.update([entry({ rank: 1, playerName: 'alice', points: 200 })], STATS);

    expect(message.editMock).toHaveBeenCalledTimes(1);
    const [options] = message.editMock.mock.calls[0] as [{ embeds: { toJSON(): unknown }[] }];
    expect(JSON.stringify(options.embeds[0]?.toJSON())).toContain('200');
  });

  it('recreates a deleted message even when the content did not change', async () => {
    const { updater, channel, store } = createMocks();

    await updater.update(RANKING, STATS);
    channel.fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('Unknown Message'), { code: 10008 }),
    );
    channel.sendMock.mockResolvedValueOnce({ id: 'message-2', edit: vi.fn() });

    await updater.update(RANKING, STATS);

    expect(channel.sendMock).toHaveBeenCalledTimes(2);
    expect(store.refs.get(LEADERBOARD_MESSAGE_KEY)?.messageId).toBe('message-2');
  });

  it('propagates unexpected fetch errors', async () => {
    const { updater, channel } = createMocks();

    await updater.update(RANKING, STATS);
    channel.fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('Missing Access'), { code: 50001 }),
    );

    await expect(updater.update(RANKING, STATS)).rejects.toThrow('Missing Access');
    expect(channel.sendMock).toHaveBeenCalledTimes(1);
  });

  it('retries a failed edit on the next run', async () => {
    const { updater, message } = createMocks();
    const changed = [entry({ rank: 1, playerName: 'alice', points: 200 })];

    await updater.update(RANKING, STATS);
    message.editMock.mockRejectedValueOnce(new Error('Discord hiccup'));
    await expect(updater.update(changed, STATS)).rejects.toThrow('Discord hiccup');

    await updater.update(changed, STATS);
    expect(message.editMock).toHaveBeenCalledTimes(2);
  });
});
