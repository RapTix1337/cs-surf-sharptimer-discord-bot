import { SlashCommandBuilder } from 'discord.js';
import type { SharpTimerRepository } from '../../db/index.js';
import type { ScoringConfig } from '../../scoring/index.js';
import { buildRanking, scoreMaps } from '../../scoring/index.js';
import type { Command } from '../command.js';
import { buildListEmbed, formatTable, getLimit, limitOption, truncate } from './helpers.js';

const NAME_WIDTH = 20;

export interface TopCommandDependencies {
  repository: SharpTimerRepository;
  scoringConfig: ScoringConfig;
}

export function createTopCommand({ repository, scoringConfig }: TopCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('top')
      .setDescription('Show the overall points ranking.')
      .addIntegerOption(limitOption),
    async execute(interaction) {
      const limit = getLimit(interaction);
      await interaction.deferReply();

      const records = await repository.getAllRecords();
      const maps = scoreMaps(records, scoringConfig);
      const ranking = buildRanking(maps);

      if (ranking.length === 0) {
        await interaction.editReply('No records found yet — go set some times!');
        return;
      }

      const shown = ranking.slice(0, limit);
      const mainMaps = maps.filter((map) => !map.isBonus).length;
      const bonuses = maps.length - mainMaps;

      const lines = formatTable(
        [
          { header: '', align: 'right' },
          { header: 'Player' },
          { header: 'Points', align: 'right' },
          { header: '#1s', align: 'right' },
          { header: 'Done', align: 'right' },
        ],
        shown.map((entry) => [
          `#${entry.rank}`,
          truncate(entry.playerName, NAME_WIDTH),
          `${Math.round(entry.points)}`,
          `${entry.firstPlaces}`,
          `${Math.round(entry.completionRate * 100)}%`,
        ]),
      );

      const embed = buildListEmbed({
        title: 'Overall Ranking',
        lines,
        footer: `${ranking.length} ranked player(s) • ${mainMaps} map(s), ${bonuses} bonus(es)`,
      });
      await interaction.editReply({ embeds: [embed] });
    },
  };
}
