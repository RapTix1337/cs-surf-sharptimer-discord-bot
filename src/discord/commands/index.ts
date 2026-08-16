import type { BotRepository, SharpTimerRepository } from '../../db/index.js';
import type { ScoringConfig } from '../../scoring/index.js';
import type { Command } from '../command.js';
import { createCompareCommand } from './compare.js';
import { createImproveCommand } from './improve.js';
import { createLinkCommand } from './link.js';
import { createMapCommand } from './map.js';
import { ping } from './ping.js';
import { createRankCommand } from './rank.js';
import { createRecentCommand } from './recent.js';
import { createTopCommand } from './top.js';
import { createUnfinishedCommand } from './unfinished.js';
import { createUnlinkCommand } from './unlink.js';
import { createWrsCommand } from './wrs.js';

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
    createUnfinishedCommand(deps),
    createImproveCommand(deps),
    createMapCommand(deps),
    createWrsCommand(deps),
    createCompareCommand(deps),
    createRecentCommand(deps),
  ];
}
