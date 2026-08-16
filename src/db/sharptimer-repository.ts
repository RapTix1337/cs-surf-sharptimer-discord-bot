import type { Kysely } from 'kysely';
import { isBonusMap } from './map-name.js';
import type { PlayerRecordsTable, SharpTimerDatabase, SharpTimerTableName } from './schema.js';

export interface RecordRow {
  mapName: string;
  isBonus: boolean;
  steamId: string;
  playerName: string;
  timerTicks: number;
  formattedTime: string;
  unixStamp: number;
  timesFinished: number;
  lastFinished: number;
}

export interface MapInfo {
  mapName: string;
  isBonus: boolean;
}

export interface SharpTimerRepositoryOptions {
  /** Prefix SharpTimer was configured with, usually empty. */
  tablePrefix: string;
  /** Only records with this style count (0 = normal). */
  style: number;
  /** Only records with this mode count (SharpTimer's default mode stores ''). */
  mode: string;
}

/**
 * Read-only access to the SharpTimer tables. Every query filters on the
 * configured style and mode so the rest of the bot only ever sees the records
 * that count towards the ranking.
 */
export class SharpTimerRepository {
  constructor(
    private readonly db: Kysely<SharpTimerDatabase>,
    private readonly options: SharpTimerRepositoryOptions,
  ) {}

  /**
   * Resolves the physical (possibly prefixed) table name. The cast keeps
   * Kysely's typing anchored to the unprefixed table definition.
   */
  private table<T extends SharpTimerTableName>(name: T): T {
    return `${this.options.tablePrefix}${name}` as T;
  }

  private recordsQuery() {
    return this.db
      .selectFrom(this.table('PlayerRecords'))
      .select([
        'MapName',
        'SteamID',
        'PlayerName',
        'TimerTicks',
        'FormattedTime',
        'UnixStamp',
        'TimesFinished',
        'LastFinished',
      ])
      .where('Style', '=', this.options.style)
      .where('Mode', '=', this.options.mode);
  }

  /** All personal bests (across all maps and bonuses), best times first per map. */
  async getAllRecords(): Promise<RecordRow[]> {
    const rows = await this.recordsQuery()
      .orderBy('MapName', 'asc')
      .orderBy('TimerTicks', 'asc')
      .execute();
    return rows.map(toRecordRow);
  }

  /** Personal bests on a single map (or bonus), best time first. */
  async getMapRecords(mapName: string): Promise<RecordRow[]> {
    const rows = await this.recordsQuery()
      .where('MapName', '=', mapName)
      .orderBy('TimerTicks', 'asc')
      .execute();
    return rows.map(toRecordRow);
  }

  /** Every map and bonus that has at least one counting record. */
  async listMaps(): Promise<MapInfo[]> {
    const rows = await this.db
      .selectFrom(this.table('PlayerRecords'))
      .select('MapName')
      .distinct()
      .where('Style', '=', this.options.style)
      .where('Mode', '=', this.options.mode)
      .orderBy('MapName', 'asc')
      .execute();
    return rows.map((row) => ({ mapName: row.MapName, isBonus: isBonusMap(row.MapName) }));
  }
}

function toRecordRow(row: Omit<PlayerRecordsTable, 'Style' | 'Mode'>): RecordRow {
  return {
    mapName: row.MapName,
    isBonus: isBonusMap(row.MapName),
    steamId: row.SteamID,
    playerName: row.PlayerName,
    timerTicks: row.TimerTicks,
    formattedTime: row.FormattedTime,
    unixStamp: row.UnixStamp,
    timesFinished: row.TimesFinished,
    lastFinished: row.LastFinished,
  };
}
