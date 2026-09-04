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

**Test coverage:** 36 engine tests + 5 server integration tests, all passing. Client type-checks clean and builds clean. No test suite for `shared` (it's pure data transforms, covered indirectly by the server integration tests).

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

Two modes, both live, both now with a **deck picker** (`DeckPicker.tsx`) in front of them — pick any of the 6 pre-built decks before a match starts:

- **Play vs AI** — runs the engine directly in the browser against a greedy-heuristic bot (`takeBotTurn`), which now also picks a random deck each match for variety. No backend required. This is the permanent practice/tutorial mode, not a placeholder.
- **Play Online** — real matchmaking through the Railway match server; your chosen `deckId` rides along on the `findMatch` message so the server builds the match with the right cards for both sides.

Board/hand/interaction UI (`MatchView`) is shared between both modes, parameterized by which player is "me," so every fix or feature (the Volatility meter, keyword badges, etc.) applies to both at once. Targeting now distinguishes friendly-target cards (Items — click your own board) from enemy-target cards (damage/burn spells — click the opponent's board/portrait), via the shared `targetsFriendlyCreature()` helper (also used by the bot, so it doesn't waste Items targeting the wrong side).

**Not yet built:** an actual deck *builder* (players still pick one of 6 fixed pre-built decks, not their own list from the full pool), collection screen, accounts, Coins, packs. None of the economy/collectible layer from spec.md exists yet — see Section 6 below.

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

No fixed roadmap beyond the immediate next step — this project is being driven conversationally, one milestone at a time. Working plan agreed with the user (2026-09-04): push toward a complete, polished, "good indie/prototype standard" game (explicitly not chasing Hearthstone's production values — no painted art/VFX/voice/live-ops budget here), working autonomously and only surfacing genuine decisions.

**Just landed:** all six spec.md factions now have real 30-card decks with distinct signature mechanics (see Section 2), Items are implemented, and a deck picker wires all of it into both Play vs AI and Play Online. Engine content-completeness (batlleSpec.md Section 32 + spec.md Section 6) is essentially done.

Roadmap, in rough order:

1. ~~Finish the card layer (all 6 factions + Items)~~ — done.
2. ~~Wire content into the live game (deck selection)~~ — done.
3. **Deck builder + collection screen** — let players build a deck from the full 60-card pool instead of picking one of 6 fixed lists.
4. **Smarter AI** — the bot (`bot.ts`) is a greedy heuristic (play what's affordable, attack with everything); it needs real decision-making to hold up as the permanent solo mode.
5. **Client polish pass** — animations, attack/damage feedback, sound effects, keyword tooltips, better board/hand feel, mobile pass. Art direction (clean vector/icon style vs. something else) is a real decision to raise with the user before this phase, not decided unilaterally.
6. **Multiplayer robustness** — reconnect-to-in-progress-match (a dropped connection currently ends the match for both players), and eventually less naive matchmaking than FIFO.

Check the conversation, not this list, for what's actually being worked on right now.
