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

**Session 4:** every non-token template carries a `rarity` (spec.md Section 13's tiers — Common through Genesis), assigned by a simple cost-based heuristic (cost 0-1→Common, 2→Uncommon, 3→Rare, 4→Epic, 5→Legendary; no current template uses Mythic/Genesis, reserved for scarcer future content). It's gameplay-adjacent metadata only — never read by combat/effect resolution, purely there for pack odds and collection-screen grouping. The heuristic is a placeholder, not tuned game/economy design.

**New this session (session 5) — a real bot opponent (`bot.ts`):** `takeBotTurn` was a pure greedy heuristic (play whatever's affordable into the first empty slot, always attack face unless a Guard forces otherwise) — now it actually reasons about combat and positioning, while staying the same fast/synchronous/zero-extra-randomness function the engine's determinism guarantee depends on. It computes real lethal (sum of `getEffectiveAttack` across everything still eligible to attack ≥ enemy HP) and only goes face-first when that's true; otherwise it looks for a "clean kill" — an enemy creature it can kill without dying itself, preferring the highest-effective-attack option when more than one qualifies — and only falls back to face damage when no good trade exists. Creature placement now prefers an empty slot adjacent to an existing friendly creature when that would actually trigger that neighbor's `adjacentSameFaction` aura (e.g. landing next to Moon Dog), instead of always taking the first empty slot. Hand-play order changed too: cards are now tried biggest-cost-first each pass rather than hand-index order, so a big card doesn't get stranded behind a small one that happened to be drawn first. 3 new tests in `engine/test/engine.test.ts` (clean-kill-over-face, still-face-when-lethal, aura-aware placement) plus the existing 42 — 45/45 passing. Sanity-simulated 200 bot-vs-bot games across all 6 faction decks and mixed seeds with no exceptions.

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

**Session 5 — Coins + Packs (`PacksScreen.tsx`, `rarityColor.ts`):** a wallet-connected player sees a live 🪙 Coins balance in the app bar and a "Packs" screen — browse pack definitions (`GET /api/packs`), open one (`POST /api/packs/open`), and watch a staggered reveal (one card flips in every 350ms, not a blank grid dumped instantly — spec.md Section 17 calls this "one of the game's signature moments") with each card's rarity shown as a colored corner dot (`CardFace.tsx`, `template.rarity` badge). Opening updates the app-bar balance immediately and the newly-owned cards show up un-dimmed back in `DeckBuilder` on the very next visit, no extra fetch/refresh logic needed since it re-reads `/api/collection` on mount. Verified end-to-end in a real Chromium browser (Playwright + a mock EIP-1193 provider signing with `ethers`, same technique as session 4's live-site check — the Claude-in-Chrome extension wasn't connected this session): connected a scripted wallet, saw the 3,000-Coin welcome bonus, opened a Standard Pack, watched all 5 cards reveal and the balance drop to 2,000, then confirmed the pulled cards appeared un-dimmed in the deck builder afterward.

**New this session (session 5) — Collection screen (`CollectionScreen.tsx`):** the "digital binder" from spec.md Section 19 — a wallet-connected player sees every non-token template (grouped/filterable by faction and rarity, plus an "Owned only" toggle), each rendered via the same `CardFace` used everywhere else, dimmed if unowned with an "N owned"/"Not owned" caption underneath. A summary bar up top shows total owned/total templates plus a per-rarity breakdown ("Common 18/18 · Uncommon 3/21 · …", each label tinted by `rarityColor`). Deliberately doesn't expose First Edition/Foil/Serial filters yet (spec.md Section 19 lists them) — nothing populates `card_instances` with anything but the `standard` edition today, so those columns exist in the schema but have no real data behind them; the screen only surfaces what's actually true. Verified end-to-end the same way as Packs: scripted wallet, opened 2 packs for some Uncommon+ pulls on top of the Common starter set, confirmed the summary math (24/63 owned, per-rarity counts) and every filter combination (faction, rarity, owned-only, and stacked) against the real card grid.

**New this session (session 5) — a real Coins-earn loop for Play Online (`OnlineMatch.tsx`, `useOnlineMatch.ts`):** winning (or losing, or drawing) an online match now actually pays Coins — see Section 5 for the server side. `connect()` sends the wallet's session token on `findMatch` (anonymous play still works exactly as before if there's no wallet connected); when the server's new `matchReward` message arrives, a small "+N Coins" line renders in the app bar next to Leave. Play vs AI still awards nothing — deliberately, since it's entirely client-side with no server-validated outcome, so trusting a client-reported win would be an open cheat vector; solving that is out of scope, not an oversight.

**Client polish pass (session 5, roadmap step 8 — partially done):** `CardFace.tsx` and `PlayerHeader.tsx` now diff each render's health/HP against the previous one (a `useRef`/`useEffect` pair) to fire a one-shot shake-plus-red-flash animation exactly when a hit lands, instead of the number just silently changing. The five keyword badges (Rush/Guard/Stealth/Burn/HODL) now carry a hover tooltip with a one-sentence explanation pulled from `batlleSpec.md` Section 11 (`keywordInfo.ts`) rather than an unexplained all-caps word. Added hover/lift states, a glowing "Your move" turn indicator, and a pulsing End Turn button when it's actionable. A new `@media (max-width: 400px)` block fixes app-bar/board/hand/player-header overflow at small (~375px) viewport widths. Deliberately not done: sound (no audio assets exist or are being sourced) and any art-direction change (flagged below as a decision for the user, not something to decide unilaterally).

Both of the above were built as parallel, isolated `git worktree` tasks (alongside the bot AI work in Section 2) run concurrently in one session, then reviewed and merged by hand — worth knowing if a future session sees worktree branches or `.claude/worktrees/` and wonders where they came from.

**Not yet built:** crafting (spend duplicate `card_instances` — spec.md Section 18), Coins from anything but a match result or the one-time welcome bonus (quests/dailies/achievements — spec.md Section 21), editions/foils/serials actually being granted (the collection screen and schema are ready for them; nothing produces them yet), sound, art direction beyond the current minimal dark theme. See Section 7.

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

**Done:** production DB provisioned and reachable on the deployed site (see Section 1); `0002_editions_and_instances.sql` and `0003_coins_and_packs.sql` both applied to production and verified there (`coin_transactions`/`pack_openings`/`accounts.coins_balance` confirmed present via the same SSH-tunnel approach as `0002` — production Postgres has no public host var). The DB password printed by that tunnel command was deliberately **not** rotated afterward this time — asked, user said leave it.

---

# 5. Multiplayer (`server/`)

Matches architecture.md Section 5: FIFO matchmaking, one `MatchState` per room held in server memory, intents validated against the socket that sent them, state broadcast to both players after every legal action, opponent-disconnect notification.

**New this session (session 5) — Coins for playing Play Online:** `findMatch` (`shared/src/index.ts`) gained an optional `token`; `createMatchServer.ts` resolves it via `verifySessionToken` (never throws — a missing/bad/expired token is just anonymous play, exactly as before) and stashes the result as `Session.accountId`. `MatchRoom.handleIntent` (`matchRoom.ts`) captures whether `state.winner` was already decided before applying an intent, and awards Coins exactly once, right at the `null → non-null` transition — `100` for a win, `25` for a loss, `50` for a draw (`coinsRepo.ts`'s `awardMatchResult`/`MATCH_WIN_COINS` etc., placeholder numbers with the same "not tuned economy design" caveat as `WELCOME_BONUS_COINS`), to whichever of the two sessions has a real `accountId` — silently skipped (no crash, no message) for anonymous sessions or when `DATABASE_URL` isn't configured. A new `matchReward` server message carries the amount and new balance back to the client. Play vs AI is deliberately excluded — it's entirely client-side with no server-validated outcome, so awarding Coins there would trust a client-reported win.

Verified with a real WS-level integration test (`server/test/server.test.ts`) that drives an actual match to a genuine engine-decided win over live sockets (a scripted "develop board, respect Guard, attack face" player reacting only to real server-broadcast state — not reaching into `MatchRoom` internals), both anonymous (confirms no `matchReward`, no crash) and authenticated against real Postgres (confirms both accounts get credited, winner's `coinsEarned` > loser's, and the reported balance matches a fresh `getBalance` read) — 46/46 server tests passing. Also verified visually end-to-end: a real scripted-wallet browser client playing a live online match against a raw-WebSocket scripted opponent, confirming the "+25 Coins" banner actually renders in `OnlineMatch.tsx` after a real loss.

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

NFTs / Web3 Service, marketplace, staking/Vaults, crafting, tournaments, guilds, draft/sealed modes. **Wallet linking and accounts now exist** (Section 4) — struck from this list. **Rarity/editions/instances now exist** (Section 4) — struck from this list too. **Coins ledger, packs, and the collection screen now exist** (Section 3/4, session 5) — struck from this list too, though the acquisition *economy* around them (real earn sources beyond the one-time welcome bonus, tuned drop rates, crafting for duplicates) is still a placeholder, not a finished loop.

The full system (rarity ladder, editions, serial numbers, duplicate-protection/crafting, packs, on-chain minting with Postgres as the deck-legality source of truth and the chain as the ownership source of truth) is already specified in spec.md Sections 12-21 and architecture.md Sections 6-8 — nothing here needs to be designed from scratch, only built, in the order architecture.md Section 12 lays out (off-chain data model → off-chain economy UI → only then Web3/minting/marketplace).

---

# 8. What's Next

No fixed roadmap beyond the immediate next step — this project is being driven conversationally, one milestone at a time, working autonomously and only surfacing genuine decisions.

**Just landed (session 5, second wave):** three more roadmap items landed in one batch — a real Coins-earn loop for Play Online wins/losses/draws (Section 5), a meaningfully smarter bot opponent (Section 2), and a client polish pass covering hit feedback, keyword tooltips, interaction polish, and a small-viewport mobile fix (Section 3). Built as three parallel, isolated `git worktree` agent tasks (avoiding file-overlap by construction — server/coins vs. engine/bot vs. client/visual, with explicit boundaries where two touched the same file), each independently reviewed and verified before merging: real Postgres integration tests plus a real WS-level match played to a genuine win for the Coins loop, 45/45 engine tests plus a 200-game bot-vs-bot sanity sim for the AI, and a real scripted-browser run confirming the hit-flash/tooltip/mobile-layout work for the polish. All three merged into `main` cleanly (one trivial import-order conflict, hand-resolved). **Not yet done:** none of this session's work (this wave or the Coins/Packs/Collection wave before it) has been pushed to the `origin` remote or deployed — `main` is currently 10 commits ahead of `origin/main`, and Vercel/Railway auto-deploy on push, so the live site still runs session 4's build until this is pushed.

Roadmap, in rough order (collectibility now prioritized ahead of AI/polish per Section 0's direction):

1. ~~Finish the card layer (all 6 factions + Items)~~ — done.
2. ~~Wire content into the live game (deck selection)~~ — done.
3. ~~Accounts + persistent deck builder (off-chain, no rarity yet)~~ — done, including production DB provisioning and a live-site end-to-end verification (Section 1/4).
4. ~~Rarity & editions~~ — done: data model, starting-collection grant, ownership-gated deck building.
5. ~~Packs~~ — done: Coins ledger, one pack type, seeded RNG, reveal UI, and the starting-grant narrowing that makes it matter. Still open: pack odds and the welcome-bonus amount are placeholder numbers, not tuned economy design; only one pack type exists (no premium/Genesis packs).
6. ~~Collection screen~~ — done: owned/missing by faction/rarity, filterable, with a summary progress bar. First Edition/Foil/Serial filters (spec.md Section 19) deliberately not exposed yet — nothing populates those `card_instances` fields today.
7. ~~Smarter AI~~ — done: real lethal/clean-kill/trade evaluation and aura-aware placement in `bot.ts`, not just "play anything, attack face."
8. **Client polish pass** — partially done (hit feedback, keyword tooltips, interaction polish, one mobile breakpoint fix landed this session). Still open: sound effects (no audio assets sourced), a fuller mobile pass, and art direction (clean vector/icon style vs. something else) — still a real decision to raise with the user, not decided unilaterally.
9. **Coins earn loop, part 2** — Play Online wins/losses/draws now pay Coins (this session), but Section 21's other sources (quests, dailies, weekly/ranked progression, events) are all still unbuilt, and the win/loss/draw amounts are untuned placeholders.
10. **On-chain layer** — minting (opt-in, async, per architecture.md Section 8), marketplace, wallet-as-asset-custody. Deliberately last — chain choice (Base vs. Polygon vs. other) is still an open decision for the user, and architecture.md Section 12 is explicit that building this against a game/economy that doesn't exist yet is the standard crypto-gaming failure mode.
11. **Multiplayer robustness** — reconnect-to-in-progress-match (a dropped connection currently ends the match for both players), eventually less naive matchmaking than FIFO.

Check the conversation, not this list, for what's actually being worked on right now.
