import { logger } from '../logger.js';

export interface SchedulerOptions {
  intervalSeconds: number;
  /** Shown in log lines to tell schedulers apart, e.g. "Leaderboard sync". */
  name: string;
}

/**
 * Repeatedly runs an async task: once immediately on start, then again a fixed
 * delay after each completed run, so runs never overlap even when one takes
 * longer than the interval. A failing run is logged and skipped — the next one
 * happens as scheduled, so a flaky database or Discord outage never takes the
 * bot down.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = true;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly options: SchedulerOptions,
  ) {}

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.inFlight = this.run();
  }

  /** Stops scheduling further runs and waits for an in-flight run to finish. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.inFlight;
  }

  private async run(): Promise<void> {
    try {
      await this.task();
    } catch (error) {
      logger.error(`${this.options.name} failed — skipping this run.`, error);
    }
    if (!this.stopped) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.inFlight = this.run();
      }, this.options.intervalSeconds * 1000);
    }
  }
}
