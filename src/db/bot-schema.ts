/**
 * Table definitions for the bot's own data. The tables live in the same
 * database as the SharpTimer tables but are owned by the bot and carry a fixed
 * `bot_` prefix so they can never collide with SharpTimer's (possibly
 * prefixed) tables. They are created by the migration runner on startup.
 */

/** Discord ↔ Steam account links. One link per Discord user. */
export interface BotSteamLinksTable {
  /** Discord user ID (snowflake, primary key). */
  discord_id: string;
  /** SteamID64 stored as a string. */
  steam_id64: string;
  /** Unix timestamp (seconds) of when the link was created or last changed. */
  linked_at: number;
}

/** Messages the bot keeps editing (e.g. the auto-updating leaderboard). */
export interface BotMessagesTable {
  /** Logical name of the message, e.g. 'leaderboard' (primary key). */
  key: string;
  channel_id: string;
  message_id: string;
}

/** Applied bot migrations, maintained by the migration runner. */
export interface BotMigrationsTable {
  name: string;
  /** Unix timestamp (seconds) of when the migration was applied. */
  run_at: number;
}

export interface BotDatabase {
  bot_steam_links: BotSteamLinksTable;
  bot_messages: BotMessagesTable;
  bot_migrations: BotMigrationsTable;
}
