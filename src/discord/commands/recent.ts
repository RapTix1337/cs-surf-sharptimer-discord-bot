import { escapeMarkdown, SlashCommandBuilder } from 'discord.js';
import type { SharpTimerRepository } from '../../db/index.js';
import type { Command } from '../command.js';
import { buildListEmbed, formatTicks, getLimit, limitOption } from './helpers.js';

export interface RecentCommandDependencies {
  repository: SharpTimerRepository;
}

export function createRecentCommand({ repository }: RecentCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('recent')
      .setDescription('Show the newest personal-best improvements server-wide.')
      .addIntegerOption(limitOption),
    async execute(interaction) {
      const limit = getLimit(interaction);
      await interaction.deferReply();

      const records = await repository.getRecentRecords(limit);
      if (records.length === 0) {
        await interaction.editReply('No records found yet — go set some times!');
        return;
      }

      const lines = records.map((record) => {
        const when = record.lastFinished > 0 ? ` — <t:${record.lastFinished}:R>` : '';
        return `\`${record.mapName}\` — ${escapeMarkdown(record.playerName)} — \`${formatTicks(record.timerTicks)}\`${when}`;
      });

      const embed = buildListEmbed({
        title: 'Recent PBs',
        lines,
        codeBlock: false,
        footer:
          'SharpTimer stores personal bests only, so this lists PB improvements, not all runs.',
      });
      await interaction.editReply({ embeds: [embed] });
    },
  };
}
