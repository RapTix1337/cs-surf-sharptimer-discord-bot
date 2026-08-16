import type { BotRepository, SharpTimerRepository } from '../../db/index.js';
import type { ScoringConfig } from '../../scoring/index.js';
import type { Command } from '../command.js';
import { createLinkCommand } from './link.js';
import { ping } from './ping.js';
import { createRankCommand } from './rank.js';
import { createTopCommand } from './top.js';
import { createUnlinkCommand } from './unlink.js';

export interface CommandDependencies {
  repository: SharpTimerRepository;
  botRepository: BotRepository;
  scoringConfig: ScoringConfig;
}

export function createCommands(deps: CommandDependencies): Command[] {
  return [
    ping,
    createTopCommand(deps),
    createLinkCommand(deps),
    createUnlinkCommand(deps),
    createRankCommand(deps),
  ];
}
