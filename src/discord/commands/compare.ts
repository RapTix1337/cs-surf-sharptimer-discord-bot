import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { BotRepository, SharpTimerRepository } from '../../db/index.js';
import type { MapScore, RankingEntry, ScoringConfig } from '../../scoring/index.js';
import { buildRanking, scoreMaps } from '../../scoring/index.js';
import type { Command } from '../command.js';
import {
  EMBED_COLOR,
  formatTable,
  formatTickGap,
  resolveLinkFor,
  truncate,
  userOption,
} from './helpers.js';

const MAP_WIDTH = 24;
const TOP_GAPS = 5;

interface ComparedPlayer {
  displayName: string;
  steamId64: string;
  ranking: RankingEntry | undefined;
}

interface SharedMap {
  mapName: string;
  /** Positive when player 1 is faster. */
  gapTicks: number;
}

export interface CompareCommandDependencies {
  repository: SharpTimerRepository;
  botRepository: BotRepository;
  scoringConfig: ScoringConfig;
}

export function createCompareCommand({
  repository,
  botRepository,
  scoringConfig,
}: CompareCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('compare')
      .setDescription('Compare two players head-to-head.')
      .addUserOption(userOption('user1', 'The player to compare against', true))
      .addUserOption(userOption('user2', 'The second player (default: you)')),
    async execute(interaction) {
      const user1 = interaction.options.getUser('user1', true);
      const user2 = interaction.options.getUser('user2') ?? interaction.user;
      await interaction.deferReply();

      if (user1.id === user2.id) {
        await interaction.editReply('Pick two different players to compare.');
        return;
      }

      const resolved1 = await resolveLinkFor(user1, interaction.user, botRepository);
      if (!resolved1.ok) {
        await interaction.editReply(resolved1.message);
        return;
      }
      const resolved2 = await resolveLinkFor(user2, interaction.user, botRepository);
      if (!resolved2.ok) {
        await interaction.editReply(resolved2.message);
        return;
      }

      const records = await repository.getAllRecords();
      const maps = scoreMaps(records, scoringConfig);
      const ranking = buildRanking(maps);

      const playerA = describePlayer(user1.displayName, resolved1.player.steamId64, ranking);
      const playerB = describePlayer(user2.displayName, resolved2.player.steamId64, ranking);
      const shared = collectSharedMaps(maps, playerA.steamId64, playerB.steamId64);

      const aheadA = shared.filter((map) => map.gapTicks > 0).length;
      const aheadB = shared.filter((map) => map.gapTicks < 0).length;
      const ties = shared.length - aheadA - aheadB;

      const pointsA = playerA.ranking?.points ?? 0;
      const pointsB = playerB.ranking?.points ?? 0;
      const pointsDiff = Math.round(pointsA) - Math.round(pointsB);
      const leader =
        pointsDiff === 0 ? 'dead even' : pointsDiff > 0 ? playerA.displayName : playerB.displayName;

      const embed = new EmbedBuilder()
        .setTitle(`${playerA.displayName} vs ${playerB.displayName}`)
        .setColor(EMBED_COLOR)
        .addFields(
          {
            name: 'Total points',
            value: [
              formatPointsLine(playerA),
              formatPointsLine(playerB),
              pointsDiff === 0
                ? 'Difference: dead even'
                : `Difference: ${Math.abs(pointsDiff)} in favor of ${leader}`,
            ].join('\n'),
          },
          {
            name: `Head-to-head (${shared.length} shared map(s))`,
            value:
              shared.length === 0
                ? 'No maps both players have finished.'
                : `${playerA.displayName} ahead on **${aheadA}** • ${playerB.displayName} ahead on **${aheadB}** • ties: **${ties}**`,
          },
          gapField(playerA.displayName, shared, (map) => map.gapTicks > 0),
          gapField(playerB.displayName, shared, (map) => map.gapTicks < 0),
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    },
  };
}

function describePlayer(
  displayName: string,
  steamId64: string,
  ranking: RankingEntry[],
): ComparedPlayer {
  return {
    displayName,
    steamId64,
    ranking: ranking.find((entry) => entry.steamId === steamId64),
  };
}

function formatPointsLine(player: ComparedPlayer): string {
  if (!player.ranking) {
    return `${player.displayName}: no counted records yet`;
  }
  return `${player.displayName}: **${Math.round(player.ranking.points)}** (rank #${player.ranking.rank})`;
}

function collectSharedMaps(maps: MapScore[], steamIdA: string, steamIdB: string): SharedMap[] {
  const shared: SharedMap[] = [];
  for (const map of maps) {
    const entryA = map.entries.find((entry) => entry.steamId === steamIdA);
    const entryB = map.entries.find((entry) => entry.steamId === steamIdB);
    if (!entryA || !entryB) {
      continue;
    }
    shared.push({ mapName: map.mapName, gapTicks: entryB.timerTicks - entryA.timerTicks });
  }
  return shared;
}

/** Field listing the maps this player leads by the largest margin. */
function gapField(
  winnerName: string,
  shared: SharedMap[],
  winsHere: (map: SharedMap) => boolean,
): { name: string; value: string } {
  const biggest = shared
    .filter(winsHere)
    .sort((a, b) => Math.abs(b.gapTicks) - Math.abs(a.gapTicks))
    .slice(0, TOP_GAPS);
  if (biggest.length === 0) {
    return { name: `Biggest leads — ${winnerName}`, value: '—' };
  }
  const lines = formatTable(
    [{ header: 'Map' }, { header: 'Lead', align: 'right' }],
    biggest.map((map) => [truncate(map.mapName, MAP_WIDTH), formatTickGap(Math.abs(map.gapTicks))]),
  );
  return {
    name: `Biggest leads — ${winnerName}`,
    value: `\`\`\`\n${lines.join('\n')}\n\`\`\``,
  };
}
