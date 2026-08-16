import { SlashCommandBuilder } from 'discord.js';
import type { SharpTimerRepository } from '../../db/index.js';
import type { ScoringConfig } from '../../scoring/index.js';
import { scoreMaps } from '../../scoring/index.js';
import type { Command } from '../command.js';
import {
  buildListEmbed,
  formatTable,
  formatTicks,
  getLimit,
  limitOption,
  truncate,
} from './helpers.js';

const NAME_WIDTH = 20;
/** Discord caps autocomplete to 25 choices, each name/value at 100 characters. */
const MAX_CHOICES = 25;
const MAX_CHOICE_LENGTH = 100;

export interface MapCommandDependencies {
  repository: SharpTimerRepository;
  scoringConfig: ScoringConfig;
}

export function createMapCommand({ repository, scoringConfig }: MapCommandDependencies): Command {
  return {
    data: new SlashCommandBuilder()
      .setName('map')
      .setDescription('Show the leaderboard of a map or bonus.')
      .addStringOption((option) =>
        option
          .setName('mapname')
          .setDescription('The map (or bonus) to show')
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addIntegerOption(limitOption),
    async autocomplete(interaction) {
      const query = interaction.options.getFocused().toLowerCase();
      const maps = await repository.listMaps();
      const choices = maps
        .filter((map) => map.mapName.length <= MAX_CHOICE_LENGTH)
        .filter((map) => map.mapName.toLowerCase().includes(query))
        .slice(0, MAX_CHOICES)
        .map((map) => ({ name: map.mapName, value: map.mapName }));
      await interaction.respond(choices);
    },
    async execute(interaction) {
      const mapName = interaction.options.getString('mapname', true);
      const limit = getLimit(interaction);
      await interaction.deferReply();

      const records = await repository.getMapRecords(mapName);
      const map = scoreMaps(records, scoringConfig)[0];
      if (map === undefined) {
        await interaction.editReply(
          `No records found for \`${mapName}\`. Pick a map from the autocomplete suggestions.`,
        );
        return;
      }

      const shown = map.entries.slice(0, limit);
      const lines = formatTable(
        [
          { header: '', align: 'right' },
          { header: 'Player' },
          { header: 'Time', align: 'right' },
          { header: 'Points', align: 'right' },
        ],
        shown.map((entry) => [
          `#${entry.rank}`,
          truncate(entry.playerName, NAME_WIDTH),
          formatTicks(entry.timerTicks),
          `${Math.round(entry.points)}`,
        ]),
      );

      const footerParts = [`${map.finisherCount} finisher(s)`];
      if (map.isBonus) {
        footerParts.push(`bonus track (weight ${map.weight})`);
      }
      const embed = buildListEmbed({
        title: map.mapName,
        lines,
        footer: footerParts.join(' • '),
      });
      await interaction.editReply({ embeds: [embed] });
    },
  };
}
