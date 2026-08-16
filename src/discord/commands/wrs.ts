import { SlashCommandBuilder } from 'discord.js';
import type { BotRepository, SharpTimerRepository } from '../../db/index.js';
import type { ScoringConfig } from '../../scoring/index.js';
import { scoreMaps } from '../../scoring/index.js';
import type { Command } from '../command.js';
import {
  buildListEmbed,
  formatTable,
  formatTickGap,
  formatTicks,
  resolveLinkedUser,
  truncate,
  userOption,
} from './helpers.js';

const MAP_WIDTH = 28;

export interface WrsCommandDependencies {
  repository: SharpTimerRepository;
  botRepository: BotRepository;
  scoringConfig: ScoringConfig;
}

export function createWrsCommand({
  repository,
  botRepository,
  scoringConfig,
}: WrsCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('wrs')
      .setDescription('Show all #1 records a player holds.')
      .addUserOption(userOption('user', 'Whose records to show (default: yours)')),
    async execute(interaction) {
      await interaction.deferReply();

      const resolved = await resolveLinkedUser(interaction, botRepository);
      if (!resolved.ok) {
        await interaction.editReply(resolved.message);
        return;
      }
      const { user, isSelf, steamId64 } = resolved.player;

      const records = await repository.getAllRecords();
      const maps = scoreMaps(records, scoringConfig);

      const wrs: { mapName: string; timerTicks: number; leadTicks: number | null }[] = [];
      for (const map of maps) {
        const entry = map.entries.find((candidate) => candidate.steamId === steamId64);
        if (!entry || entry.rank !== 1) {
          continue;
        }
        // Lead over the next slower time; null when the player is the only
        // finisher or every finisher is tied with them.
        const runnerUp = map.entries.find((candidate) => candidate.timerTicks > entry.timerTicks);
        wrs.push({
          mapName: map.mapName,
          timerTicks: entry.timerTicks,
          leadTicks: runnerUp ? runnerUp.timerTicks - entry.timerTicks : null,
        });
      }

      if (wrs.length === 0) {
        await interaction.editReply(
          isSelf
            ? 'You do not hold any #1 records yet — go take some!'
            : `${user.displayName} does not hold any #1 records yet.`,
        );
        return;
      }

      const lines = formatTable(
        [{ header: 'Map' }, { header: 'Time', align: 'right' }, { header: 'Lead', align: 'right' }],
        wrs.map((wr) => [
          truncate(wr.mapName, MAP_WIDTH),
          formatTicks(wr.timerTicks),
          wr.leadTicks === null ? '—' : formatTickGap(wr.leadTicks),
        ]),
      );

      const embed = buildListEmbed({
        title: `World Records — ${user.displayName}`,
        lines,
        footer: `${wrs.length} #1 record(s) across ${maps.length} map(s) & bonus(es)`,
      });
      await interaction.editReply({ embeds: [embed] });
    },
  };
}
