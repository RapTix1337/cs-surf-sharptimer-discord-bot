/**
 * Offline Steam ID parsing. Converts everything players typically paste into
 * a SteamID64 without ever calling the Steam Web API:
 *
 *   - SteamID64:    76561197960310133
 *   - Profile URL:  https://steamcommunity.com/profiles/76561197960310133
 *   - SteamID2:     STEAM_1:1:22202  (universe digit is ignored)
 *   - SteamID3:     [U:1:44405]      (brackets optional)
 *
 * For individual accounts the formats relate via the account id Z:
 * steamId64 = 76561197960265728 + Z, with SteamID2's STEAM_X:Y:W meaning
 * Z = W * 2 + Y. SteamID64 values exceed Number.MAX_SAFE_INTEGER, so all
 * arithmetic uses BigInt and the result stays a string.
 *
 * Vanity URLs (steamcommunity.com/id/<name>) can only be resolved through the
 * Steam Web API, which would require an API key — they are rejected with a
 * dedicated error message instead.
 */

/** SteamID64 of account id 0 for individual accounts in the public universe. */
const STEAM64_BASE = 76561197960265728n;
/** Account ids are 32-bit unsigned. */
const MAX_ACCOUNT_ID = 0xffffffffn;

const PROFILE_URL =
  /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/profiles\/(\d+)\/?(?:[?#].*)?$/i;
const VANITY_URL = /^(?:https?:\/\/)?(?:www\.)?steamcommunity\.com\/id\/[^\s/?#]+/i;
const STEAM_ID2 = /^STEAM_[0-5]:([01]):(\d{1,10})$/i;
const STEAM_ID3 = /^\[U:1:(\d{1,10})\]$|^U:1:(\d{1,10})$/i;

const FORMAT_HINT =
  'Supported formats: SteamID64 (e.g. 76561198012345678), profile URL ' +
  '(steamcommunity.com/profiles/<id>), STEAM_1:0:12345 or [U:1:12345].';

export const STEAM_ID_ERRORS = {
  unrecognized: `That does not look like a valid Steam ID. ${FORMAT_HINT}`,
  vanityUrl:
    'Custom profile URLs (steamcommunity.com/id/...) cannot be resolved without a Steam API ' +
    'key. Please use your SteamID64 instead — open your profile, and if the address bar does ' +
    'not show /profiles/<number>, you can look it up on a site like steamid.io.',
  invalidSteamId64: `That number is not a valid SteamID64 for a Steam account. ${FORMAT_HINT}`,
} as const;

export type SteamIdParseResult = { ok: true; steamId64: string } | { ok: false; message: string };

/** Parses any supported Steam ID format into a SteamID64 string. */
export function parseSteamId(input: string): SteamIdParseResult {
  const value = input.trim();
  if (value.length === 0) {
    return fail(STEAM_ID_ERRORS.unrecognized);
  }

  const profileUrl = PROFILE_URL.exec(value);
  if (profileUrl?.[1] !== undefined) {
    return parseSteamId64(profileUrl[1]);
  }
  if (VANITY_URL.test(value)) {
    return fail(STEAM_ID_ERRORS.vanityUrl);
  }

  const id2 = STEAM_ID2.exec(value);
  if (id2?.[1] !== undefined && id2[2] !== undefined) {
    return fromAccountId(BigInt(id2[2]) * 2n + BigInt(id2[1]));
  }

  const id3 = STEAM_ID3.exec(value);
  const id3AccountId = id3?.[1] ?? id3?.[2];
  if (id3AccountId !== undefined) {
    return fromAccountId(BigInt(id3AccountId));
  }

  if (/^\d+$/.test(value)) {
    return parseSteamId64(value);
  }

  return fail(STEAM_ID_ERRORS.unrecognized);
}

function parseSteamId64(digits: string): SteamIdParseResult {
  if (!/^\d{17}$/.test(digits)) {
    return fail(STEAM_ID_ERRORS.invalidSteamId64);
  }
  const id = BigInt(digits);
  if (id < STEAM64_BASE || id > STEAM64_BASE + MAX_ACCOUNT_ID) {
    return fail(STEAM_ID_ERRORS.invalidSteamId64);
  }
  return { ok: true, steamId64: id.toString() };
}

function fromAccountId(accountId: bigint): SteamIdParseResult {
  if (accountId > MAX_ACCOUNT_ID) {
    return fail(STEAM_ID_ERRORS.unrecognized);
  }
  return { ok: true, steamId64: (STEAM64_BASE + accountId).toString() };
}

function fail(message: string): SteamIdParseResult {
  return { ok: false, message };
}
