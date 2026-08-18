# Surf Discord Bot

A Discord bot for CS2 surf servers running the SharpTimer plugin. It reads the
records straight from your SharpTimer database (strictly read-only) and turns
them into a competition on Discord:

- **Points system** — every map and bonus awards points based on rank and time
  relative to the other finishers, so beating your friends actually pays off.
- **Live leaderboard** — an auto-updating ranking embed in a channel of your
  choice.
- **Rank roles** — Discord roles that follow the leaderboard, kept in sync
  automatically (several modes, from one-role-per-rank to bundled tiers).
- **Slash commands** — link your Steam account and explore records: your rank,
  map leaderboards, world records, head-to-head comparisons, maps with the most
  points to gain, and more.

## Commands

| Command                      | Description                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/link <steam>`              | Link your Discord account to a Steam account. Accepts a SteamID64, a `steamcommunity.com/profiles/...` URL, a SteamID2 (`STEAM_1:...`) or a SteamID3 (`[U:1:...]`). |
| `/unlink`                    | Remove your link.                                                                                                                                                   |
| `/rank [user]`               | Global rank, points, #1 records and completion rate.                                                                                                                |
| `/top [limit]`               | The overall ranking on demand.                                                                                                                                      |
| `/unfinished [limit] [user]` | Maps not finished yet, sorted by points potential.                                                                                                                  |
| `/improve [limit] [user]`    | Finished maps without a #1, sorted by points potential.                                                                                                             |
| `/map <mapname> [limit]`     | Leaderboard of a single map (with autocomplete).                                                                                                                    |
| `/wrs [user]`                | All #1 records a player holds.                                                                                                                                      |
| `/compare <user1> [user2]`   | Head-to-head comparison of two players.                                                                                                                             |
| `/recent [limit]`            | Latest personal-best improvements server-wide.                                                                                                                      |

Linking is trust-based — there is no verification, which is fine for a
friend-group server. Only linked players appear in user-based commands and get
rank roles.

## Requirements

- A CS2 server with SharpTimer v0.4.0 (or compatible) writing to
  **PostgreSQL** (recommended) or MySQL (experimental, see
  [MySQL support](#mysql-support-experimental)).
- Network access to that database from wherever the bot runs.
- A Discord server where you have permission to add bots.
- Node.js 22+ — or Docker, if you prefer containers.

## Setup

### 1. Create the Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and click **New Application**.
2. Under **Bot**, click **Reset Token** and copy the token — this becomes
   `DISCORD_TOKEN`. Keep it secret.
3. No privileged gateway intents are required — the bot works with the default
   intents, so you can leave all three toggles off.
4. Under **Installation** (or OAuth2 → URL Generator), create an invite URL
   with the `bot` and `applications.commands` scopes and these bot
   permissions:
   - **Manage Roles** (for the rank roles)
   - **View Channels**, **Send Messages**, **Embed Links**,
     **Read Message History** (for the leaderboard channel)

   That combination is the permissions integer `268520448`.

5. Open the invite URL and add the bot to your server.
6. In Discord, enable **Settings → Advanced → Developer Mode**, then
   right-click your server → **Copy Server ID** (`DISCORD_GUILD_ID`) and the
   leaderboard channel → **Copy Channel ID**
   (`DISCORD_LEADERBOARD_CHANNEL_ID`).

For the rank roles to work, the bot's own role must be **above** the rank
roles in the server's role list (Server Settings → Roles). Roles the bot
creates are added at the bottom, so this usually just works — but if you
reorder roles, keep the bot's role on top of them.

### 2. Configure the bot

```
cp .env.example .env
```

Fill in the values. Every option is documented in
[`.env.example`](.env.example); this is the complete reference:

| Variable                         | Default                   | Description                                                                                                  |
| -------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `DISCORD_TOKEN`                  | —                         | Bot token from the developer portal.                                                                         |
| `DISCORD_GUILD_ID`               | —                         | The server the bot operates in.                                                                              |
| `DISCORD_LEADERBOARD_CHANNEL_ID` | —                         | Channel for the auto-updating leaderboard message.                                                           |
| `DB_DIALECT`                     | `postgres`                | `postgres` or `mysql` (experimental).                                                                        |
| `DB_HOST`                        | `localhost`               | Database host.                                                                                               |
| `DB_PORT`                        | `5432` / `3306`           | Database port (default depends on the dialect).                                                              |
| `DB_NAME`                        | —                         | Name of the SharpTimer database.                                                                             |
| `DB_USER`                        | —                         | Database user. Needs read access to the SharpTimer tables and rights to create the bot's own `bot_*` tables. |
| `DB_PASSWORD`                    | —                         | Database password.                                                                                           |
| `DB_TABLE_PREFIX`                | _(empty)_                 | Table prefix, if SharpTimer was configured with one.                                                         |
| `RECORDS_STYLE`                  | `0`                       | SharpTimer style that counts (0 = normal).                                                                   |
| `RECORDS_MODE`                   | `Standard`                | SharpTimer mode that counts.                                                                                 |
| `SCORING_BASE_POINTS`            | `20`                      | Flat completion bonus per finished map.                                                                      |
| `SCORING_POT_PER_FINISHER`       | `15`                      | Competition pot per additional finisher.                                                                     |
| `SCORING_RANK_WEIGHT`            | `0.5`                     | Weight of the rank score.                                                                                    |
| `SCORING_TIME_WEIGHT`            | `0.5`                     | Weight of the time score.                                                                                    |
| `SCORING_OUTLIER_CAP`            | `3.0`                     | Slowest time is capped at this multiple of the fastest.                                                      |
| `SCORING_BONUS_WEIGHT`           | `0.25`                    | Points weight of bonus tracks.                                                                               |
| `SYNC_INTERVAL_SECONDS`          | `60`                      | How often the leaderboard and roles are refreshed.                                                           |
| `ROLES_ENABLED`                  | `true`                    | Master switch for role syncing.                                                                              |
| `ROLES_MODE`                     | `top10`                   | `every-rank`, `top3`, `top10` or `bundled` (see below).                                                      |
| `ROLES_NAME_TEMPLATE`            | `Surf #{rank}`            | Role name template; `{rank}` is replaced with the rank.                                                      |
| `ROLES_SET_COLORS`               | `true`                    | Whether the bot manages role colors.                                                                         |
| `ROLES_COLORS`                   | `#ffd700,#c0c0c0,#cd7f32` | Colors for the roles in rank order; roles beyond the list stay colorless.                                    |
| `ROLES_HOIST`                    | `false`                   | Show role members separately in the member list.                                                             |

Values containing a `#` must be quoted, because an unquoted `#` starts a
comment in a `.env` file. This affects `ROLES_NAME_TEMPLATE` and
`ROLES_COLORS`:

```
ROLES_NAME_TEMPLATE="Surf #{rank}"
ROLES_COLORS="#ffd700,#c0c0c0,#cd7f32"
```

Without the quotes the template silently becomes `Surf`, and every ranked
player ends up with the same role. The bot logs a warning on startup when the
template has no `{rank}` placeholder.

The bot creates its own tables (`bot_steam_links`, `bot_messages`,
`bot_migrations`) in the same database on first start. SharpTimer's tables are
never written to.

### 3. Run it

With Docker:

```
docker compose up -d --build
```

Without Docker:

```
npm ci
npm run build
npm start
```

On startup the bot registers its slash commands in your server, posts the
leaderboard message and starts the sync loop. For development there is
`npm run dev` (watch mode), `npm test` and `npm run lint`.

## Scoring

Points are recomputed from the current database state on every sync — there is
no separate points history, and configuration changes apply retroactively.

Each map (and each bonus) is scored on its own. With `N` finishers, rank `r`,
your time `T_you`, the winning time `T_first` and the slowest counted time
`T_last` (capped at `SCORING_OUTLIER_CAP × T_first` so one very slow run does
not distort the scale):

```
base       = SCORING_BASE_POINTS
pot        = SCORING_POT_PER_FINISHER × (N - 1)
rank_score = (N - r) / (N - 1)            # 1.0 for #1, 0.0 for the last
time_score = (T_last - T_you) / (T_last - T_first), clamped to [0, 1]
map_points = base + pot × (RANK_WEIGHT × rank_score + TIME_WEIGHT × time_score)
```

Bonus tracks award `SCORING_BONUS_WEIGHT` (default 25%) of their map points.
A map with a single finisher pays just the base points. Ties share a rank (the
next rank is skipped), and a player's total is the sum over all maps and
bonuses.

The upshot: finishing a map always pays something, beating more people pays
more, and both your placement and how close your time is to the record matter.

## Rank roles

The bot assigns Discord roles that mirror the leaderboard. `ROLES_MODE`
selects one of four layouts:

| Mode         | Roles                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `every-rank` | One role per rank: `Surf #1`, `Surf #2`, `Surf #3`, ... for everyone.                                                                             |
| `top3`       | `Surf #1`–`Surf #3`; everyone else has no rank role.                                                                                              |
| `top10`      | `Surf #1`–`Surf #10`.                                                                                                                             |
| `bundled`    | Individual `Surf #1`–`Surf #3`, then the fixed tiers **Top Ten** (4–10), **Top 100** (11–100), **Top 500** (101–500) and **Top 1000** (501–1000). |

Missing roles are created automatically with the configured colors
(`ROLES_COLORS`, applied in rank order) and hoist flag, and are re-colored
when you change the configuration. Roles are only added or removed when a
player's rank actually changes, to stay well within Discord's rate limits.

Things worth knowing:

- Only linked players get roles (see `/link`).
- With `every-rank` and many active players you can hit Discord's 250-role
  limit and a lot of role churn — prefer `top10` or `bundled` on busier
  servers.
- If you change `ROLES_NAME_TEMPLATE` (or switch away from `bundled`), roles
  created under the old naming are orphaned and must be deleted by hand; the
  bot never deletes roles.
- If the bot lacks the Manage Roles permission (or its role is below the rank
  roles), role sync pauses with a log warning until that is fixed.

## MySQL support (experimental)

PostgreSQL is the primary supported database. The MySQL dialect is wired up
and covered by an automated smoke test (schema + seed data on MySQL 8, all
bot queries and table migrations) — but it has seen far less real-world use,
so it is labeled experimental. Set `DB_DIALECT=mysql` to use it; the bot logs
a reminder at startup. Feedback and bug reports are welcome.

## Notes

- `/recent` shows recent personal-best _improvements_: SharpTimer stores only
  the current PB per player and map, not a full run history.
- The leaderboard message is edited in place and survives restarts; if someone
  deletes it, the bot posts a new one on the next sync.
