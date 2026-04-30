# Splitbot

Open-source **Telegram** bot that splits group expenses with AI bill scanning and one-tap UPI settle-up. Self-hostable, free, no signups for group members.

## Why

Splitwise charges per-day add limits on the free tier and requires every group member to install + sign up. Splitbot lives in your existing Telegram group: drop a bill photo, talk to the bot in plain English, settle in GPay/PhonePe with one tap.

## Quick start

### Local

```bash
git clone https://github.com/<user>/splitbot
cd splitbot
cp .env.example .env       # set TELEGRAM_BOT_TOKEN and ANTHROPIC_API_KEY
npm install
npm run db:migrate
npm run build
npm start                   # bot polls Telegram for messages
```

Get your bot token from [@BotFather](https://t.me/BotFather) on Telegram (`/newbot`).

### Docker

```bash
cp .env.example .env       # set TELEGRAM_BOT_TOKEN and ANTHROPIC_API_KEY
docker compose up
```

### Postgres (optional)

By default Splitbot uses SQLite at `./data/splitbot.db`. To use Postgres:

```bash
DATABASE_URL=postgres://splitbot:splitbot@postgres:5432/splitbot \
  docker compose --profile postgres up
```

> Note: Postgres support is wired through `DATABASE_URL` but the migrations are SQLite-flavored in v1. A parallel `pg-core` schema and Postgres migrations are planned for phase 2. For now, run with SQLite.

## LLM provider

Splitbot supports two ways to call Claude:

**Anthropic API (default)** — set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=sk-ant-...`. Get a key at https://console.anthropic.com.

**AWS Bedrock** — set `LLM_PROVIDER=bedrock` and `AWS_REGION=us-east-1` (or whatever region you've enabled Claude models in). AWS credentials come from the standard AWS chain (env vars, `~/.aws/credentials`, or an IAM role). You'll need to enable Anthropic Claude models in your Bedrock console first.

You can override the model id with `CLAUDE_MODEL=...` if you want a non-default Claude version.

## Database

Splitbot v1 uses SQLite by default (zero-config, perfect for self-host). Set `DATABASE_URL=postgres://...` to use Postgres in the future once the parallel pg schema lands (phase 2).

## Add the bot to a Telegram group

1. Talk to [@BotFather](https://t.me/BotFather), `/newbot`, get a bot token.
2. Set `TELEGRAM_BOT_TOKEN` in your `.env` and start Splitbot.
3. In Telegram, add your bot to a group. (Recommended: also `/setprivacy` → Disable in @BotFather so the bot can read all group messages, not just commands.)
4. Use the commands below.

## Commands

```
/split <amount> <description> [with @u1 @u2] [except @u3]
   e.g. /split 600 cab from airport
/balance      Your net balance in this group
/settle       UPI deep-links for who you owe
/upi <id>     Save your UPI id (one-time)
/paid @u <amt> Mark a settlement done after paying
/bills        List pending bill drafts in this group
/help         Show usage
```

Drop a bill photo → bot itemizes; reply in plain English ("Anu had pasta, Rohit had pizza") and bot computes the split.

## Architecture

See [`docs/superpowers/specs/2026-04-30-splitbot-design.md`](docs/superpowers/specs/2026-04-30-splitbot-design.md). Note: the spec was originally WhatsApp-focused; the project pivoted to Telegram. The `src/tg/` adapter replaces the planned `src/wa/` module. All other modules (parser, repos, services, handlers, router) are platform-agnostic and unchanged.

## Contributing

PRs welcome. Run `npm test` before opening one. Open an issue first for non-trivial changes.

## License

MIT
