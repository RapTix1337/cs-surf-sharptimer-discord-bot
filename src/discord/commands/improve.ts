import { SlashCommandBuilder } from 'discord.js';
import type { BotRepository, SharpTimerRepository } from '../../db/index.js';
import type { ScoringConfig } from '../../scoring/index.js';
import { computeMapPotentials, scoreMaps } from '../../scoring/index.js';
import type { Command } from '../command.js';
import {
  buildListEmbed,
  formatTable,
  formatTickGap,
  getLimit,
  limitOption,
  resolveLinkedUser,
  truncate,
  userOption,
} from './helpers.js';

const MAP_WIDTH = 28;

export interface ImproveCommandDependencies {
  repository: SharpTimerRepository;
  botRepository: BotRepository;
  scoringConfig: ScoringConfig;
}

export function createImproveCommand({
  repository,
  botRepository,
  scoringConfig,
}: ImproveCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('improve')
      .setDescription('Show finished maps without a #1 spot, sorted by points potential.')
      .addIntegerOption(limitOption)
      .addUserOption(userOption('user', 'Whose maps to show (default: yours)')),
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
      const potentialByMap = new Map(
        computeMapPotentials(maps, steamId64, scoringConfig).map((potential) => [
          potential.mapName,
          potential.potential,
        ]),
      );

      const improvable: {
        mapName: string;
        rank: number;
        finisherCount: number;
        gapTicks: number;
        potential: number;
      }[] = [];
      let finishedCount = 0;
      for (const map of maps) {
        const entry = map.entries.find((candidate) => candidate.steamId === steamId64);
        if (!entry) {
          continue;
        }
        finishedCount += 1;
        const first = map.entries[0];
        if (entry.rank === 1 || first === undefined) {
          continue;
        }
        improvable.push({
          mapName: map.mapName,
          rank: entry.rank,
          finisherCount: map.finisherCount,
          gapTicks: entry.timerTicks - first.timerTicks,
          potential: potentialByMap.get(map.mapName) ?? 0,
        });
      }

      if (finishedCount === 0) {
        await interaction.editReply(
          isSelf
            ? 'You have no finished maps yet — finish one and come back!'
            : `${user.displayName} has no finished maps yet.`,
        );
        return;
      }
      if (improvable.length === 0) {
        await interaction.editReply(
          isSelf
            ? 'You hold #1 on every map you have finished — nothing to improve!'
            : `${user.displayName} holds #1 on every finished map — nothing to improve!`,
        );
        return;
      }

      const shown = improvable.sort((a, b) => b.potential - a.potential).slice(0, limit);
      const lines = formatTable(
        [
          { header: 'Map' },
          { header: 'Rank', align: 'right' },
          { header: 'Behind #1', align: 'right' },
          { header: 'Potential', align: 'right' },
        ],
        shown.map((row) => [
          truncate(row.mapName, MAP_WIDTH),
          `#${row.rank}/${row.finisherCount}`,
          formatTickGap(row.gapTicks),
          `+${Math.round(row.potential)}`,
        ]),
      );

      const embed = buildListEmbed({
        title: `Room to Improve — ${user.displayName}`,
        lines,
        footer: `${improvable.length} finished map(s) without #1 • potential = extra points for taking #1`,
      });
      await interaction.editReply({ embeds: [embed] });
    },
  };
}
