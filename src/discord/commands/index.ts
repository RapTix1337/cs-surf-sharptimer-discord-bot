import type { SharpTimerRepository } from '../../db/index.js';
import type { ScoringConfig } from '../../scoring/index.js';
import type { Command } from '../command.js';
import { ping } from './ping.js';
import { createTopCommand } from './top.js';

export interface CommandDependencies {
  repository: SharpTimerRepository;
  scoringConfig: ScoringConfig;
}

export function createCommands(deps: CommandDependencies): Command[] {
  return [ping, createTopCommand(deps)];
}
