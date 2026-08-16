import { z } from 'zod';

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID (17-20 digits)');

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a hex color like #ffcc00');

const colorList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  )
  .pipe(z.array(hexColor));

export const ROLE_MODES = ['every-rank', 'top3', 'top10', 'bundled'] as const;
export type RoleMode = (typeof ROLE_MODES)[number];

export const DB_DIALECTS = ['postgres', 'mysql'] as const;
export type DbDialect = (typeof DB_DIALECTS)[number];

const envSchema = z.object({
  // Discord
  DISCORD_TOKEN: z.string().min(1, 'is required'),
  DISCORD_GUILD_ID: snowflake,
  DISCORD_LEADERBOARD_CHANNEL_ID: snowflake,

  // Database (the SharpTimer database; the bot only ever reads SharpTimer tables)
  DB_DIALECT: z.enum(DB_DIALECTS).default('postgres'),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DB_NAME: z.string().min(1, 'is required'),
  DB_USER: z.string().min(1, 'is required'),
  DB_PASSWORD: z.string().min(1, 'is required'),
  DB_TABLE_PREFIX: z.string().default(''),

  // Which SharpTimer records count towards the ranking
  RECORDS_STYLE: z.coerce.number().int().min(0).default(0),
  RECORDS_MODE: z.string().default(''),

  // Scoring parameters
  SCORING_BASE_POINTS: z.coerce.number().min(0).default(20),
  SCORING_POT_PER_FINISHER: z.coerce.number().min(0).default(15),
  SCORING_RANK_WEIGHT: z.coerce.number().min(0).default(0.5),
  SCORING_TIME_WEIGHT: z.coerce.number().min(0).default(0.5),
  SCORING_OUTLIER_CAP: z.coerce.number().min(1).default(3),
  SCORING_BONUS_WEIGHT: z.coerce.number().min(0).default(0.25),

  // Leaderboard / role sync scheduler
  SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(60),

  // Role sync
  ROLES_ENABLED: booleanish.default(true),
  ROLES_MODE: z.enum(ROLE_MODES).default('top10'),
  ROLES_NAME_TEMPLATE: z.string().min(1).default('Surf #{rank}'),
  ROLES_SET_COLORS: booleanish.default(true),
  ROLES_COLORS: colorList.default(['#ffd700', '#c0c0c0', '#cd7f32']),
  ROLES_HOIST: booleanish.default(false),
});

const DEFAULT_PORTS: Record<DbDialect, number> = {
  postgres: 5432,
  mysql: 3306,
};

export interface Config {
  discord: {
    token: string;
    guildId: string;
    leaderboardChannelId: string;
  };
  database: {
    dialect: DbDialect;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    tablePrefix: string;
  };
  records: {
    style: number;
    mode: string;
  };
  scoring: {
    basePoints: number;
    potPerFinisher: number;
    rankWeight: number;
    timeWeight: number;
    outlierCap: number;
    bonusWeight: number;
  };
  sync: {
    intervalSeconds: number;
  };
  roles: {
    enabled: boolean;
    mode: RoleMode;
    nameTemplate: string;
    setColors: boolean;
    colors: string[];
    hoist: boolean;
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Parses and validates the bot configuration from environment variables.
 * Empty strings are treated as "not set" so that blank lines in a .env file
 * fall back to the documented defaults. Throws a {@link ConfigError} with a
 * readable list of problems when the configuration is invalid.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ''),
  );

  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const key = issue.path.join('.') || '(root)';
      const message = key !== '(root)' && !(key in cleaned) ? 'is required' : issue.message;
      return `  - ${key}: ${message}`;
    });
    throw new ConfigError(
      `Invalid configuration. Fix the following environment variables (see .env.example):\n${issues.join('\n')}`,
    );
  }

  const parsed = result.data;
  return {
    discord: {
      token: parsed.DISCORD_TOKEN,
      guildId: parsed.DISCORD_GUILD_ID,
      leaderboardChannelId: parsed.DISCORD_LEADERBOARD_CHANNEL_ID,
    },
    database: {
      dialect: parsed.DB_DIALECT,
      host: parsed.DB_HOST,
      port: parsed.DB_PORT ?? DEFAULT_PORTS[parsed.DB_DIALECT],
      database: parsed.DB_NAME,
      user: parsed.DB_USER,
      password: parsed.DB_PASSWORD,
      tablePrefix: parsed.DB_TABLE_PREFIX,
    },
    records: {
      style: parsed.RECORDS_STYLE,
      mode: parsed.RECORDS_MODE,
    },
    scoring: {
      basePoints: parsed.SCORING_BASE_POINTS,
      potPerFinisher: parsed.SCORING_POT_PER_FINISHER,
      rankWeight: parsed.SCORING_RANK_WEIGHT,
      timeWeight: parsed.SCORING_TIME_WEIGHT,
      outlierCap: parsed.SCORING_OUTLIER_CAP,
      bonusWeight: parsed.SCORING_BONUS_WEIGHT,
    },
    sync: {
      intervalSeconds: parsed.SYNC_INTERVAL_SECONDS,
    },
    roles: {
      enabled: parsed.ROLES_ENABLED,
      mode: parsed.ROLES_MODE,
      nameTemplate: parsed.ROLES_NAME_TEMPLATE,
      setColors: parsed.ROLES_SET_COLORS,
      colors: parsed.ROLES_COLORS,
      hoist: parsed.ROLES_HOIST,
    },
  };
}
