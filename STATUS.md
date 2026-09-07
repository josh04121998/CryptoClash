# CRYPTO CLASH — Status

### Last updated: 2026-09-07 (session 5)

---

This is a living document — read it for "where are we right now," and read `spec.md` / `batlleSpec.md` / `architecture.md` for "what are we building toward." Update this file, don't accumulate a second one, whenever a milestone lands or the plan changes.

# 0. Project Direction (read this first)

The end goal, per the user (2026-09-04): **bring the Pokémon-collectibles experience on-chain** — collecting/chasing rarity is the *main* draw, not a side layer bolted onto a card game. Battle gameplay (engine, factions, matches) is the vehicle; the thing players are meant to get hooked on is owning, showing off, and trading cards.

Go-to-market is crypto-native: launch via a token, acquire early users from the crypto/Web3 community rather than a broad mainstream audience first. Consequence: **wallet-connect is the primary identity system from day one** (not email/social-first-then-wallet-later, which is what `architecture.md` Section 9 originally recommended — see Section 5 below for that reconciliation). Guiding principle from the user: *least possible friction to just play* — no login wall in front of Play vs AI or Play Online; a wallet is only asked for the moment something needs to persist (a saved deck, eventually a collection/NFT).

Explicit non-goal: literal Hearthstone production values (painted art, voice, orchestral audio, live-ops team) — not achievable solo/small-team and not the point. The bar is "complete, fun, well-balanced, genuinely collectible," not "AAA."

---

# 1. What Exists Right Now

A monorepo (npm workspaces) with four packages, all live and deployed:

| Package | Role | Status |
|---|---|---|
| `engine/` | Headless, deterministic battle engine | Core systems complete |
| `shared/` (`@cryptoclash/protocol`) | Client/server wire format + (de)serialization | Complete for current scope |
| `server/` | WebSocket match server + accounts/decks REST API | Working, deployed (API needs prod DB env vars — see Section 4) |
| `client/` | React web app (mobile-responsive) | Two play modes + wallet-connect + deck builder live |

**Live deployments:**
- Client: `crypto-clash-client-six.vercel.app` (Vercel, auto-deploys on push to `main`, Root Directory `client`)
- Match server: `vivacious-passion-production-1a17.up.railway.app` (Railway, auto-deploys on push to `main`, Root Directory repo root)
- Repo: `github.com/josh04121998/CryptoClash`
- **Now live in production** (2026-09-05): Railway Postgres provisioned, migration applied, `DATABASE_URL`/`JWT_SECRET`/`SIWE_DOMAIN`/`CLIENT_ORIGIN` set on the `vivacious-passion` Railway service. Verified end-to-end against the deployed site with a scripted wallet (Playwright + a mock EIP-1193 provider signing with `ethers`, since there's no real MetaMask in a headless run): connect wallet → SIWE sign/verify → build a legal 30-card deck → save → persists. Found and fixed one real bug in the process: `client/src/api.ts`'s `apiUrl()` didn't strip a trailing slash from `VITE_SERVER_URL`, so `${apiUrl()}${path}` produced a double slash that 404'd before the server's CORS headers could attach — every `/api/*` call from the browser was silently failing with a CORS error, not the `503` the missing-env-var path would give. Fixed by stripping trailing slashes in `apiUrl()` regardless of how the env var is set.

**Test coverage:** 42 engine tests, 29 server tests (15 always run; 14 are real-Postgres integration tests that skip gracefully without `DATABASE_URL`, verified green against a live local Postgres this session), all passing. Client type-checks clean and builds clean. No test suite for `shared` (it's pure data transforms, covered indirectly by the server integration tests).

---

# 2. Battle Engine (`engine/`)

Implements batlleSpec.md's full "First Prototype" checklist (Section 32), **Items included**:

- Turn loop: Energy (1→10, refills each turn), Draw, Play, Attack, End
- 5-slot board with adjacency (Section 5/8) — auras key off it (Moon Dog's "+1 Attack while next to another Doggo")
- Creatures, Spells, **and Items** (equip-style buffs/keyword grants — see below)
- All five launch keywords (Section 11): **Rush**, **Guard**, **Stealth**, **Burn**, **HODL**
- **Volatility & all five Market Events** (Sections 16-18): MARKET_CRASH, PUMP, LIQUIDATION, FOMO, BLACK_SWAN
- Fatigue (escalating damage on empty-deck draw), hand size cap
- Server-authoritative by construction: the engine is pure/deterministic (`seed` + ordered `Intent`s → identical result every time), so replay/anti-cheat (Section 31) falls out for free — `state.log` already is that replay

**Card pool:** 60 templates. All six spec.md Section 6 factions now have real depth and their own standalone 30-card deck (`cards.ts`, indexed by `DECKS`/`getDeck()`):

| Faction | Deck export | Signature mechanic |
|---|---|---|
| Doggos | `SAMPLE_DECK` | Swarm/adjacency (existing) |
| Frogs | `FROG_SAMPLE_DECK` | `copyRandomFriendly` — copy a random friendly creature |
| Builders | `BUILDER_SAMPLE_DECK` | `draw` — card advantage/combo |
| Degens | `DEGEN_SAMPLE_DECK` | `damage` targeted at `selfPlayer` — pay your own HP for power |
| Crypto Bros | `CRYPTOBRO_SAMPLE_DECK` | `gainEnergy` (this-turn burst) / `gainMaxEnergy` (permanent ramp) |
| Normies | `NORMIE_SAMPLE_DECK` | `heal` — steady, defensive toolkit |

Plus **5 Neutral Items** (`buffTarget` for permanent +stat upgrades, `grantKeywordTarget` for temporary Rush/Guard grants — Guard/Rush are the only keywords `combat.ts` checks generically via `keywords ∪ tempKeywords`, so those are the only two safe to grant this way).

**New this session:** every non-token template now carries a `rarity` (spec.md Section 13's tiers — Common through Genesis), assigned by a simple cost-based heuristic (cost 0-1→Common, 2→Uncommon, 3→Rare, 4→Epic, 5→Legendary; no current template uses Mythic/Genesis, reserved for scarcer future content). It's gameplay-adjacent metadata only — never read by combat/effect resolution, purely there for pack odds and collection-screen grouping once those exist. The heuristic is a placeholder, not tuned game/economy design — worth revisiting deliberately once packs (roadmap step 5) make rarity's drop-rate role real.

See `card-schema.md` for the full effect DSL (now 10 `EffectAction` kinds), and `engine/README.md` for how to run/extend it.

---

# 3. Client (`client/`)

Two play modes, both live, both fronted by a **deck picker** (`DeckPicker.tsx`) — pick a starter deck, or (if wallet-connected) one of your own saved decks, before a match starts:

- **Play vs AI** — runs the engine directly in the browser against a greedy-heuristic bot (`takeBotTurn`), which now also picks a random deck each match for variety. No backend, no wallet required. This is the permanent practice/tutorial mode, not a placeholder.
- **Play Online** — real matchmaking through the Railway match server; the resolved 30-card list (starter or custom) rides along on the `findMatch` message — the server re-validates it (`validateDeck`) rather than trusting the client, falling back to the default deck if it's missing or illegal.

Board/hand/interaction UI (`MatchView`) is shared between both modes, parameterized by which player is "me," so every fix or feature (the Volatility meter, keyword badges, etc.) applies to both at once. Targeting distinguishes friendly-target cards (Items — click your own board) from enemy-target cards (damage/burn spells — click the opponent's board/portrait), via the shared `targetsFriendlyCreature()` helper (also used by the bot, so it doesn't waste Items targeting the wrong side).

**Wallet-connect + deck builder** (`useWallet.ts`, `DeckBuilder.tsx`, `MyDecksScreen.tsx`; session 3):
- "Connect Wallet" in the top-right of the main menu — [Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361) against any injected browser wallet (MetaMask etc.), verified end-to-end with a real cryptographic signature flow. No login wall anywhere else — every other screen works with no wallet connected.
- Once connected: "My Decks" screen (list/create/edit/delete) and a full deck builder — browse the pool, add/remove with a live `validateDeck()` legality check (exactly 30 cards, max 3 copies, no tokens), save. Saved decks are real Postgres rows, scoped per-wallet, and appear back in the match deck-picker.
- Bundle-size cost: `siwe`/`ethers` (needed for SIWE message construction/signing) added ~670KB gzipped-~95KB to the client bundle, and required a Node `Buffer` polyfill (`vite-plugin-node-polyfills`, scoped to just `buffer`+`process` — deliberately *not* `crypto`, which would've pulled in a vulnerable `elliptic` transitive dependency for a polyfill nothing here needs). Worth revisiting in a later polish pass if load time becomes a concern.

**Session 4 — ownership-gated deck building:** `DeckBuilder.tsx` fetches `/api/collection` on mount and caps every card's addable copies at what the account actually owns (not just the flat 3-copy rule) — a pool card with 0 owned copies renders dimmed and its Add button disables; the sidebar's legality check folds in an ownership check client-side too (mirroring the server's `validateOwnership`), so Save disables proactively instead of round-tripping to a 422. This was invisible in practice at the time (`grantStartingCollection` gave every account the whole pool) — session 5's narrower starting grant is what finally makes it visible.

**New this session (session 5) — Coins + Packs (`PacksScreen.tsx`, `rarityColor.ts`):** a wallet-connected player sees a live 🪙 Coins balance in the app bar and a new "Packs" screen — browse pack definitions (`GET /api/packs`), open one (`POST /api/packs/open`), and watch a staggered reveal (one card flips in every 350ms, not a blank grid dumped instantly — spec.md Section 17 calls this "one of the game's signature moments") with each card's rarity shown as a colored corner dot (`CardFace.tsx`, new `template.rarity` badge). Opening updates the app-bar balance immediately and the newly-owned cards show up un-dimmed back in `DeckBuilder` on the very next visit, no extra fetch/refresh logic needed since it re-reads `/api/collection` on mount. Verified end-to-end in a real Chromium browser (Playwright + a mock EIP-1193 provider signing with `ethers`, same technique as session 4's live-site check — the Claude-in-Chrome extension wasn't connected this session): connected a scripted wallet, saw the 3,000-Coin welcome bonus, opened a Standard Pack, watched all 5 cards reveal and the balance drop to 2,000, then confirmed the pulled cards (`Rapid Prototype`, `Blueprint`, `Glitch Toad` — all Uncommon+) appeared un-dimmed in the deck builder afterward.

**Not yet built:** collection screen (the "digital binder" view — owned/missing by faction/rarity; the ownership *data* now exists via `/api/collection`, just no dedicated screen for it yet). See Section 7.

---

# 4. Accounts, Decks & Collection Backend (`server/`)

Started session 3 (accounts + decks) and extended this session (session 4) with `architecture.md` Section 6's rarity/collectible layer — editions + instances, no `card_templates` table (see Section 6's deviation note in `architecture.md`, same reasoning as `decks.cards`: gameplay identity stays in `CARD_POOL`, nothing duplicates it into Postgres). Lives in the same Railway service as the match server (same "Game Backend" box the architecture doc's own diagram already draws), exposed as `/api/*` REST routes alongside the existing WebSocket endpoint.

- **Schema**, applied via `npm run migrate --workspace=server` (a small hand-rolled runner — no ORM/framework):
  - `0001_accounts_and_decks.sql`: `accounts` (wallet address, lowercased, unique) and `decks` (account-scoped, `cards` as a JSON array, cascade-deletes with the account).
  - `0002_editions_and_instances.sql`: `card_editions` (`template_id` text — a `CARD_POOL` key, not an FK — `edition_type` standard/first_edition/legendary/genesis, unique per template+type) and `card_instances` (`owner_id` → `accounts`, `edition_id` → `card_editions`, both cascade-delete, plus nullable `serial_number`/`onchain_token_id` and an `is_foil` flag for when packs/minting actually populate them).
  - `0003_coins_and_packs.sql` (new this session): `accounts.coins_balance` (a cached running total), `coin_transactions` (append-only audit log — positive amount = earn, negative = spend, both cascade-delete with the account), `pack_openings` (one row per pack pulled: `pack_type`, `coins_spent`, `cards` (the template ids pulled, in reveal order), and the `mulberry32` `seed` the roll used — reproducible and auditable, same determinism-by-construction story as match replays).
- **Auth** (`server/src/auth.ts`): Sign-In with Ethereum — nonce issue/consume (one-time, 5-minute TTL, in-memory), SIWE message verification (`siwe` package) checked against a configured domain (replay/cross-app-reuse protection), session as a signed JWT (`jose`). Fully tested with real ECDSA signing via `ethers.Wallet` — no mocking of the crypto itself. `findOrCreateAccount` (`accounts.ts`) now also returns `isNew` (via Postgres's `xmax = 0` upsert trick) — the welcome-bonus grant's one-time-only gate, see Coins below.
- **Collection** (`server/src/collectionRepo.ts`): `grantStartingCollection` gives every account `MAX_COPIES_PER_CARD` (3) standard-edition instances of every **Common**-rarity template (narrowed this session from "every non-token template" — see Coins/Packs below for why) — called on every sign-in, idempotent (tops up rather than duplicates, so it also back-fills any Common template added to the pool after an account's first sign-in). `getCollectionCounts` aggregates owned copies per template id; `validateOwnership` checks a prospective deck's card counts against them. New this session: `grantCardInstances` — adds exact template ids as new instances (duplicates included, no top-up capping), the shared primitive packs use to actually grant a pull; takes a `PoolClient` so it composes into packsRepo's own transaction.
- **Coins & Packs** (`server/src/coinsRepo.ts`, `server/src/packsRepo.ts`, new this session): `grantWelcomeBonus` credits a new account (gated on `isNew`, not idempotency-checked separately) a flat `WELCOME_BONUS_COINS` (3,000 — a placeholder number, not tuned; there's still no real Coins *earn* loop, since matches aren't tied to authenticated accounts yet). `openPack` is one atomic transaction: locks the account's balance row (`for update`), checks affordability, rolls `PACK_DEFINITIONS.standard`'s 5 cards against a fresh seed via the engine's own `mulberry32` (exported from `engine/src/index.ts` this session) and a placeholder rarity-odds table (every slot Common-weighted, the last slot guaranteed Uncommon+ for spec.md Section 17's "guaranteed baseline value"), debits Coins, grants the instances, and logs the pull — a mid-way failure can never charge without granting or vice versa. Rolling (`rollPackCards`) is a pure function of `(packType, seed)`, tested independently of the DB/coin side.
- **API** (`server/src/httpApi.ts`): `GET/POST /api/auth/nonce|verify`, `GET /api/collection`, `GET/POST /api/decks`, `PUT/DELETE /api/decks/:id`, plus new this session `GET /api/coins` (balance, authenticated), `GET /api/packs` (pack definitions, public), `POST /api/packs/open` (authenticated; `402` if under-funded, `400` for an unknown pack type). Every deck write re-validates against both `validateDeck()` (pool-legality) and `validateOwnership()` server-side, `422` on either failing. Cross-account deck access returns `404` (not `403`), so existence isn't leaked.
- **Tests**: `auth.test.ts` (pure, no DB). `db.test.ts` + `api.test.ts` (real Postgres integration) — extended this session with coins (welcome-bonus grant/idempotency-via-`isNew`/per-account scoping) and packs (deterministic rolling, a full open debiting Coins and granting instances, insufficient-Coins rejection charging/granting nothing, `grantCardInstances` preserving duplicates past the 3-copy cap) coverage, plus the existing deck-CRUD fixtures reworked to an all-Common 30-card deck now that the starting grant no longer covers Rare+. Both still `describe.skip` without `DATABASE_URL`. Ran and passed in full (42 tests) against a live local Postgres this session, migration included.

**Done:** production DB provisioned and reachable on the deployed site (see Section 1); `0002_editions_and_instances.sql` applied to production. **Not yet done:** `0003_coins_and_packs.sql` has *not* been applied to production yet — this session's work was verified against local Postgres + a local dev server only (Section 3). Applying it needs the same `railway connect Postgres --tunnel-only` SSH-tunnel approach as `0002` (production Postgres has no public host var) — do this, and rotate the DB password afterward, before the live site can serve Coins/Packs.

---

# 5. Multiplayer (`server/`)

Matches architecture.md Section 5: FIFO matchmaking, one `MatchState` per room held in server memory, intents validated against the socket that sent them, state broadcast to both players after every legal action, opponent-disconnect notification.

**Known limitations, not yet addressed:**
- Skill-based matchmaking — currently just "whoever's next in the queue"
- No reconnect-to-in-progress-match — a dropped connection ends the match for both players
- State lives in one process's memory — fine at current scale, won't horizontally scale past one server instance without more work

---

# 6. Architecture Decisions Made Since `architecture.md` Was Written

`architecture.md` is the design doc; this section is the "here's what we actually did" reconciliation. (Also reflected in `architecture.md` Section 13 directly.)

- **Client:** web-first (React + Vite), not Unity — confirmed and shipped.
- **Battle engine language:** TypeScript — confirmed and proven in production, including the server running it live via `tsx` (see `server/README.md` for why `tsx` in production rather than a compiled `tsc` build — the workspace packages point `main` at raw `.ts` source, so a plain `node dist/index.js` would crash).
- **Hosting split:** Vercel (client, static) + Railway (match server, needs a persistent WebSocket process — Vercel can't host that). This is the practical resolution of the open question architecture.md Section 13 flagged.
- **Monorepo shape:** `engine` / `shared` (protocol) / `server` / `client` as npm workspaces. `shared` wasn't in the original architecture doc's package list — it exists because `MatchState` has `Set`-typed fields and an `rng` function that don't survive `JSON.stringify`, so both sides needed one place owning that serialization boundary.
- **Identity/auth: wallet-connect from day one, overriding Section 9's "email/social first, wallet later."** Deliberate call, not an oversight — Section 9's reasoning (protect non-crypto-native players from wallet friction at signup) assumed a broad launch audience; this project's actual go-to-market is crypto-native (token launch, Web3-community acquisition — see Section 0), where a wallet is *lower* friction than inventing a password. The one piece of Section 9's intent kept: no login wall anywhere — Play vs AI/Online need no wallet at all, it's asked for only when something needs to persist.
- **Custodial-wallet question (Section 13, "still open"): now moot for the current stage.** Nothing here needs a custodial wallet yet — deck-saving only needs an address to sign in with, no asset custody. Revisit once minting/marketplace (Section 8) are actually being built.

---

# 7. What's Explicitly Not Started

From spec.md Section 34's "Later" list — this is now the **main line of work**, not a someday-list, per the direction in Section 0. Still true that none of it exists yet:

NFTs / Web3 Service, marketplace, staking/Vaults, collection screen, crafting, tournaments, guilds, draft/sealed modes. **Wallet linking and accounts now exist** (Section 4) — struck from this list. **Rarity/editions/instances now exist** (Section 4) — struck from this list too. **Coins ledger and packs now exist** (Section 4, session 5) — struck from this list too, though the acquisition *economy* around them (real earn sources beyond the one-time welcome bonus, tuned drop rates, crafting for duplicates) is still a placeholder, not a finished loop.

The full system (rarity ladder, editions, serial numbers, duplicate-protection/crafting, packs, on-chain minting with Postgres as the deck-legality source of truth and the chain as the ownership source of truth) is already specified in spec.md Sections 12-21 and architecture.md Sections 6-8 — nothing here needs to be designed from scratch, only built, in the order architecture.md Section 12 lays out (off-chain data model → off-chain economy UI → only then Web3/minting/marketplace).

---

# 8. What's Next

No fixed roadmap beyond the immediate next step — this project is being driven conversationally, one milestone at a time, working autonomously and only surfacing genuine decisions.

**Just landed (session 5):** Coins ledger + Packs (spec.md Sections 17/21, architecture.md Section 10) — a Coins balance + audit ledger, one Standard Pack (1,000 Coins, 5 cards, seeded/logged server-side RNG against a placeholder rarity table), a one-time welcome-bonus grant so a new account can open packs immediately, and a client Packs screen with a staggered reveal animation. This is also what finally makes rarity (session 4) matter: `grantStartingCollection` is narrowed to Commons-only in the same change, so Uncommon-and-above is now genuinely pack-only. Verified against a live local Postgres (migration applied, full 42-test suite green) and end-to-end in a real Chromium browser via a scripted wallet (Playwright + `ethers`, same technique as session 4 — the Claude-in-Chrome extension wasn't connected this session either). **Not yet done:** the `0003` migration hasn't been applied to production yet (Section 4) — needs the same SSH-tunnel approach as `0002` before the live site can serve this.

Roadmap, in rough order (collectibility now prioritized ahead of AI/polish per Section 0's direction):

1. ~~Finish the card layer (all 6 factions + Items)~~ — done.
2. ~~Wire content into the live game (deck selection)~~ — done.
3. ~~Accounts + persistent deck builder (off-chain, no rarity yet)~~ — done, including production DB provisioning and a live-site end-to-end verification (Section 1/4).
4. ~~Rarity & editions~~ — done: data model, starting-collection grant, ownership-gated deck building.
5. ~~Packs~~ — done (this session): Coins ledger, one pack type, seeded RNG, reveal UI, and the starting-grant narrowing that makes it matter. Still open: production migration not yet applied (Section 4); no real Coins *earn* loop yet (only the one-time welcome bonus — Section 21's playing/winning/quests/dailies all need matches tied to authenticated accounts, which they aren't yet); pack odds and the welcome-bonus amount are placeholder numbers, not tuned economy design; only one pack type exists (no premium/Genesis packs).
6. **Collection screen** — owned/missing by faction/rarity, the "digital binder." The ownership *data* now has real substance behind it (Commons vs. pack-pulled Uncommon+), so this is a more meaningful screen to build now than it would have been before session 5.
7. **Smarter AI** — the bot (`bot.ts`) is still a greedy heuristic; needs real decision-making to hold up as the permanent solo mode.
8. **Client polish pass** — animations, attack/damage feedback, sound effects, keyword tooltips, better board/hand feel, mobile pass. Art direction (clean vector/icon style vs. something else) is a real decision to raise with the user before this phase, not decided unilaterally.
9. **On-chain layer** — minting (opt-in, async, per architecture.md Section 8), marketplace, wallet-as-asset-custody. Deliberately last — chain choice (Base vs. Polygon vs. other) is still an open decision for the user, and architecture.md Section 12 is explicit that building this against a game/economy that doesn't exist yet is the standard crypto-gaming failure mode.
10. **Multiplayer robustness** — reconnect-to-in-progress-match (a dropped connection currently ends the match for both players), eventually less naive matchmaking than FIFO.

Check the conversation, not this list, for what's actually being worked on right now.
