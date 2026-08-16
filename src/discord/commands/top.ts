import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { SharpTimerRepository } from '../../db/index.js';
import type { RankingEntry, ScoringConfig } from '../../scoring/index.js';
import { buildRanking, scoreMaps } from '../../scoring/index.js';
import type { Command } from '../command.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const NAME_WIDTH = 20;
const EMBED_COLOR = 0xf1c40f;

export interface TopCommandDependencies {
  repository: SharpTimerRepository;
  scoringConfig: ScoringConfig;
}

export function createTopCommand({ repository, scoringConfig }: TopCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('top')
      .setDescription('Show the overall points ranking.')
      .addIntegerOption((option) =>
        option
          .setName('limit')
          .setDescription(`Number of players to show (default ${DEFAULT_LIMIT})`)
          .setMinValue(1)
          .setMaxValue(MAX_LIMIT),
      ),
    async execute(interaction) {
      const limit = interaction.options.getInteger('limit') ?? DEFAULT_LIMIT;
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

      const embed = new EmbedBuilder()
        .setTitle('Overall Ranking')
        .setColor(EMBED_COLOR)
        .setDescription(['```', ...formatRankingTable(shown), '```'].join('\n'))
        .setFooter({
          text: `${ranking.length} ranked player(s) • ${mainMaps} map(s), ${bonuses} bonus(es)`,
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    },
  };
}

function formatRankingTable(entries: RankingEntry[]): string[] {
  const rows = entries.map((entry) => ({
    rank: `#${entry.rank}`,
    name: truncate(entry.playerName, NAME_WIDTH),
    points: `${Math.round(entry.points)}`,
    firstPlaces: `${entry.firstPlaces}`,
    completion: `${Math.round(entry.completionRate * 100)}%`,
  }));

  const rankWidth = width(rows, (row) => row.rank, 2);
  const nameWidth = width(rows, (row) => row.name, 6);
  const pointsWidth = width(rows, (row) => row.points, 6);
  const firstWidth = width(rows, (row) => row.firstPlaces, 3);
  const doneWidth = width(rows, (row) => row.completion, 4);

  const header = [
    ''.padStart(rankWidth),
    'Player'.padEnd(nameWidth),
    'Points'.padStart(pointsWidth),
    '#1s'.padStart(firstWidth),
    'Done'.padStart(doneWidth),
  ].join('  ');

  const lines = rows.map((row) =>
    [
      row.rank.padStart(rankWidth),
      row.name.padEnd(nameWidth),
      row.points.padStart(pointsWidth),
      row.firstPlaces.padStart(firstWidth),
      row.completion.padStart(doneWidth),
    ].join('  '),
  );

  return [header, ...lines];
}

function width<T>(rows: T[], select: (row: T) => string, min: number): number {
  return Math.max(min, ...rows.map((row) => select(row).length));
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
