import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { BotRepository } from '../../db/index.js';
import type { Command } from '../command.js';

export interface UnlinkCommandDependencies {
  botRepository: BotRepository;
}

export function createUnlinkCommand({ botRepository }: UnlinkCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('unlink')
      .setDescription('Remove the link between your Discord and Steam accounts.'),
    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const removed = await botRepository.deleteSteamLink(interaction.user.id);
      await interaction.editReply(
        removed
          ? 'Your Steam link has been removed.'
          : 'You do not have a linked Steam account. Use /link to create one.',
      );
    },
  };
}
