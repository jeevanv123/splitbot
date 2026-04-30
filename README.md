# Splitbot

Open-source WhatsApp bot that splits group expenses with AI-powered bill scanning
and one-tap UPI settle-up. Self-hostable, free, no signups for group members.

## Why

Splitwise charges per-day add limits on free; everyone has to install + sign up.
Splitbot lives in your existing WhatsApp group: drop a bill photo, talk to the bot
in plain English, settle in GPay/PhonePe with one tap.

## Quick start

```bash
git clone https://github.com/<user>/splitbot
cd splitbot
cp .env.example .env       # set ANTHROPIC_API_KEY
npm install
npm run db:migrate
npm start                   # scan QR with WhatsApp → done
```

## Database

v1 uses SQLite by default (zero-config). The `DATABASE_URL` env var is reserved
for a future Postgres adapter, but Postgres migrations need to be generated
against a parallel `pg-core` schema (drizzle-kit cannot retranslate the SQLite
schema across dialects). Postgres support is planned for phase 2; for now, run
with SQLite.

## Commands

- `/split <amount> <description> [with @u1 @u2] [except @u3]` — manual split
- Drop a bill photo → bot itemizes; reply "Anu had pasta, Rohit had pizza"
- `/balance` — your net balance per group
- `/settle` — one-tap UPI deep-links for who you owe
- `/upi <upi-id>` — set your UPI ID (one-time)
- `/paid @user <amount>` — mark a settlement done
- `/bills` — list pending bills in this group
- `/help` — usage guide

## ⚠️ Notice

Splitbot uses the unofficial WhatsApp Web protocol via Baileys. This is against
WhatsApp's ToS for high-volume use. Personal/small-group usage is generally fine
but accounts can be banned at Meta's discretion. Use a secondary number if you're
risk-averse. Phase 2 will add the official WhatsApp Cloud API as an alternative.

## License

MIT
