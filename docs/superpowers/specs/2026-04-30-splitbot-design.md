# Splitbot — Design Spec

**Date:** 2026-04-30
**Status:** Approved (brainstorm phase complete; awaiting implementation plan)
**Owner:** jeevan@hirequotient.com

## 1. Problem & Wedge

Splitwise is the dominant expense-splitting app, but it has two friction points that hurt
adoption — especially in India:

- **Onboarding tax:** every group member must install the app, sign up, and accept an
  invite. Drop-off is high. The 5th friend never installs.
- **Paywall:** the free tier limits new expenses per day, pushing users toward the paid
  Pro plan.

Splitbot is an open-source, free, self-hostable WhatsApp bot that splits group expenses
through natural conversation. The wedge:

- **Distribution:** WhatsApp groups already exist. The bot joins the existing group; no
  one installs anything.
- **Identity:** sender's phone number is the user identity — zero signup.
- **Settlement rail:** UPI deep-links — one tap settles in GPay/PhonePe/Paytm.
- **Magic input:** drop a bill photo, talk to the bot in natural language, it figures out
  the split.

These three together are the moat. Splitwise is a US-built app on a different rail; it
cannot easily replicate the WhatsApp-native + UPI-native experience.

## 2. Scope

### In scope (v1)

- WhatsApp bot via Baileys (unofficial WA Web protocol, free, personal number).
- Slash commands: `/split`, `/balance`, `/settle`, `/upi`, `/bills`.
- Image auto-trigger: drop bill in group → bot itemizes via Claude vision → user assigns
  items in natural language → bot computes split.
- Persistent bill drafts (no expiry — users can return days later).
- Zero-ID UX: bot resolves which draft a free-text reply refers to, automatically.
- Debt simplification (greedy min-cash-flow).
- UPI settle-up deep links.
- SQLite default; Postgres optional via `DATABASE_URL`.
- Single-command self-host (`npm install && npm start`).
- Docker compose for users who prefer containers.

### Out of scope (v1)

- Web dashboard (planned for phase 2).
- Meta WhatsApp Cloud API adapter (planned for phase 2; architecture leaves room).
- Hosted multi-tenant SaaS.
- Mobile apps.
- Recurring expenses, currency conversion, notifications/reminders.
- Analytics beyond `/balance`.
- UPI Collect requests (deep-links only).

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 20+, TypeScript | Most mature WA libraries are Node; team is comfortable |
| HTTP | Fastify | Health endpoint + future webhook adapter; lightweight |
| WhatsApp | `@whiskeysockets/baileys` | Best-in-class unofficial WA Web library |
| LLM | Claude `claude-sonnet-4-6` via `@anthropic-ai/sdk` | Vision + chat in one provider; cost/quality balance |
| DB | SQLite (default), Postgres (optional) | Zero-config self-host; scales to hosted |
| ORM | Drizzle | Lightweight, SQL-first, supports both DBs natively |
| Validation | Zod | Env, command args, LLM JSON outputs |
| Tests | Vitest | Fast, native ESM, good DX |
| Lint/format | ESLint + Prettier | Standard |
| License | MIT | Maximally permissive for OSS |

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  splitbot (single process)              │
│                                                          │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │  wa/       │──>│  router/     │──>│  handlers/   │  │
│  │ (Baileys)  │   │ (msg parser) │   │  /split etc. │  │
│  └────────────┘   └──────────────┘   └──────┬───────┘  │
│                                              │          │
│  ┌────────────┐   ┌──────────────┐   ┌──────▼───────┐  │
│  │ Fastify    │   │  services/   │<──│  repo/       │  │
│  │ (health)   │<──│ split,       │   │  (Drizzle)   │  │
│  └────────────┘   │ vision,      │   └──────┬───────┘  │
│                   │ intent       │          │          │
│                   └──────┬───────┘          │          │
│                          │                   │          │
│                  ┌───────▼──────┐    ┌──────▼───────┐  │
│                  │ Anthropic    │    │ SQLite /     │  │
│                  │ Claude       │    │ Postgres     │  │
│                  └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Modules

| Module | Responsibility | Public contract |
|---|---|---|
| `wa/` | Baileys connection, QR auth, message events. Only module that knows about Baileys. | Emits `IncomingMessage` events; exposes `send(msg)` |
| `router/` | Parse incoming, decide which handler to invoke | `route(msg) → Handler` |
| `handlers/` | One file per command/event: `split`, `balance`, `settle`, `upi`, `bills`, `image`, `freeText` | `handle(ctx, args) → Reply[]` |
| `services/split/` | Pure split math; debt simplification | `simplify(balances) → Settlement[]` |
| `services/vision/` | Claude vision: image → bill draft | `extractBill(buffer) → BillDraft` |
| `services/intent/` | Claude chat: free-text + draft → assignments OR draft resolution | `assignItems(...)`, `resolveDraft(...)` |
| `repo/` | Drizzle queries — typed CRUD over users, groups, expenses, splits, drafts | per-table modules |
| `upi/` | Build `upi://pay?...` deep links | `buildUpiLink(args) → string` |
| `config/` | Env loading, validation (Zod) | typed `config` export |

### Boundary discipline

- Only `wa/` imports Baileys. Swapping in WhatsApp Cloud API later means a second adapter
  in `wa/` with the same `IncomingMessage` shape.
- Only `services/vision` and `services/intent` import the Anthropic SDK. Swapping LLM
  providers means changing those two files.
- Handlers depend on repo + services, never on DB or LLM directly.
- WA connection NEVER dies from a downstream error — every handler call is wrapped in
  try/catch at the router boundary.

## 5. Data Model

All amounts stored as **paise** (integers) to avoid float precision issues.

```
users                groups               expenses
─────                ──────               ────────
id (E.164 phone)     id (WA JID)          id
display_name         name                 group_id (FK)
upi_id?              created_at           paid_by_user_id (FK)
created_at                                amount_paise
                                          description
                                          source ('slash' | 'image')
                                          draft_id? (FK)
                                          created_at

splits               bill_drafts
──────               ───────────
id                   id
expense_id (FK)      group_id (FK)
user_id (FK)         uploader_id (FK)
share_paise          items_json (Bill JSON)
settled_at?          image_path?
                     status ('pending' | 'assigned' | 'cancelled')
                     created_at
                     assigned_at?
                     expense_id? (FK, set when assigned)
```

- `users.id` = phone number in E.164 (e.g. `+919876543210`). No signups.
- `groups.id` = WhatsApp JID for the group.
- `bill_drafts` persist forever — no TTL, per user request. User can resume any pending
  draft at any time.

## 6. Core Flows

### 6.1 Slash split

```
User: /split 600 cab from airport with @jeevan @rohit

router parses: amount=60000p, desc="cab from airport",
               payer=Anu (sender), with=[Jeevan, Rohit, Anu]
              (payer always implicitly included unless excluded)

handler:
  - upsert users (Anu, Jeevan, Rohit) by phone
  - upsert group
  - create expense (paid_by=Anu, amount=60000p, source='slash')
  - create 3 splits (Anu 20000p, Jeevan 20000p, Rohit 20000p)

bot replies in group:
  "✅ Split ₹600 (cab from airport)
   • Anu paid ₹600
   • Jeevan owes Anu ₹200
   • Rohit owes Anu ₹200
   Group total: ₹1,840 across 4 expenses. /balance to see who owes what."
```

### 6.2 Image auto-trigger + draft resolution

```
Step 1 — User drops image:
  Rohit drops bill.jpg in group
  → wa/ downloads image, emits IncomingImage event
  → vision service: Claude vision call with structured-output prompt
  → returns BillDraft: { items, tax, tip, total, currency }
  → bill_drafts row inserted (status='pending')
  → bot posts reply:
    "📋 I see ₹2,840 — pasta ₹620, pizza ₹780, wine ₹900, dessert ₹240, tax ₹300.
     Reply when you're ready: 'who had what?'"

Step 2 — User replies (could be minutes or days later):
  Rohit: "Anu pasta+wine, me pizza, Jeevan everything else"

  Resolution logic:
    Pull all of Rohit's pending drafts in this group.
    a. If 0 drafts: not a draft assignment. Falls through.
    b. If 1 draft: auto-assign to it.
    c. If 2+ drafts: Claude classifier — which draft does this message refer to?
       - High confidence (item-name match): silently assign, confirm by description:
         "✅ Treating this as Friday's Olive bill (₹2,840). Say 'undo' to switch."
       - Low confidence: bot asks naturally:
         "You have 2 pending bills — Friday's Olive (₹2,840) and Saturday's cab
          (₹1,200). Which one are you splitting?"
         → Rohit replies in any form ("Olive" / "Friday" / "the dinner")
         → Claude resolves the reference, then assigns.

  Once draft is locked:
    intent service: Claude call with bill items + assignment text
    → returns assignments: [{user, items, share_paise}]
    → expense created (source='image', draft_id=N)
    → splits created
    → draft.status='assigned', draft.expense_id set

  bot confirms:
    "✅ Split done for Friday's Olive bill (₹2,840):
     • Rohit paid ₹2,840
     • Anu owes ₹1,520 (pasta + wine + share of tax)
     • Rohit's share: ₹780 (pizza + tax share)
     • Jeevan owes ₹540 (dessert + share of tax)
     /balance to see totals."
```

### 6.3 Settle-up

```
User: /settle (in group OR DM to bot)

repo: pull all unsettled splits, compute net balances per user
services/split: greedy min-cash-flow → settlements[]
upi: for each (debtor, creditor, amount) — build upi:// link if creditor has upi_id

bot replies (DMs the requester to keep group clean):
  "Group: Goa Trip
   You owe ₹450 to Anu — tap: upi://pay?pa=anu@okhdfc&am=450&tn=Splitbot
   You owe ₹120 to Rohit — tap: upi://pay?pa=rohit@ybl&am=120&tn=Splitbot
   Anu owes ₹200 to Jeevan — (Anu doesn't have UPI set; tell them /upi)"

After payment, user types /paid @anu 450 → marks splits settled.
(MVP: manual confirm. Phase 2: detect UPI confirmation messages.)
```

### 6.4 Other commands

- `/balance` — DM the requester their net balance per group.
- `/upi <upi_id>` — set/update own UPI ID. Validation: matches `^[\w.-]+@[\w.-]+$`.
- `/bills` — list this group's pending drafts in human-readable form (no IDs).
- `/paid <@user> <amount>` — mark splits as settled after a UPI transfer (manual confirm
  in v1; auto-detection deferred to phase 2).
- `/help` — usage guide.

### 6.5 Slash command grammar (v1)

```
/split <amount> <description> [with @u1 @u2 …] [except @u1]
```

- `<amount>` — integer or decimal rupees. Stored as paise.
- `with` — explicit participant list. If omitted, all group members participate.
- `except` — explicitly exclude a participant (typically used to exclude the payer who
  doesn't owe themselves anything but was not the one consuming).
- The payer (sender) is implicitly included unless listed in `except`.

Exact parser grammar (regex vs hand-rolled vs LLM fallback) is decided in the
implementation plan; this spec just locks the surface syntax.

### 6.6 Non-bill images

Vision service prompt explicitly asks Claude to return `{ is_bill: false, reason: "..." }`
when the image isn't a receipt/bill (memes, photos, screenshots of chats, etc.). In that
case the handler:

- Does NOT create a draft.
- Does NOT reply in the group (avoid noise on every random photo).
- Logs at `debug` level for observability.

Threshold: only proceed to draft creation if `is_bill: true` AND `total > 0`.

## 7. Debt Simplification

Greedy min-cash-flow algorithm:

1. Compute net balance per user in group: `sum(paid) - sum(owed)`.
2. Separate creditors (positive net) and debtors (negative net).
3. Sort both by absolute amount.
4. Match max creditor with max debtor; settle `min(abs(c), abs(d))`. Update both.
5. Remove anyone whose net is now 0; repeat until empty.

Result: at most N-1 settlements for N users. Pure function. Property tests:
- Total settled = total debt.
- No negative settlements.
- ≤ N-1 transfers.
- All final balances = 0.

## 8. Error Handling

| Failure | Handling |
|---|---|
| Baileys disconnect | Auto-reconnect with exponential backoff. Auth keys persisted to `auth/`. |
| Claude vision failure | Bot suggests clearer photo or `/split` manually. No draft created. |
| Claude intent failure | Bot says "I didn't catch that"; draft stays pending. |
| Malformed slash command | Inline usage example. |
| Missing UPI ID at settle | Settle still computes. Bot notes "no UPI for X — they need /upi". |
| Image too large/wrong format | Reject before vision call (>5MB or non-image MIME). |
| Image is not a bill (meme, photo) | Vision returns `is_bill: false` → silently ignored, no group reply. |
| DB write failure | Repo throws typed error; handler returns user-facing apology. |
| Unknown error | Caught at router boundary. Generic apology to user. Stack to logs. |

**Invariant:** the WA connection MUST NEVER die from a downstream error.

## 9. Testing Strategy

| Layer | Strategy | Bar |
|---|---|---|
| Pure functions (split math, UPI builder, parsers) | Vitest unit tests; property tests for split | 100% coverage of branches |
| Repo | Vitest with in-memory SQLite per test | Each query function tested |
| Handlers | Vitest with mocked repo + mocked LLM | Happy + 2-3 error paths each |
| Vision/intent | Vitest with recorded fixtures | Happy path + 2 malformed inputs |
| WA layer | Manual smoke (Baileys is hard to mock cleanly) | QR flow + round-trip |
| End-to-end | `scripts/e2e.ts` simulates a group conversation against in-memory bus | Cover: split, image+assign, draft resolution, balance, settle |

## 10. Self-Host Story

```bash
git clone https://github.com/<user>/splitbot
cd splitbot
cp .env.example .env       # set ANTHROPIC_API_KEY
npm install
npm run db:migrate
npm start                   # scan QR → done
```

`.env.example`:

```
ANTHROPIC_API_KEY=          # required
DATABASE_URL=               # blank → SQLite at ./data/splitbot.db
SENTRY_DSN=                 # optional
LOG_LEVEL=info
```

Distributables:

- `Dockerfile` + `docker-compose.yml` (Postgres + bot in one command).
- PM2 ecosystem file for VPS users.
- README with setup walkthrough, ban-risk disclaimer, contribution guide.

## 11. Repo Layout

```
splitbot/
├── README.md
├── LICENSE                       # MIT
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── drizzle.config.ts
├── docs/
│   └── superpowers/specs/2026-04-30-splitbot-design.md   ← this doc
├── src/
│   ├── index.ts                  # entry point
│   ├── config/
│   ├── wa/
│   │   ├── baileys.ts
│   │   └── types.ts
│   ├── router/
│   ├── handlers/
│   │   ├── split.ts
│   │   ├── balance.ts
│   │   ├── settle.ts
│   │   ├── upi.ts
│   │   ├── bills.ts
│   │   ├── image.ts
│   │   ├── freeText.ts
│   │   └── help.ts
│   ├── services/
│   │   ├── split/
│   │   │   ├── simplify.ts
│   │   │   └── simplify.test.ts
│   │   ├── vision/
│   │   │   └── extractBill.ts
│   │   └── intent/
│   │       ├── assignItems.ts
│   │       └── resolveDraft.ts
│   ├── repo/
│   │   ├── schema.ts
│   │   ├── users.ts
│   │   ├── groups.ts
│   │   ├── expenses.ts
│   │   ├── splits.ts
│   │   └── drafts.ts
│   └── upi/
│       └── buildLink.ts
├── tests/                        # cross-module / integration
├── scripts/
│   └── e2e.ts
├── drizzle/                      # generated migrations
├── data/                         # SQLite file lives here (gitignored)
└── auth/                         # Baileys auth state (gitignored)
```

## 12. Phasing

**Phase 1 (this spec):** Baileys + slash commands + image flow + UPI settle-up.

**Phase 2 (future):**
- WhatsApp Cloud API adapter (second `wa/` impl).
- Web dashboard (read-only first: balances, history, settle-up).
- UPI confirmation detection (auto-mark settlements paid).
- Recurring expenses.
- Notifications.

## 13. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Meta bans the user's WA number | Medium | README disclaimer; recommend secondary number; design Cloud API path for phase 2. |
| Claude API cost exceeds expectations | Low-Medium | Vision call only on image; intent call only on free-text in groups with pending drafts; both tightly scoped. Add per-user rate limiting if needed. |
| Users don't set UPI IDs | High | First settle-up DM nudges; bot proactively asks after first settle-up. |
| Bill OCR accuracy on Indian receipts | Medium | Claude vision is robust; fallback path is "use /split manually". User can correct with one message ("actually pasta was 580"). |
| Bot acts on messages it shouldn't | Medium | Slash + image triggers only — no always-listening LLM. Free-text resolves only in groups with pending drafts from the same user. |

## 14. Open Questions (deferred to plan/implementation phase)

- Exact Claude prompt structure for vision and intent calls (will be iterated against
  real bills during implementation).
- Drizzle migration strategy across SQLite ↔ Postgres dialect differences (likely OK with
  Drizzle's abstractions; verify during implementation).
- Group-add detection (when bot is added to a new group, should it post a welcome
  message? — proposed yes, brief).
