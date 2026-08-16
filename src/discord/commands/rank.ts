import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { BotRepository, SharpTimerRepository } from '../../db/index.js';
import type { ScoringConfig } from '../../scoring/index.js';
import { buildRanking, scoreMaps } from '../../scoring/index.js';
import type { Command } from '../command.js';

const EMBED_COLOR = 0xf1c40f;

export interface RankCommandDependencies {
  repository: SharpTimerRepository;
  botRepository: BotRepository;
  scoringConfig: ScoringConfig;
}

export function createRankCommand({
  repository,
  botRepository,
  scoringConfig,
}: RankCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription('Show a player’s global rank, points and completion.')
      .addUserOption((option) =>
        option.setName('user').setDescription('Whose rank to show (default: yours)'),
      ),
    async execute(interaction) {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const isSelf = target.id === interaction.user.id;
      await interaction.deferReply();

      const link = await botRepository.getSteamLink(target.id);
      if (!link) {
        await interaction.editReply(
          isSelf
            ? 'You have not linked a Steam account yet. Use /link to connect one.'
            : `${target.displayName} has not linked a Steam account yet — they can use /link to connect one.`,
        );
        return;
      }

      const records = await repository.getAllRecords();
      const ranking = buildRanking(scoreMaps(records, scoringConfig));
      const entry = ranking.find((candidate) => candidate.steamId === link.steamId64);
      if (!entry) {
        await interaction.editReply(
          isSelf
            ? 'You have no counted records yet — finish a map to enter the ranking!'
            : `${target.displayName} has no counted records yet.`,
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(entry.playerName)
        .setColor(EMBED_COLOR)
        .addFields(
          { name: 'Rank', value: `#${entry.rank} of ${ranking.length}`, inline: true },
          { name: 'Points', value: `${Math.round(entry.points)}`, inline: true },
          { name: 'First places', value: `${entry.firstPlaces}`, inline: true },
          {
            name: 'Completion',
            value: `${Math.round(entry.completionRate * 100)}% (${entry.mapsFinished}/${entry.totalMaps} maps & bonuses)`,
            inline: true,
          },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    },
  };
}
