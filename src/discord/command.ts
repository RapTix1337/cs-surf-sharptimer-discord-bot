import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

/**
 * A slash command. `data` accepts any of the discord.js builder variants
 * (options-only, subcommands, ...) — only the name and the JSON payload are
 * needed for registration and dispatch.
 */
export interface Command {
  data: Pick<SlashCommandBuilder, 'name' | 'toJSON'>;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
