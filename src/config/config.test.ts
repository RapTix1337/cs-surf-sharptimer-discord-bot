import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const REQUIRED_ENV = {
  DISCORD_TOKEN: 'some-token',
  DISCORD_GUILD_ID: '123456789012345678',
  DISCORD_LEADERBOARD_CHANNEL_ID: '876543210987654321',
  DB_NAME: 'sharptimer',
  DB_USER: 'bot',
  DB_PASSWORD: 'secret',
};

describe('loadConfig', () => {
  it('parses a minimal configuration and applies all defaults', () => {
    const config = loadConfig({ ...REQUIRED_ENV });

    expect(config.discord.token).toBe('some-token');
    expect(config.discord.guildId).toBe('123456789012345678');
    expect(config.discord.leaderboardChannelId).toBe('876543210987654321');

    expect(config.database).toEqual({
      dialect: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'sharptimer',
      user: 'bot',
      password: 'secret',
      tablePrefix: '',
    });

    expect(config.records).toEqual({ style: 0, mode: '' });

    expect(config.scoring).toEqual({
      basePoints: 20,
      potPerFinisher: 15,
      rankWeight: 0.5,
      timeWeight: 0.5,
      outlierCap: 3,
      bonusWeight: 0.25,
    });

    expect(config.sync.intervalSeconds).toBe(60);

    expect(config.roles).toEqual({
      enabled: true,
      mode: 'top10',
      nameTemplate: 'Surf #{rank}',
      setColors: true,
      colors: ['#ffd700', '#c0c0c0', '#cd7f32'],
      hoist: false,
    });
  });

  it('treats empty strings as unset and falls back to defaults', () => {
    const config = loadConfig({
      ...REQUIRED_ENV,
      DB_DIALECT: '',
      SCORING_BASE_POINTS: '',
      ROLES_MODE: '',
    });

    expect(config.database.dialect).toBe('postgres');
    expect(config.scoring.basePoints).toBe(20);
    expect(config.roles.mode).toBe('top10');
  });

  it('defaults the port based on the dialect', () => {
    expect(loadConfig({ ...REQUIRED_ENV }).database.port).toBe(5432);
    expect(loadConfig({ ...REQUIRED_ENV, DB_DIALECT: 'mysql' }).database.port).toBe(3306);
    expect(loadConfig({ ...REQUIRED_ENV, DB_PORT: '5433' }).database.port).toBe(5433);
  });

  it('parses overridden values', () => {
    const config = loadConfig({
      ...REQUIRED_ENV,
      DB_TABLE_PREFIX: 'st_',
      RECORDS_STYLE: '2',
      RECORDS_MODE: 'None',
      SCORING_OUTLIER_CAP: '2.5',
      SCORING_BONUS_WEIGHT: '0.5',
      SYNC_INTERVAL_SECONDS: '120',
      ROLES_ENABLED: 'false',
      ROLES_MODE: 'bundled',
      ROLES_COLORS: '#ff0000, #00ff00',
      ROLES_HOIST: '1',
    });

    expect(config.database.tablePrefix).toBe('st_');
    expect(config.records).toEqual({ style: 2, mode: 'None' });
    expect(config.scoring.outlierCap).toBe(2.5);
    expect(config.scoring.bonusWeight).toBe(0.5);
    expect(config.sync.intervalSeconds).toBe(120);
    expect(config.roles.enabled).toBe(false);
    expect(config.roles.mode).toBe('bundled');
    expect(config.roles.colors).toEqual(['#ff0000', '#00ff00']);
    expect(config.roles.hoist).toBe(true);
  });

  it('throws a ConfigError listing every missing required variable', () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    try {
      loadConfig({});
      expect.unreachable('loadConfig should have thrown');
    } catch (error) {
      const message = (error as ConfigError).message;
      expect(message).toContain('DISCORD_TOKEN');
      expect(message).toContain('DISCORD_GUILD_ID');
      expect(message).toContain('DISCORD_LEADERBOARD_CHANNEL_ID');
      expect(message).toContain('DB_NAME');
      expect(message).toContain('DB_USER');
      expect(message).toContain('DB_PASSWORD');
    }
  });

  it('rejects invalid values with a readable message', () => {
    expect(() => loadConfig({ ...REQUIRED_ENV, DISCORD_GUILD_ID: 'not-a-snowflake' })).toThrowError(
      /DISCORD_GUILD_ID/,
    );
    expect(() => loadConfig({ ...REQUIRED_ENV, DB_DIALECT: 'sqlite' })).toThrowError(/DB_DIALECT/);
    expect(() => loadConfig({ ...REQUIRED_ENV, ROLES_MODE: 'everyone' })).toThrowError(
      /ROLES_MODE/,
    );
    expect(() => loadConfig({ ...REQUIRED_ENV, ROLES_COLORS: 'red,green' })).toThrowError(
      /ROLES_COLORS/,
    );
    expect(() => loadConfig({ ...REQUIRED_ENV, DB_PORT: '70000' })).toThrowError(/DB_PORT/);
    expect(() => loadConfig({ ...REQUIRED_ENV, SCORING_OUTLIER_CAP: '0.5' })).toThrowError(
      /SCORING_OUTLIER_CAP/,
    );
  });
});
