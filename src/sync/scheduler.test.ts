import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../logger.js';
import { Scheduler } from './scheduler.js';

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs immediately and then once per interval', async () => {
    const task = vi.fn(async () => undefined);
    const scheduler = new Scheduler(task, { intervalSeconds: 60, name: 'Test sync' });

    scheduler.start();
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(3);

    await scheduler.stop();
  });

  it('logs a failing run and keeps going', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const task = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('db down'));
    const scheduler = new Scheduler(task, { intervalSeconds: 60, name: 'Test sync' });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(2);

    await scheduler.stop();
  });

  it('does not run again after stop', async () => {
    const task = vi.fn(async () => undefined);
    const scheduler = new Scheduler(task, { intervalSeconds: 60, name: 'Test sync' });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await scheduler.stop();

    await vi.advanceTimersByTimeAsync(600_000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight run before stop resolves', async () => {
    let finishRun: () => void = () => undefined;
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRun = resolve;
        }),
    );
    const scheduler = new Scheduler(task, { intervalSeconds: 60, name: 'Test sync' });

    scheduler.start();
    let stopped = false;
    const stopPromise = scheduler.stop().then(() => {
      stopped = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    finishRun();
    await stopPromise;
    expect(stopped).toBe(true);
  });

  it('ignores a second start while running', async () => {
    const task = vi.fn(async () => undefined);
    const scheduler = new Scheduler(task, { intervalSeconds: 60, name: 'Test sync' });

    scheduler.start();
    scheduler.start();
    expect(task).toHaveBeenCalledTimes(1);

    await scheduler.stop();
  });
});
