import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../command.js';

export const ping: Command = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check whether the bot is alive.'),
  async execute(interaction) {
    const gatewayPing = interaction.client.ws.ping;
    const latency = gatewayPing >= 0 ? `${Math.round(gatewayPing)} ms` : 'n/a';
    await interaction.reply(`Pong! Gateway latency: ${latency}`);
  },
};
