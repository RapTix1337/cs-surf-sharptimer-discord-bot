import type { Kysely } from 'kysely';
import { logger } from '../logger.js';
import type { Database } from './database.js';

/**
 * A single schema migration for the bot's own tables. Migrations are written
 * with Kysely's schema builder so they work on every supported dialect.
 */
export interface BotMigration {
  /** Unique, stable name — recorded in bot_migrations once applied. */
  name: string;
  up(db: Kysely<Database>): Promise<void>;
}

/** All bot migrations in the order they must run. Append only, never edit. */
const MIGRATIONS: BotMigration[] = [
  {
    name: '001_create_bot_steam_links',
    async up(db) {
      await db.schema
        .createTable('bot_steam_links')
        .addColumn('discord_id', 'varchar(20)', (col) => col.primaryKey())
        .addColumn('steam_id64', 'varchar(20)', (col) => col.notNull())
        .addColumn('linked_at', 'integer', (col) => col.notNull())
        .execute();
    },
  },
  {
    name: '002_create_bot_messages',
    async up(db) {
      await db.schema
        .createTable('bot_messages')
        .addColumn('key', 'varchar(64)', (col) => col.primaryKey())
        .addColumn('channel_id', 'varchar(20)', (col) => col.notNull())
        .addColumn('message_id', 'varchar(20)', (col) => col.notNull())
        .execute();
    },
  },
];

/**
 * Creates the bot's tables on first start and applies any migrations that are
 * still pending. `run()` is attempted at startup, but the runner is also
 * invoked lazily by the bot repository so a database that was unreachable at
 * startup gets migrated on first use instead of requiring a restart. Repeated
 * calls after a successful run are no-ops.
 */
export class BotMigrationRunner {
  private completed = false;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly migrations: BotMigration[] = MIGRATIONS,
  ) {}

  async run(): Promise<void> {
    if (this.completed) {
      return;
    }

    await this.db.schema
      .createTable('bot_migrations')
      .ifNotExists()
      .addColumn('name', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('run_at', 'integer', (col) => col.notNull())
      .execute();

    const rows = await this.db.selectFrom('bot_migrations').select('name').execute();
    const applied = new Set(rows.map((row) => row.name));

    for (const migration of this.migrations) {
      if (applied.has(migration.name)) {
        continue;
      }
      await migration.up(this.db);
      await this.db
        .insertInto('bot_migrations')
        .values({ name: migration.name, run_at: Math.floor(Date.now() / 1000) })
        .execute();
      logger.info(`Applied bot migration ${migration.name}`);
    }

    this.completed = true;
  }
}
