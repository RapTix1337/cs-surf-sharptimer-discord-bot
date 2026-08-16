import type { ChatInputCommandInteraction, Interaction } from 'discord.js';
import { Client, Events, GatewayIntentBits, MessageFlags, Routes } from 'discord.js';
import type { Config } from '../config/index.js';
import { logger } from '../logger.js';
import type { Command } from './command.js';

const GENERIC_ERROR_REPLY = 'Something went wrong while running this command. Please try again.';

export class Bot {
  private readonly client: Client;
  private readonly commands = new Map<string, Command>();
  private readonly ready: Promise<void>;

  constructor(
    private readonly config: Config['discord'],
    commands: Command[],
  ) {
    for (const command of commands) {
      this.commands.set(command.data.name, command);
    }

    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    this.ready = new Promise((resolve) => {
      this.client.once(Events.ClientReady, (client) => {
        resolve();
        void this.onReady(client);
      });
    });
    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.onInteraction(interaction);
    });
    this.client.on(Events.Error, (error) => {
      logger.error('Discord client error', error);
    });
  }

  /** The underlying discord.js client, for consumers outside the command flow. */
  get discordClient(): Client {
    return this.client;
  }

  /** Resolves once the client is logged in and ready. */
  async start(): Promise<void> {
    await this.client.login(this.config.token);
    await this.ready;
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  private async onReady(client: Client<true>): Promise<void> {
    logger.info(`Logged in as ${client.user.tag}`);
    try {
      await this.registerCommands(client);
    } catch (error) {
      logger.error('Failed to register slash commands', error);
    }
  }

  private async registerCommands(client: Client<true>): Promise<void> {
    const body = [...this.commands.values()].map((command) => command.data.toJSON());
    await client.rest.put(
      Routes.applicationGuildCommands(client.application.id, this.config.guildId),
      {
        body,
      },
    );
    logger.info(`Registered ${body.length} slash command(s) in guild ${this.config.guildId}`);
  }

  private async onInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isChatInputCommand()) {
      const command = this.commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`Received unknown command /${interaction.commandName}`);
        return;
      }
      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error(`Command /${interaction.commandName} failed`, error);
        await this.replyWithError(interaction);
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = this.commands.get(interaction.commandName);
      if (!command?.autocomplete) {
        return;
      }
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        logger.error(`Autocomplete for /${interaction.commandName} failed`, error);
      }
    }
  }

  private async replyWithError(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: GENERIC_ERROR_REPLY, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: GENERIC_ERROR_REPLY, flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      logger.error('Failed to send the error reply', error);
    }
  }
}
