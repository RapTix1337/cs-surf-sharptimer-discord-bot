import { Kysely } from 'kysely';
import type { Config } from '../config/index.js';
import { createDialect } from './dialect.js';
import type { SharpTimerDatabase } from './schema.js';

export function createDatabase(config: Config['database']): Kysely<SharpTimerDatabase> {
  return new Kysely<SharpTimerDatabase>({ dialect: createDialect(config) });
}
