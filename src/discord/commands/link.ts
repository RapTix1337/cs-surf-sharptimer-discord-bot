import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { BotRepository, SharpTimerRepository } from '../../db/index.js';
import { parseSteamId } from '../../steam/index.js';
import type { Command } from '../command.js';

export interface LinkCommandDependencies {
  repository: SharpTimerRepository;
  botRepository: BotRepository;
}

export function createLinkCommand({ repository, botRepository }: LinkCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('link')
      .setDescription('Link your Discord account to your Steam account.')
      .addStringOption((option) =>
        option
          .setName('steam')
          .setDescription('SteamID64, profile URL, STEAM_1:0:12345 or [U:1:12345]')
          .setRequired(true),
      ),
    async execute(interaction) {
      const input = interaction.options.getString('steam', true);
      const parsed = parseSteamId(input);
      if (!parsed.ok) {
        await interaction.reply({ content: parsed.message, flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const previous = await botRepository.upsertSteamLink(interaction.user.id, parsed.steamId64);
      const playerName = await repository.getPlayerName(parsed.steamId64);

      const lines = [
        playerName
          ? `Linked your account to **${playerName}** (SteamID64 ${parsed.steamId64}).`
          : `Linked your account to SteamID64 ${parsed.steamId64}. No SharpTimer stats found ` +
            'for this account yet — the link is saved and will kick in once there are records.',
      ];
      if (previous !== null && previous !== parsed.steamId64) {
        lines.push(`This replaces your previous link to SteamID64 ${previous}.`);
      }
      await interaction.editReply(lines.join('\n'));
    },
  };
}
