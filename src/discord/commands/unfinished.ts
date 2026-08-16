import { SlashCommandBuilder } from 'discord.js';
import type { BotRepository, SharpTimerRepository } from '../../db/index.js';
import type { ScoringConfig } from '../../scoring/index.js';
import { computeMapPotentials, scoreMaps } from '../../scoring/index.js';
import type { Command } from '../command.js';
import {
  buildListEmbed,
  formatTable,
  getLimit,
  limitOption,
  resolveLinkedUser,
  truncate,
  userOption,
} from './helpers.js';

const MAP_WIDTH = 32;

export interface UnfinishedCommandDependencies {
  repository: SharpTimerRepository;
  botRepository: BotRepository;
  scoringConfig: ScoringConfig;
}

export function createUnfinishedCommand({
  repository,
  botRepository,
  scoringConfig,
}: UnfinishedCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('unfinished')
      .setDescription('Show unfinished maps and bonuses, sorted by points potential.')
      .addIntegerOption(limitOption)
      .addUserOption(userOption('user', 'Whose unfinished maps to show (default: yours)')),
    async execute(interaction) {
      const limit = getLimit(interaction);
      await interaction.deferReply();

      const resolved = await resolveLinkedUser(interaction, botRepository);
      if (!resolved.ok) {
        await interaction.editReply(resolved.message);
        return;
      }
      const { user, isSelf, steamId64 } = resolved.player;

      const records = await repository.getAllRecords();
      const maps = scoreMaps(records, scoringConfig);
      if (maps.length === 0) {
        await interaction.editReply('No records in the database yet.');
        return;
      }

      const unfinished = computeMapPotentials(maps, steamId64, scoringConfig)
        .filter((potential) => !potential.finished)
        .sort((a, b) => b.potential - a.potential);
      if (unfinished.length === 0) {
        await interaction.editReply(
          isSelf
            ? 'You have finished every map and bonus — nothing left to do!'
            : `${user.displayName} has finished every map and bonus — nothing left to do!`,
        );
        return;
      }

      const shown = unfinished.slice(0, limit);
      const lines = formatTable(
        [{ header: 'Map' }, { header: 'Potential', align: 'right' }],
        shown.map((potential) => [
          truncate(potential.mapName, MAP_WIDTH),
          `+${Math.round(potential.potential)}`,
        ]),
      );

      const embed = buildListEmbed({
        title: `Unfinished Maps — ${user.displayName}`,
        lines,
        footer: `${unfinished.length} unfinished of ${maps.length} map(s) & bonus(es) • potential = points for taking #1`,
      });
      await interaction.editReply({ embeds: [embed] });
    },
  };
}
