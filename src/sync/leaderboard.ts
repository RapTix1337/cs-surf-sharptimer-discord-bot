import type { Client, EmbedBuilder } from 'discord.js';
import { RESTJSONErrorCodes } from 'discord.js';
import type { MessageRef } from '../db/index.js';
import { buildListEmbed, formatTable, truncate } from '../discord/commands/helpers.js';
import { logger } from '../logger.js';
import type { RankingEntry } from '../scoring/index.js';

/** Key of the leaderboard message in the bot_messages table. */
export const LEADERBOARD_MESSAGE_KEY = 'leaderboard';

/** How many players the pinned leaderboard shows at most. */
export const LEADERBOARD_LIMIT = 25;

const NAME_WIDTH = 20;

export interface LeaderboardStats {
  mapCount: number;
  bonusCount: number;
}

/**
 * The leaderboard content without the timestamp — the unit of change
 * detection: two views with the same fingerprint render the same embed apart
 * from the "last updated" time.
 */
export interface LeaderboardView {
  title: string;
  lines: string[];
  codeBlock: boolean;
  footer: string;
}

export function buildLeaderboardView(
  ranking: RankingEntry[],
  stats: LeaderboardStats,
): LeaderboardView {
  const footer =
    `${ranking.length} ranked player(s) • ` +
    `${stats.mapCount} map(s), ${stats.bonusCount} bonus(es) • Last updated`;

  if (ranking.length === 0) {
    return {
      title: 'Overall Ranking',
      lines: ['No records found yet — go set some times!'],
      codeBlock: false,
      footer,
    };
  }

  const lines = formatTable(
    [
      { header: '', align: 'right' },
      { header: 'Player' },
      { header: 'Points', align: 'right' },
      { header: '#1s', align: 'right' },
      { header: 'Done', align: 'right' },
    ],
    ranking
      .slice(0, LEADERBOARD_LIMIT)
      .map((entry) => [
        `#${entry.rank}`,
        truncate(entry.playerName, NAME_WIDTH),
        `${Math.round(entry.points)}`,
        `${entry.firstPlaces}`,
        `${Math.round(entry.completionRate * 100)}%`,
      ]),
  );

  return { title: 'Overall Ranking', lines, codeBlock: true, footer };
}

export function leaderboardFingerprint(view: LeaderboardView): string {
  return JSON.stringify(view);
}

/** Renders the view as an embed; the embed timestamp is the "last updated" time. */
export function buildLeaderboardEmbed(view: LeaderboardView): EmbedBuilder {
  return buildListEmbed({
    title: view.title,
    lines: view.lines,
    codeBlock: view.codeBlock,
    footer: view.footer,
  });
}

/** The slice of a Discord message the updater needs; satisfied by Message. */
export interface LeaderboardMessage {
  id: string;
  edit(options: { embeds: EmbedBuilder[] }): Promise<unknown>;
}

/** The slice of a Discord channel the updater needs; satisfied by TextChannel. */
export interface LeaderboardChannel {
  id: string;
  messages: {
    fetch(options: { message: string; force: boolean }): Promise<LeaderboardMessage>;
  };
  send(options: { embeds: EmbedBuilder[] }): Promise<LeaderboardMessage>;
}

/** The slice of the BotRepository the updater needs. */
export interface MessageRefStore {
  getMessageRef(key: string): Promise<MessageRef | null>;
  upsertMessageRef(key: string, ref: MessageRef): Promise<void>;
}

function isUnknownMessageError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === RESTJSONErrorCodes.UnknownMessage
  );
}

/**
 * Keeps the single leaderboard message in the configured channel up to date.
 * The message reference is persisted in bot_messages so the message survives
 * restarts; when it is missing or was deleted a new one is created. Edits only
 * happen when the content (ignoring the timestamp) actually changed.
 */
export class LeaderboardUpdater {
  private lastFingerprint: string | null = null;

  constructor(
    private readonly store: MessageRefStore,
    private readonly fetchChannel: () => Promise<LeaderboardChannel>,
  ) {}

  async update(ranking: RankingEntry[], stats: LeaderboardStats): Promise<void> {
    const view = buildLeaderboardView(ranking, stats);
    const fingerprint = leaderboardFingerprint(view);

    const channel = await this.fetchChannel();
    // The message is looked up every run (not only when the content changed)
    // so a deleted message is recreated promptly instead of on the next
    // content change.
    const message = await this.findExistingMessage(channel);

    if (!message) {
      const created = await channel.send({ embeds: [buildLeaderboardEmbed(view)] });
      await this.store.upsertMessageRef(LEADERBOARD_MESSAGE_KEY, {
        channelId: channel.id,
        messageId: created.id,
      });
      this.lastFingerprint = fingerprint;
      logger.info(`Created the leaderboard message in channel ${channel.id}.`);
      return;
    }

    // After a restart the fingerprint is unknown, so the first run always
    // refreshes the message.
    if (fingerprint === this.lastFingerprint) {
      return;
    }
    await message.edit({ embeds: [buildLeaderboardEmbed(view)] });
    this.lastFingerprint = fingerprint;
    logger.info('Updated the leaderboard message.');
  }

  private async findExistingMessage(
    channel: LeaderboardChannel,
  ): Promise<LeaderboardMessage | null> {
    const ref = await this.store.getMessageRef(LEADERBOARD_MESSAGE_KEY);
    if (!ref || ref.channelId !== channel.id) {
      return null;
    }
    try {
      return await channel.messages.fetch({ message: ref.messageId, force: true });
    } catch (error) {
      if (isUnknownMessageError(error)) {
        logger.warn('The leaderboard message was deleted — creating a new one.');
        return null;
      }
      throw error;
    }
  }
}

/**
 * Resolves the configured leaderboard channel via the Discord client. Fails
 * (and thereby skips the scheduler run) when the channel does not exist or is
 * not a guild text channel.
 */
export function createLeaderboardChannelFetcher(
  client: Client,
  channelId: string,
): () => Promise<LeaderboardChannel> {
  return async () => {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error(`Leaderboard channel ${channelId} is not a guild text channel.`);
    }
    return channel;
  };
}
