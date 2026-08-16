import type { Kysely } from 'kysely';
import type { BotMigrationRunner } from './bot-migrations.js';
import type { Database } from './database.js';

export interface SteamLink {
  discordId: string;
  steamId64: string;
  /** Unix timestamp (seconds). */
  linkedAt: number;
}

export interface MessageRef {
  channelId: string;
  messageId: string;
}

/**
 * Read/write access to the bot's own tables. Every method first makes sure the
 * migrations have run, so the tables exist even when the database was down
 * while the bot started.
 */
export class BotRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly migrations: BotMigrationRunner,
  ) {}

  async getSteamLink(discordId: string): Promise<SteamLink | null> {
    await this.migrations.run();
    const row = await this.db
      .selectFrom('bot_steam_links')
      .selectAll()
      .where('discord_id', '=', discordId)
      .executeTakeFirst();
    if (!row) {
      return null;
    }
    return { discordId: row.discord_id, steamId64: row.steam_id64, linkedAt: row.linked_at };
  }

  /**
   * Creates or replaces the user's link. Returns the SteamID64 the user was
   * linked to before, or null if this is a new link.
   */
  async upsertSteamLink(discordId: string, steamId64: string): Promise<string | null> {
    await this.migrations.run();
    const linkedAt = Math.floor(Date.now() / 1000);
    // Select-then-update/insert instead of a native upsert: the syntax for
    // upserts differs between the supported dialects, and the bot is the only
    // writer of this table.
    return await this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('bot_steam_links')
        .select('steam_id64')
        .where('discord_id', '=', discordId)
        .executeTakeFirst();
      if (existing) {
        await trx
          .updateTable('bot_steam_links')
          .set({ steam_id64: steamId64, linked_at: linkedAt })
          .where('discord_id', '=', discordId)
          .execute();
        return existing.steam_id64;
      }
      await trx
        .insertInto('bot_steam_links')
        .values({ discord_id: discordId, steam_id64: steamId64, linked_at: linkedAt })
        .execute();
      return null;
    });
  }

  /** Removes the user's link. Returns false if there was nothing to remove. */
  async deleteSteamLink(discordId: string): Promise<boolean> {
    await this.migrations.run();
    const result = await this.db
      .deleteFrom('bot_steam_links')
      .where('discord_id', '=', discordId)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async getMessageRef(key: string): Promise<MessageRef | null> {
    await this.migrations.run();
    const row = await this.db
      .selectFrom('bot_messages')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst();
    return row ? { channelId: row.channel_id, messageId: row.message_id } : null;
  }

  async upsertMessageRef(key: string, ref: MessageRef): Promise<void> {
    await this.migrations.run();
    await this.db.transaction().execute(async (trx) => {
      const updated = await trx
        .updateTable('bot_messages')
        .set({ channel_id: ref.channelId, message_id: ref.messageId })
        .where('key', '=', key)
        .executeTakeFirst();
      if (updated.numUpdatedRows === 0n) {
        await trx
          .insertInto('bot_messages')
          .values({ key, channel_id: ref.channelId, message_id: ref.messageId })
          .execute();
      }
    });
  }
}
