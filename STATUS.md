# CRYPTO CLASH — Status

### Last updated: 2026-09-04

---

This is a living document — read it for "where are we right now," and read `spec.md` / `batlleSpec.md` / `architecture.md` for "what are we building toward." Update this file, don't accumulate a second one, whenever a milestone lands or the plan changes.

# 1. What Exists Right Now

A monorepo (npm workspaces) with four packages, all live and deployed:

| Package | Role | Status |
|---|---|---|
| `engine/` | Headless, deterministic battle engine | Core systems complete |
| `shared/` (`@cryptoclash/protocol`) | Client/server wire format + (de)serialization | Complete for current scope |
| `server/` | WebSocket match server (real-time PvP) | Working, deployed |
| `client/` | React web app (mobile-responsive) | Two play modes live |

**Live deployments:**
- Client: `crypto-clash-client-six.vercel.app` (Vercel, auto-deploys on push to `main`, Root Directory `client`)
- Match server: `vivacious-passion-production-1a17.up.railway.app` (Railway, auto-deploys on push to `main`, Root Directory repo root)
- Repo: `github.com/josh04121998/CryptoClash`

**Test coverage:** 29 engine tests + 4 server integration tests, all passing. Client type-checks clean and builds clean. No test suite for `shared` (it's pure data transforms, covered indirectly by the server integration tests).

---

# 2. Battle Engine (`engine/`)

Implements batlleSpec.md's full "First Prototype" checklist (Section 32) **except Items**:

- Turn loop: Energy (1→10, refills each turn), Draw, Play, Attack, End
- 5-slot board with adjacency (Section 5/8) — auras key off it (Moon Dog's "+1 Attack while next to another Doggo")
- Creatures and Spells (Items — the third card type — not yet implemented)
- All five launch keywords (Section 11): **Rush**, **Guard**, **Stealth**, **Burn**, **HODL**
- **Volatility & all five Market Events** (Sections 16-18): MARKET_CRASH, PUMP, LIQUIDATION, FOMO, BLACK_SWAN
- Fatigue (escalating damage on empty-deck draw), hand size cap
- Server-authoritative by construction: the engine is pure/deterministic (`seed` + ordered `Intent`s → identical result every time), so replay/anti-cheat (Section 31) falls out for free — `state.log` already is that replay

**Card pool:** 37 templates. Three factions now have real depth and their own standalone 30-card deck (`cards.ts`): **Doggos** (`SAMPLE_DECK` — 9 cards + Puppy token, swarm/adjacency), **Frogs** (`FROG_SAMPLE_DECK` — 10 cards + Tadpole token, copying via the new `copyRandomFriendly` effect + controlled-randomness Volatility play), **Builders** (`BUILDER_SAMPLE_DECK` — 10 cards, card draw/combo via the new `draw` effect). **Degens**/**CryptoBros**/**Normies** still only have one or two utility spells each and no dedicated deck — that's the remaining content gap against spec.md Section 6.

See `card-schema.md` for the effect DSL these cards are built from (now including `draw` and `copyRandomFriendly`), and `engine/README.md` for how to run/extend it.

---

# 3. Client (`client/`)

Two modes, both live:

- **Play vs AI** — runs the engine directly in the browser against a greedy-heuristic bot (`takeBotTurn`). No backend required. This is the permanent practice/tutorial mode, not a placeholder.
- **Play Online** — real matchmaking through the Railway match server. FIFO queue, one match per pair, live state sync over WebSocket.

Board/hand/interaction UI (`MatchView`) is shared between both modes, parameterized by which player is "me," so every fix or feature (the Volatility meter, keyword badges, etc.) applies to both at once.

**Not yet built:** deck builder (decks are currently the hardcoded `SAMPLE_DECK` — everyone plays the same 30 cards), collection screen, accounts, Coins, packs. None of the economy/collectible layer from spec.md exists yet — see Section 6 below.

---

# 4. Multiplayer (`server/`)

Matches architecture.md Section 5: FIFO matchmaking, one `MatchState` per room held in server memory, intents validated against the socket that sent them, state broadcast to both players after every legal action, opponent-disconnect notification.

**Known limitations, not yet addressed:**
- Skill-based matchmaking — currently just "whoever's next in the queue"
- No reconnect-to-in-progress-match — a dropped connection ends the match for both players
- State lives in one process's memory — fine at current scale, won't horizontally scale past one server instance without more work

---

# 5. Architecture Decisions Made Since `architecture.md` Was Written

`architecture.md` is the design doc; this section is the "here's what we actually did" reconciliation. (Also reflected in `architecture.md` Section 13 directly.)

- **Client:** web-first (React + Vite), not Unity — confirmed and shipped.
- **Battle engine language:** TypeScript — confirmed and proven in production, including the server running it live via `tsx` (see `server/README.md` for why `tsx` in production rather than a compiled `tsc` build — the workspace packages point `main` at raw `.ts` source, so a plain `node dist/index.js` would crash).
- **Hosting split:** Vercel (client, static) + Railway (match server, needs a persistent WebSocket process — Vercel can't host that). This is the practical resolution of the open question architecture.md Section 13 flagged.
- **Monorepo shape:** `engine` / `shared` (protocol) / `server` / `client` as npm workspaces. `shared` wasn't in the original architecture doc's package list — it exists because `MatchState` has `Set`-typed fields and an `rng` function that don't survive `JSON.stringify`, so both sides needed one place owning that serialization boundary.

---

# 6. What's Explicitly Not Started

Straight from spec.md Section 34's "Later" list — none of this exists yet, by design (MVP scope was always gameplay-first):

NFTs / Web3 Service, wallet linking, marketplace, staking/Vaults, accounts, Coins ledger, packs, collection screen, crafting, tournaments, guilds, draft/sealed modes.

---

# 7. What's Next

No fixed roadmap beyond the immediate next step — this project is being driven conversationally, one milestone at a time.

As of this update: Frogs and Builders now have full 30-card decks (`FROG_SAMPLE_DECK`, `BUILDER_SAMPLE_DECK` in `engine/src/cards.ts`), each introducing a new signature effect (`copyRandomFriendly` for Frogs' copying identity, `draw` for Builders' combo identity) — closing the "only Doggos has depth" gap that made a deck builder feel premature. Neither deck is reachable from a live match yet: `server/src/matchRoom.ts` and `client/src/useMatch.ts` still hardcode `SAMPLE_DECK` for both players.

Two natural next steps, not yet decided between:

- **Deck builder** — now genuinely worth building: three decks' worth of cards exist to build with.
- **Deck picker** — a much smaller step than a full builder: let a player choose Doggos/Frogs/Builders (as a fixed pre-built deck) before a match, in both Play vs AI and Play Online. Wires the new content into the actual game loop without the larger deck-builder UI/persistence surface.
- **Degens/CryptoBros/Normies content** — still only one or two utility spells each; same treatment (signature mechanic + dedicated deck) would round out all six factions from spec.md Section 6.

Check the conversation, not this bullet, for the actual current call.
