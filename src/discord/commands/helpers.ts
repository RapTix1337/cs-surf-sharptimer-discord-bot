import type {
  ChatInputCommandInteraction,
  SlashCommandIntegerOption,
  SlashCommandUserOption,
  User,
} from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { BotRepository } from '../../db/index.js';

/** Shared accent color for all bot embeds. */
export const EMBED_COLOR = 0xf1c40f;

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 25;

/**
 * The standard `limit` option for list commands: 1-25, default 10.
 * Usage: `.addIntegerOption(limitOption)`.
 */
export function limitOption(option: SlashCommandIntegerOption): SlashCommandIntegerOption {
  return option
    .setName('limit')
    .setDescription(`Number of entries to show (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`)
    .setMinValue(1)
    .setMaxValue(MAX_LIMIT);
}

/** Reads the standard `limit` option, falling back to the default. */
export function getLimit(interaction: ChatInputCommandInteraction): number {
  return interaction.options.getInteger('limit') ?? DEFAULT_LIMIT;
}

/** Builds a user option. Usage: `.addUserOption(userOption('user', '...'))`. */
export function userOption(
  name: string,
  description: string,
  required = false,
): (option: SlashCommandUserOption) => SlashCommandUserOption {
  return (option) => option.setName(name).setDescription(description).setRequired(required);
}

export interface LinkedPlayer {
  user: User;
  /** Whether the resolved player is the user who invoked the command. */
  isSelf: boolean;
  steamId64: string;
}

export type ResolveLinkedUserResult =
  { ok: true; player: LinkedPlayer } | { ok: false; message: string };

/**
 * Resolves a user option (falling back to the invoking user) to their linked
 * Steam account. Returns a ready-to-send error message when the target has not
 * linked one.
 */
export async function resolveLinkedUser(
  interaction: ChatInputCommandInteraction,
  botRepository: BotRepository,
  optionName = 'user',
): Promise<ResolveLinkedUserResult> {
  const target = interaction.options.getUser(optionName) ?? interaction.user;
  return await resolveLinkFor(target, interaction.user, botRepository);
}

/** Like {@link resolveLinkedUser}, but for an already-resolved user. */
export async function resolveLinkFor(
  target: User,
  invoker: User,
  botRepository: BotRepository,
): Promise<ResolveLinkedUserResult> {
  const isSelf = target.id === invoker.id;
  const link = await botRepository.getSteamLink(target.id);
  if (!link) {
    return {
      ok: false,
      message: isSelf
        ? 'You have not linked a Steam account yet. Use /link to connect one.'
        : `${target.displayName} has not linked a Steam account yet — they can use /link to connect one.`,
    };
  }
  return { ok: true, player: { user: target, isSelf, steamId64: link.steamId64 } };
}

/** CS2 runs a fixed 64-tick simulation; SharpTimer's TimerTicks count those ticks. */
export const TICKS_PER_SECOND = 64;

/** Formats a tick count as a clock time, e.g. `0:45.203` or `1:02:03.500`. */
export function formatTicks(ticks: number): string {
  const totalMs = Math.round((ticks / TICKS_PER_SECOND) * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const msPart = `${ms}`.padStart(3, '0');
  const secondsPart = `${seconds}`.padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${`${minutes}`.padStart(2, '0')}:${secondsPart}.${msPart}`;
  }
  return `${minutes}:${secondsPart}.${msPart}`;
}

/**
 * Formats a tick difference, e.g. `+1.203` or `+1:05.016`. Short gaps drop the
 * minutes so tight races stay easy to read.
 */
export function formatTickGap(ticks: number): string {
  const totalMs = Math.round((ticks / TICKS_PER_SECOND) * 1000);
  if (totalMs < 60_000) {
    const seconds = Math.floor(totalMs / 1000);
    const ms = `${totalMs % 1000}`.padStart(3, '0');
    return `+${seconds}.${ms}`;
  }
  return `+${formatTicks(ticks)}`;
}

/** Shortens a value to `max` characters, marking the cut with an ellipsis. */
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export interface TableColumn {
  header: string;
  align?: 'left' | 'right';
}

/**
 * Renders rows as an aligned plain-text table (header + one line per row),
 * meant to be shown inside a code block.
 */
export function formatTable(columns: TableColumn[], rows: string[][]): string[] {
  const widths = columns.map((column, index) =>
    Math.max(column.header.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const render = (cells: string[]): string =>
    columns
      .map((column, index) => {
        const cell = cells[index] ?? '';
        const width = widths[index] ?? 0;
        return column.align === 'right' ? cell.padStart(width) : cell.padEnd(width);
      })
      .join('  ')
      .trimEnd();
  return [render(columns.map((column) => column.header)), ...rows.map(render)];
}

/** Discord's hard limit on an embed description. */
const DESCRIPTION_LIMIT = 4096;

export interface ListEmbedOptions {
  title: string;
  /** One entry per line; lines beyond the description limit are summarized. */
  lines: string[];
  /** Wrap the lines in a code block (for aligned tables). Default true. */
  codeBlock?: boolean;
  footer?: string;
}

/**
 * Builds the bot's standard list embed. Lines that would push the description
 * past Discord's 4096-character limit are replaced by a `… and N more` marker
 * so the embed always stays sendable.
 */
export function buildListEmbed(options: ListEmbedOptions): EmbedBuilder {
  const codeBlock = options.codeBlock ?? true;
  const wrapperLength = codeBlock ? '```\n\n```'.length : 0;

  const included: string[] = [];
  let used = wrapperLength;
  for (const [index, line] of options.lines.entries()) {
    const remaining = options.lines.length - index;
    // Keep room for a "… and N more" marker unless every line fits.
    const marker = `… and ${remaining} more`;
    const lineCost = line.length + 1;
    if (used + lineCost + marker.length + 1 > DESCRIPTION_LIMIT && remaining > 1) {
      included.push(marker);
      break;
    }
    if (used + lineCost > DESCRIPTION_LIMIT) {
      included.push(marker);
      break;
    }
    included.push(line);
    used += lineCost;
  }

  const body = included.join('\n');
  const description = codeBlock ? `\`\`\`\n${body}\n\`\`\`` : body;
  const embed = new EmbedBuilder()
    .setTitle(options.title)
    .setColor(EMBED_COLOR)
    .setDescription(description)
    .setTimestamp();
  if (options.footer) {
    embed.setFooter({ text: options.footer });
  }
  return embed;
}
