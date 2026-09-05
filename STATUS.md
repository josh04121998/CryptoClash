# CRYPTO CLASH — Status

### Last updated: 2026-09-05 (session 3)

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

**Test coverage:** 42 engine tests, 24 server tests (15 always run; 9 are real-Postgres integration tests that skip gracefully without `DATABASE_URL`, verified green against a live local Postgres this session), all passing. Client type-checks clean and builds clean. No test suite for `shared` (it's pure data transforms, covered indirectly by the server integration tests).

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

See `card-schema.md` for the full effect DSL (now 10 `EffectAction` kinds), and `engine/README.md` for how to run/extend it.

---

# 3. Client (`client/`)

Two play modes, both live, both fronted by a **deck picker** (`DeckPicker.tsx`) — pick a starter deck, or (if wallet-connected) one of your own saved decks, before a match starts:

- **Play vs AI** — runs the engine directly in the browser against a greedy-heuristic bot (`takeBotTurn`), which now also picks a random deck each match for variety. No backend, no wallet required. This is the permanent practice/tutorial mode, not a placeholder.
- **Play Online** — real matchmaking through the Railway match server; the resolved 30-card list (starter or custom) rides along on the `findMatch` message — the server re-validates it (`validateDeck`) rather than trusting the client, falling back to the default deck if it's missing or illegal.

Board/hand/interaction UI (`MatchView`) is shared between both modes, parameterized by which player is "me," so every fix or feature (the Volatility meter, keyword badges, etc.) applies to both at once. Targeting distinguishes friendly-target cards (Items — click your own board) from enemy-target cards (damage/burn spells — click the opponent's board/portrait), via the shared `targetsFriendlyCreature()` helper (also used by the bot, so it doesn't waste Items targeting the wrong side).

**New this session — wallet-connect + deck builder** (`useWallet.ts`, `DeckBuilder.tsx`, `MyDecksScreen.tsx`):
- "Connect Wallet" in the top-right of the main menu — [Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361) against any injected browser wallet (MetaMask etc.), verified end-to-end this session with a real cryptographic signature flow. No login wall anywhere else — every other screen works with no wallet connected.
- Once connected: "My Decks" screen (list/create/edit/delete) and a full deck builder — browse the entire 60-card pool, add/remove with a live `validateDeck()` legality check (exactly 30 cards, max 3 copies, no tokens), save. Saved decks are real Postgres rows, scoped per-wallet, and appear back in the match deck-picker — verified this session by building a deck, saving it, and starting an actual Play-vs-AI match with it.
- Bundle-size cost: `siwe`/`ethers` (needed for SIWE message construction/signing) added ~670KB gzipped-~95KB to the client bundle, and required a Node `Buffer` polyfill (`vite-plugin-node-polyfills`, scoped to just `buffer`+`process` — deliberately *not* `crypto`, which would've pulled in a vulnerable `elliptic` transitive dependency for a polyfill nothing here needs). Worth revisiting in a later polish pass if load time becomes a concern.

**Not yet built:** collection screen (owned/missing cards — moot until Section 6's rarity/edition layer exists), Coins, packs. See Section 6.

---

# 4. Accounts & Decks Backend (`server/`)

New this session — the first slice of `architecture.md` Section 6's data model (deliberately just accounts + decks; no `card_templates`/`editions`/`instances` table yet, since there's no rarity/collectible layer to back — see Section 7). Lives in the same Railway service as the match server (same "Game Backend" box the architecture doc's own diagram already draws), exposed as `/api/*` REST routes alongside the existing WebSocket endpoint.

- **Schema** (`server/migrations/0001_accounts_and_decks.sql`, applied via `npm run migrate --workspace=server`, a small hand-rolled runner — no ORM/framework): `accounts` (wallet address, lowercased, unique) and `decks` (account-scoped, `cards` as a JSON array, cascade-deletes with the account).
- **Auth** (`server/src/auth.ts`): Sign-In with Ethereum — nonce issue/consume (one-time, 5-minute TTL, in-memory), SIWE message verification (`siwe` package) checked against a configured domain (replay/cross-app-reuse protection), session as a signed JWT (`jose`). Fully tested with real ECDSA signing via `ethers.Wallet` — no mocking of the crypto itself.
- **API** (`server/src/httpApi.ts`): `GET/POST /api/auth/nonce|verify`, `GET/POST /api/decks`, `PUT/DELETE /api/decks/:id`. Every deck write re-validates against `validateDeck()` server-side (422 if illegal) — the client's own check is just UX, never trusted. Ownership checks return `404` (not `403`) for another account's deck, so existence isn't leaked.
- **Tests**: `auth.test.ts` (pure, no DB — real SIWE crypto round-trips, replay/domain/wrong-signer rejection, JWT round-trip), `db.test.ts` + `api.test.ts` (real Postgres integration — account isolation, cross-account deck protection, cascade delete, full HTTP flow) — the latter two `describe.skip` without `DATABASE_URL` so `npm test` stays green with no DB configured, but were run and passed against a live local Postgres this session.

**Done:** production DB provisioned and reachable on the deployed site (see Section 1).

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

NFTs / Web3 Service, marketplace, staking/Vaults, Coins ledger, packs, collection screen, crafting, tournaments, guilds, draft/sealed modes. **Wallet linking and accounts now exist** (Section 4) — struck from this list.

The full system (rarity ladder, editions, serial numbers, duplicate-protection/crafting, packs, on-chain minting with Postgres as the deck-legality source of truth and the chain as the ownership source of truth) is already specified in spec.md Sections 12-21 and architecture.md Sections 6-8 — nothing here needs to be designed from scratch, only built, in the order architecture.md Section 12 lays out (off-chain data model → off-chain economy UI → only then Web3/minting/marketplace).

---

# 8. What's Next

No fixed roadmap beyond the immediate next step — this project is being driven conversationally, one milestone at a time, working autonomously and only surfacing genuine decisions.

**Just landed:** all six spec.md factions with distinct signature mechanics + Items (engine content-complete against batlleSpec.md Section 32 + spec.md Section 6), and — the bigger shift — the first slice of the collectible foundation: wallet-connect accounts and a real deck builder (Sections 3-4), verified end-to-end in a live browser session including actual SIWE signing and a saved custom deck making it into a real match.

Roadmap, in rough order (collectibility now prioritized ahead of AI/polish per Section 0's direction):

1. ~~Finish the card layer (all 6 factions + Items)~~ — done.
2. ~~Wire content into the live game (deck selection)~~ — done.
3. ~~Accounts + persistent deck builder (off-chain, no rarity yet)~~ — done, including production DB provisioning and a live-site end-to-end verification (Section 1/4).
4. **Rarity & editions** — the actual "something to chase" layer (spec.md Sections 12-20): extend the data model with `card_editions`/`card_instances` (architecture.md Section 6), assign every account a starting collection, gate deck-building by ownership instead of "everyone has everything."
5. **Packs** — Coins-for-packs, seeded server-side RNG against the rarity table, a real reveal moment.
6. **Collection screen** — owned/missing by faction/rarity, the "digital binder."
7. **Smarter AI** — the bot (`bot.ts`) is still a greedy heuristic; needs real decision-making to hold up as the permanent solo mode.
8. **Client polish pass** — animations, attack/damage feedback, sound effects, keyword tooltips, better board/hand feel, mobile pass. Art direction (clean vector/icon style vs. something else) is a real decision to raise with the user before this phase, not decided unilaterally.
9. **On-chain layer** — minting (opt-in, async, per architecture.md Section 8), marketplace, wallet-as-asset-custody. Deliberately last — chain choice (Base vs. Polygon vs. other) is still an open decision for the user, and architecture.md Section 12 is explicit that building this against a game/economy that doesn't exist yet is the standard crypto-gaming failure mode.
10. **Multiplayer robustness** — reconnect-to-in-progress-match (a dropped connection currently ends the match for both players), eventually less naive matchmaking than FIFO.

Check the conversation, not this list, for what's actually being worked on right now.
