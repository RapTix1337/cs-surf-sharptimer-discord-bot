import dotenv from 'dotenv';
import type { Config } from './config/index.js';
import { ConfigError, loadConfig } from './config/index.js';
import {
  BotMigrationRunner,
  BotRepository,
  createDatabase,
  SharpTimerRepository,
} from './db/index.js';
import { Bot } from './discord/bot.js';
import { createCommands } from './discord/commands/index.js';
import { logger } from './logger.js';

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      logger.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const db = createDatabase(config.database);
  const repository = new SharpTimerRepository(db, {
    tablePrefix: config.database.tablePrefix,
    style: config.records.style,
    mode: config.records.mode,
  });

  const migrationRunner = new BotMigrationRunner(db);
  const botRepository = new BotRepository(db, migrationRunner);

  // Startup smoke check — the bot stays up even if the database is not
  // reachable yet; queries are retried naturally on the next use, and the
  // bot repository re-runs pending migrations on first successful access.
  try {
    await migrationRunner.run();
    const maps = await repository.listMaps();
    const bonusCount = maps.filter((map) => map.isBonus).length;
    logger.info(
      `Database reachable: ${maps.length - bonusCount} map(s), ${bonusCount} bonus(es) with records.`,
    );
  } catch (error) {
    logger.warn('Database is not reachable yet — continuing anyway.', error);
  }

  const bot = new Bot(
    config.discord,
    createCommands({ repository, botRepository, scoringConfig: config.scoring }),
  );

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);
    void Promise.allSettled([bot.stop(), db.destroy()]).then(() => {
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await bot.start();
}

main().catch((error: unknown) => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});
