import type { Dialect } from 'kysely';
import { MysqlDialect, PostgresDialect } from 'kysely';
import { createPool } from 'mysql2';
import pg from 'pg';
import type { Config } from '../config/index.js';
import { logger } from '../logger.js';

type DatabaseConfig = Config['database'];

export function createDialect(config: DatabaseConfig): Dialect {
  switch (config.dialect) {
    case 'postgres':
      return new PostgresDialect({
        pool: new pg.Pool({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
          password: config.password,
          max: 5,
        }),
      });
    case 'mysql':
      logger.warn(
        'MySQL support is experimental and not fully tested yet — PostgreSQL is recommended.',
      );
      return new MysqlDialect({
        pool: createPool({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
          password: config.password,
          connectionLimit: 5,
        }),
      });
  }
}
