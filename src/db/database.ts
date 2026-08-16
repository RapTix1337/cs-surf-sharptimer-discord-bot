import { Kysely } from 'kysely';
import type { Config } from '../config/index.js';
import type { BotDatabase } from './bot-schema.js';
import { createDialect } from './dialect.js';
import type { SharpTimerDatabase } from './schema.js';

/**
 * Everything reachable through the single database connection: SharpTimer's
 * tables (read-only) plus the bot's own `bot_`-prefixed tables.
 */
export type Database = SharpTimerDatabase & BotDatabase;

export function createDatabase(config: Config['database']): Kysely<Database> {
  return new Kysely<Database>({ dialect: createDialect(config) });
}
