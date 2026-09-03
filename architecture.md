# CRYPTO CLASH

## Technical Architecture Specification

### Version 0.1 — Pre-Production

---

# 1. Architecture Philosophy

This document translates the product and battle system specs into a concrete system design.

Three rules govern every decision below:

1. **The game must work perfectly with zero blockchain interaction.**
2. **Blockchain never sits in the critical path of a match.**
3. **Gameplay logic is server-authoritative, deterministic, and data-driven.**

Everything else — client engine, chain choice, database — is a means to those ends, not an end in itself.

---

# 2. System Overview

Four systems, loosely coupled:

```
┌─────────────┐       ┌──────────────────┐       ┌──────────────┐
│   Client    │◄─────►│   Game Backend    │◄─────►│  Game DB      │
│ (Unity)     │  WS   │ (Battle Engine +  │       │ (Postgres)    │
│             │       │  Match/Account    │       │               │
└─────────────┘       │  Services)        │       └──────────────┘
                       └────────┬──────────┘
                                │ async, optional
                                ▼
                       ┌──────────────────┐       ┌──────────────┐
                       │ Web3 Service      │◄─────►│  Chain (L2)   │
                       │ (mint/trade/stake)│       │  ERC-721/1155 │
                       └──────────────────┘       └──────────────┘
```

The Game Backend never calls the chain synchronously during a match. The Web3 Service is a separate deployable that only touches ownership, minting, marketplace and staking — never combat.

---

# 3. Client

**Web app first: React + TypeScript, responsive layout targeting desktop and mobile browsers from one codebase.**

Rationale: zero-install, zero-friction entry is the strongest free-to-play acquisition path, and a responsive web board (rather than two separate native builds) keeps the team small during pre-production. Rendering the board is a 2D layout problem (5 slots per side, cards, simple animation) — well within reach of DOM/CSS or a lightweight canvas layer (e.g. PixiJS) without needing a full game engine.

The client is intentionally dumb:

* Sends player **intents** ("play card X to slot 3", "attack slot 2 with slot 1")
* Renders whatever state the server sends back
* Never computes combat, damage, or randomness
* Owns presentation only: animation, VFX, pack-opening reveal, board juice

This constraint is what makes the engine choice low-stakes: since the client never runs game logic, swapping the renderer later (e.g. wrapping the same React app in Capacitor/React Native for app-store presence, or moving to a native/Unity client for a premium bar down the line) doesn't touch the Battle Engine at all. Start web, revisit native only if store presence or performance demands it.

---

# 4. Battle Engine (Server-Authoritative Core)

This is the most important piece of the whole stack and should be built as an isolated, headless library — not tangled into networking or DB code.

**Language: TypeScript (Node), or Go if the team prefers stricter typing/performance.**

Properties, matching Section 33 of the battle spec directly:

* **Pure and deterministic** — given the same seed and the same sequence of player intents, it always produces the same result.
* **Data-driven** — cards are data (JSON/YAML) plus a small effect DSL, not hardcoded classes per card. A new vanilla creature should ship without a code change.
* **Headless** — no rendering, no network code. Runs identically in:
  * the production match server (authoritative)
  * a CI test harness (automated balance/regression testing)
  * a local "vs AI" / tutorial mode bundled into the client for offline play
* **Replayable** — every match is fully described by `(seed, initial decks, ordered list of player intents)`. Storing that tuple gives you Section 31's replay/spectate/anti-cheat system for free — no need to store full state snapshots.

### Effect DSL

Card abilities ("Adjacent Doggos gain +1 Attack", "Deal 3 damage") should be expressed as declarative effect data (trigger + condition + effect), not free-form scripts. This is what keeps the game "easy to balance" (Section 33) and lets non-engineers help design cards later. A small, closed set of triggers (on-play, on-attack, on-turn-start, on-death, adjacency-aura) and effects (damage, buff stat, draw, summon token) covers the entire launch keyword list (Rush, Guard, Stealth, Burn, HODL) without needing a general scripting language.

---

# 5. Match / Networking Layer

* **Transport:** WebSocket (a library like Colyseus, or a thin custom layer over `ws`) for real-time bidirectional state sync.
* **Matchmaking service:** separate from the match server; matches purely on skill/rating per Section 28 — never touches collection, wallet, or staking data.
* **Match server:** stateless-ish — spins up one Battle Engine instance per match, holds it in memory for the match's lifetime, persists the final intent log to the DB on completion, then discards.
* **Turn timer, disconnect/reconnect handling, and action validation** all live here, wrapping the pure battle engine.

---

# 6. Data Model

The single most important modeling decision in the whole system is Section 12's split between **Gameplay Identity** and **Collectible Identity**. The schema should encode that split directly, not bolt it on later.

### Card Template (`card_templates`)
Gameplay identity. One row per unique card design (e.g. "Moon Dog").
`id, name, faction, cost, attack, health, type, keywords[], effect_data (json)`

### Card Edition (`card_editions`)
Cosmetic/collectible variants of a template (Section 14).
`id, template_id, edition_type (standard/first_edition/legendary/genesis), artwork_ref, max_supply`

### Owned Card Instance (`card_instances`)
What a specific player actually owns — this is the row that matters for deck-building and collection screens.
`id, owner_id, edition_id, serial_number (nullable), is_foil, acquired_at, onchain_token_id (nullable)`

A card instance only gets an `onchain_token_id` once (and if) it's minted — see Section 8. Until then it's a perfectly normal off-chain database row, and gameplay never cares which state it's in.

### Deck (`decks`)
`id, owner_id, name, card_instance_ids[]` (or template refs, if you decide deckbuilding is by template not specific serial — recommended, so players don't have to "spend" a prized serialized card to use it in a deck; the collectible copy and the playable copy are the same *template* either way).

This mirrors Section 12's philosophy exactly: two players can have completely different collectible value in their "Moon Dog" (serial #7 Genesis foil vs. a plain common) while the game only ever cares about the Moon Dog *template* for balance.

---

# 7. Persistence

* **Postgres** for everything above — accounts, card templates/editions/instances, decks, match history/replays (as compact intent logs, not full state), Coins ledger, quests/progression.
* **Redis** for matchmaking queue state, active-match session state, rate limiting.
* Match replay logs are small (a list of intents) and cheap to store indefinitely — worth keeping all of them from day one for anti-cheat and future spectate/highlight features.

---

# 8. Blockchain & NFT Layer

Kept in its own service, deliberately decoupled from the Game Backend.

* **Chain:** an EVM-compatible L2 (Base or Polygon are the practical defaults — low fees, mature tooling, real user base already carrying wallets). Final choice should weigh ecosystem/community overlap with your target audience (Section 4) as much as technical merit.
* **Token standard:** ERC-1155 for card templates/editions (efficient batch mint, natural fit for "many copies of one design"), with serial number tracked as on-chain metadata per token id rather than forcing full ERC-721 uniqueness on every card. Reserve ERC-721 only if Genesis/1-of-1 cards want maximally simple, unambiguous single-token semantics.
* **Minting flow:** opt-in and asynchronous. A player with an eligible `card_instance` can request a mint; the Web3 Service submits the on-chain tx, and on confirmation writes `onchain_token_id` back onto that instance row. If the mint fails or is slow, the card is still fully ownable and playable off-chain the whole time — nothing in gameplay blocks on this.
* **Marketplace & staking (Section 25–29):** built entirely on top of the Web3 Service against on-chain-eligible instances. Out of scope for MVP per Section 34.
* **Critical invariant:** the Game Backend's Postgres row is always the source of truth for "can this player use this card in a deck." The chain is the source of truth for "who owns this tradeable collectible asset." A card can be fully game-legal while never touching the chain; it cannot be tradeable on the open marketplace without being on-chain. Keeping these authorities separate is what keeps combat stats un-pay-to-winnable (Section 29) even after a marketplace exists.

---

# 9. Accounts & Wallets

* **Game accounts** (email/social login) are the primary identity and fully sufficient to play, per Section 30 (free-to-play) and Section 23 (wallets optional).
* **Wallet linking** is a separate, later step a player opts into from their profile — connects an external wallet (or provisions a custodial one) to an existing game account. This should be introduced progressively (Section 23), e.g. surfaced only once a player owns something mint-eligible, not on day one.
* Custodial wallet option recommended for MVP+1: lets non-crypto-native players (Section 4's "secondary" audience) hold and eventually trade collectibles without ever installing a wallet extension.

---

# 10. Economy Services

Off-chain, ordinary backend services against Postgres — no blockchain involvement:

* **Coins ledger:** earn events (win, quest, daily, achievement) and spend events (packs, crafting, cosmetics), per Section 21.
* **Pack service:** server-side RNG (seeded, logged) determines pack contents against the configured rarity table (Section 13); never client-determined.
* **Crafting service:** converts duplicate `card_instances` into a crafting resource, spendable on chosen templates (Section 18).

These need real economy modeling (drop rates, Coin earn/spend balance, crafting costs) before launch — flagged as a separate, non-technical work item, not part of this doc.

---

# 11. Anti-Cheat & Fairness

Falls out of the architecture almost for free:

* Server-authoritative battle engine means the client physically cannot submit an illegal action and have it resolve — invalid intents are rejected before reaching the engine.
* Deterministic replay logs mean any suspicious match can be replayed exactly server-side for review.
* Matchmaking and combat stats never read from wallet/collection/staking data (Section 28–29), removing an entire class of pay-to-win and Sybil concerns by construction.

---

# 12. MVP Technical Scope

Maps directly to spec.md Section 34.

### Build for MVP
* Battle Engine (headless TS/Go library) covering: Energy, 5-slot board, Creatures/Spells/Items, Rush/Guard/Stealth/Burn/HODL, Volatility/Market Events
* Match server + WebSocket layer + matchmaking (skill-based only)
* Unity client: tutorial, casual, ranked queues; board rendering; pack-opening screen
* Postgres schema: accounts, card templates/editions/instances, decks, Coins ledger, match history
* Deck builder + collection screen (Section 19)
* Pack service + crafting service

### Explicitly deferred (do not build yet)
* Web3 Service, minting, on-chain token standard
* Wallet linking/connect flow
* Marketplace
* Staking/Vaults
* Tournaments, Guilds, Draft/Sealed modes

Building the Web3 Service against a game that doesn't exist yet is the classic failure mode for crypto-gaming projects — this scope order is deliberate, not a placeholder.

---

# 13. Open Decisions

Flagging rather than deciding, since these need team/budget/community input:

* Node/TypeScript vs. Go for the battle engine
* L2 chain choice (Base vs. Polygon vs. other) for the eventual Web3 Service
* Custodial vs. non-custodial-first wallet strategy
