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
import { buildRanking, scoreMaps } from './scoring/index.js';
import {
  createGuildFetcher,
  createLeaderboardChannelFetcher,
  LeaderboardUpdater,
  RoleSyncer,
  Scheduler,
} from './sync/index.js';

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

  const leaderboard = new LeaderboardUpdater(
    botRepository,
    createLeaderboardChannelFetcher(bot.discordClient, config.discord.leaderboardChannelId),
  );
  // A template without the placeholder gives every ranked player the same role
  // name. The usual cause is an unquoted ROLES_NAME_TEMPLATE in .env, where the
  // # of "Surf #{rank}" starts a comment and truncates the value to "Surf".
  if (config.roles.enabled && !config.roles.nameTemplate.includes('{rank}')) {
    logger.warn(
      `ROLES_NAME_TEMPLATE is "${config.roles.nameTemplate}" and has no {rank} placeholder, ` +
        'so every ranked player gets the same role. If your .env reads ' +
        'ROLES_NAME_TEMPLATE=Surf #{rank}, quote it as "Surf #{rank}".',
    );
  }

  const roleSyncer = config.roles.enabled
    ? new RoleSyncer(
        botRepository,
        createGuildFetcher(bot.discordClient, config.discord.guildId),
        config.roles,
      )
    : null;
  const scheduler = new Scheduler(
    async () => {
      const records = await repository.getAllRecords();
      const maps = scoreMaps(records, config.scoring);
      const ranking = buildRanking(maps);
      const bonusCount = maps.filter((map) => map.isBonus).length;
      // A leaderboard hiccup (e.g. a misconfigured channel) must not block
      // the role sync, so the two halves of the tick fail independently.
      try {
        await leaderboard.update(ranking, { mapCount: maps.length - bonusCount, bonusCount });
      } catch (error) {
        logger.error('Leaderboard update failed — skipping it this run.', error);
      }
      if (roleSyncer) {
        await roleSyncer.sync(ranking);
      }
    },
    { intervalSeconds: config.sync.intervalSeconds, name: 'Sync' },
  );

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);
    void (async () => {
      await scheduler.stop();
      await Promise.allSettled([bot.stop(), db.destroy()]);
      process.exit(0);
    })();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await bot.start();
  scheduler.start();
}

main().catch((error: unknown) => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});
