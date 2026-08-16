# Surf Discord Bot

A Discord bot for CS2 surf servers running the SharpTimer plugin. It reads the
records straight from your SharpTimer database (read-only) and turns them into
a competition on Discord:

- **Points system** — every map and bonus awards points based on rank and time
  relative to the other finishers, so beating your friends actually pays off.
- **Live leaderboard** — an auto-updating ranking embed in a channel of your
  choice.
- **Rank roles** — Discord roles that follow the leaderboard (several modes,
  from one-role-per-rank to bundled tiers).
- **Slash commands** — link your Steam account and explore records: your rank,
  map leaderboards, world records, head-to-head comparisons, maps with the most
  points to gain, and more.

> The bot is under active development; this README will grow into a full setup
> guide.

## Requirements

- A CS2 server with SharpTimer v0.4.0 (or compatible) writing to PostgreSQL.
  MySQL support is prepared but currently experimental.
- Read access to that database from wherever the bot runs.
- A Discord application with a bot token
  ([Discord Developer Portal](https://discord.com/developers/applications)).
- Node.js 22+ — or Docker, if you prefer containers.

## Quick start

```
cp .env.example .env   # then fill in the values
```

All configuration happens through environment variables; `.env.example`
documents every option, its default, and what it does.

### Docker

```
docker compose up -d --build
```

### Without Docker

```
npm ci
npm run build
npm start
```

For development: `npm run dev` (watch mode), `npm test`, `npm run lint`.
