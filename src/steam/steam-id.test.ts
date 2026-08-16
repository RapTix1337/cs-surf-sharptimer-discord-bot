import { describe, expect, it } from 'vitest';
import { parseSteamId, STEAM_ID_ERRORS } from './steam-id.js';

/** STEAM_0:1:22202 == [U:1:44405] == 76561197960310133 — all the same account. */
const ID64 = '76561197960310133';

function expectOk(input: string, steamId64: string): void {
  expect(parseSteamId(input)).toEqual({ ok: true, steamId64 });
}

function expectError(input: string, message: string): void {
  expect(parseSteamId(input)).toEqual({ ok: false, message });
}

describe('parseSteamId', () => {
  describe('SteamID64', () => {
    it('accepts a plain SteamID64', () => {
      expectOk(ID64, ID64);
      expectOk('76561197960265728', '76561197960265728');
    });

    it('trims surrounding whitespace', () => {
      expectOk(`  ${ID64} \n`, ID64);
    });

    it('rejects numbers with the wrong length', () => {
      expectError('44405', STEAM_ID_ERRORS.invalidSteamId64);
      expectError('765611979603101330', STEAM_ID_ERRORS.invalidSteamId64);
    });

    it('rejects 17-digit numbers outside the individual-account range', () => {
      expectError('10000000000000000', STEAM_ID_ERRORS.invalidSteamId64);
      expectError('76561197960265727', STEAM_ID_ERRORS.invalidSteamId64);
      // base + 2^32, one past the largest possible account id
      expectError('76561202255233024', STEAM_ID_ERRORS.invalidSteamId64);
    });
  });

  describe('profile URLs', () => {
    it('accepts profile URLs in common spellings', () => {
      expectOk(`https://steamcommunity.com/profiles/${ID64}`, ID64);
      expectOk(`http://steamcommunity.com/profiles/${ID64}/`, ID64);
      expectOk(`https://www.steamcommunity.com/profiles/${ID64}`, ID64);
      expectOk(`steamcommunity.com/profiles/${ID64}`, ID64);
      expectOk(`STEAMCOMMUNITY.COM/PROFILES/${ID64}`, ID64);
    });

    it('accepts profile URLs with a query string or fragment', () => {
      expectOk(`https://steamcommunity.com/profiles/${ID64}?xml=1`, ID64);
      expectOk(`https://steamcommunity.com/profiles/${ID64}/#main`, ID64);
    });

    it('rejects profile URLs with an invalid id', () => {
      expectError('https://steamcommunity.com/profiles/12345', STEAM_ID_ERRORS.invalidSteamId64);
    });

    it('rejects vanity URLs with a dedicated message', () => {
      expectError('https://steamcommunity.com/id/gaben', STEAM_ID_ERRORS.vanityUrl);
      expectError('steamcommunity.com/id/gaben/', STEAM_ID_ERRORS.vanityUrl);
    });
  });

  describe('SteamID2', () => {
    it('converts SteamID2 to SteamID64', () => {
      expectOk('STEAM_0:1:22202', ID64);
      expectOk('STEAM_0:0:11', '76561197960265750');
    });

    it('ignores the universe digit', () => {
      expectOk('STEAM_1:1:22202', ID64);
      expectOk('STEAM_5:1:22202', ID64);
    });

    it('is case-insensitive', () => {
      expectOk('steam_0:1:22202', ID64);
    });

    it('rejects malformed SteamID2 values', () => {
      expectError('STEAM_0:2:22202', STEAM_ID_ERRORS.unrecognized);
      expectError('STEAM_6:1:22202', STEAM_ID_ERRORS.unrecognized);
      expectError('STEAM_0:1:', STEAM_ID_ERRORS.unrecognized);
    });

    it('rejects account ids that do not fit in 32 bits', () => {
      expectError('STEAM_0:1:9999999999', STEAM_ID_ERRORS.unrecognized);
    });
  });

  describe('SteamID3', () => {
    it('converts SteamID3 to SteamID64', () => {
      expectOk('[U:1:44405]', ID64);
    });

    it('accepts the bracketless form', () => {
      expectOk('U:1:44405', ID64);
    });

    it('rejects malformed SteamID3 values', () => {
      expectError('[U:1:44405', STEAM_ID_ERRORS.unrecognized);
      expectError('[G:1:44405]', STEAM_ID_ERRORS.unrecognized);
      expectError('[U:2:44405]', STEAM_ID_ERRORS.unrecognized);
    });

    it('rejects account ids that do not fit in 32 bits', () => {
      expectError('[U:1:9999999999]', STEAM_ID_ERRORS.unrecognized);
    });
  });

  describe('everything else', () => {
    it('rejects unrecognizable input', () => {
      expectError('', STEAM_ID_ERRORS.unrecognized);
      expectError('   ', STEAM_ID_ERRORS.unrecognized);
      expectError('gaben', STEAM_ID_ERRORS.unrecognized);
      expectError('https://example.com/profiles/76561197960310133', STEAM_ID_ERRORS.unrecognized);
    });
  });
});
