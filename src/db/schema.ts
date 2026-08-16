/**
 * Table definitions for the SharpTimer (v0.4.0) database.
 *
 * These tables are owned by the SharpTimer CS2 plugin — the bot treats them
 * as strictly read-only. Column names are case-sensitive on PostgreSQL
 * (SharpTimer creates them quoted), which Kysely handles by quoting all
 * identifiers.
 *
 * SharpTimer can be configured with a table prefix; the bot supports this via
 * DB_TABLE_PREFIX (applied in the repository when resolving table names).
 */

/** Personal best per map/player/style/mode. Primary key: (MapName, SteamID, Style, Mode). */
export interface PlayerRecordsTable {
  /** Map name; bonus tracks are stored as their own "map" named `<map>_bonus<N>`. */
  MapName: string;
  /** SteamID64 stored as a string. */
  SteamID: string;
  PlayerName: string;
  /** Personal best in timer ticks — lower is better. */
  TimerTicks: number;
  FormattedTime: string;
  UnixStamp: number;
  TimesFinished: number;
  LastFinished: number;
  /** 0 = normal; other styles are ignored by the bot. */
  Style: number;
  /** The column default is '', but SharpTimer writes 'Standard' for its default mode. */
  Mode: string;
}

/** Per-player settings and stats kept by SharpTimer. */
export interface PlayerStatsTable {
  /** SteamID64 stored as a string (primary key). */
  SteamID: string;
  PlayerName: string;
  TimesConnected: number;
  LastConnected: number;
  /** SharpTimer's own points system — not used by this bot. */
  GlobalPoints: number;
  HideTimerHud: boolean;
  HideKeys: boolean;
  SoundsEnabled: boolean;
  PlayerFov: number;
  IsVip: boolean;
  BigGifID: string;
  Mode: string;
}

export interface SharpTimerDatabase {
  PlayerRecords: PlayerRecordsTable;
  PlayerStats: PlayerStatsTable;
}

export type SharpTimerTableName = keyof SharpTimerDatabase;
