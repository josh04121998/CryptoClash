# @cryptoclash/engine

Headless, deterministic battle engine prototype for CRYPTO CLASH — see `../architecture.md` Section 4 for the design rationale.

No rendering, no networking. Takes a `(seed, deck lists)` pair plus a stream of player `Intent`s and produces the resulting `MatchState`, including a human-readable action log.

## What's implemented

Turn loop (Energy, Draw, Play, Attack, End) · 5-slot board with adjacency auras · Creatures/Spells/Items · all five launch keywords — Rush, Guard, Stealth, Burn, HODL · Volatility & the five Market Events (MARKET_CRASH, PUMP, LIQUIDATION, FOMO, BLACK_SWAN) · fatigue · the exact Moon Dog / Puppy Swarm / Pack Rush combo from `batlleSpec.md` Section 21.

All six spec.md Section 6 factions now have real card depth, each with its own standalone 30-card deck export — `SAMPLE_DECK` (Doggos — swarm/adjacency), `FROG_SAMPLE_DECK` (Frogs — copying via `copyRandomFriendly`), `BUILDER_SAMPLE_DECK` (Builders — card draw/combo via `draw`), `DEGEN_SAMPLE_DECK` (Degens — pay your own HP for power, via `damage` targeted at `selfPlayer`), `CRYPTOBRO_SAMPLE_DECK` (Crypto Bros — Energy ramp via `gainEnergy`/`gainMaxEnergy`), `NORMIE_SAMPLE_DECK` (Normies — a defensive `heal` toolkit) — plus 5 Neutral Items (`buffTarget`/`grantKeywordTarget`). All six are collected in `DECKS` and look-up-able via `getDeck(deckId)`.

Not yet implemented (next slice): a deck *builder* (players currently pick one of the 6 fixed decks above via the client's deck picker, not a custom list from the full pool), a smarter bot (still a greedy heuristic), and reconnect-to-in-progress-match on the server.

## Running it

```
npm install                      # from the repo root
npm test --workspace=engine      # run the test suite
npm run demo --workspace=engine  # simulate a full mirror match with a greedy bot, print the replay log
```

## Usage

```ts
import { createMatch, applyIntent, SAMPLE_DECK } from "@cryptoclash/engine";

const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, /* seed */ 42);

applyIntent(state, { kind: "playCard", playerId: "A", handIndex: 0, slot: 2 });
applyIntent(state, { kind: "attack", playerId: "A", attackerSlot: 2, target: { type: "player", playerId: "B" } });
applyIntent(state, { kind: "endTurn", playerId: "A" });
```

`state.log` accumulates a replay-ready action history (matches `batlleSpec.md` Section 31's format). A match server would call `applyIntent` from validated network messages instead of calling it directly like this.
