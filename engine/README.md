# @cryptoclash/engine

Headless, deterministic battle engine prototype for CRYPTO CLASH — see `../architecture.md` Section 4 for the design rationale.

No rendering, no networking. Takes a `(seed, deck lists)` pair plus a stream of player `Intent`s and produces the resulting `MatchState`, including a human-readable action log.

## What's implemented

Turn loop (Energy, Draw, Play, Attack, End) · 5-slot board with adjacency auras · Creatures/Spells · all five launch keywords — Rush, Guard, Stealth, Burn, HODL · Volatility & the five Market Events (MARKET_CRASH, PUMP, LIQUIDATION, FOMO, BLACK_SWAN) · fatigue · the exact Moon Dog / Puppy Swarm / Pack Rush combo from `batlleSpec.md` Section 21.

Three factions now have real card depth, each with its own standalone 30-card deck export: `SAMPLE_DECK` (Doggos — swarm/adjacency), `FROG_SAMPLE_DECK` (Frogs — copying via the `copyRandomFriendly` effect, plus controlled-randomness Volatility play), `BUILDER_SAMPLE_DECK` (Builders — card draw/combo via the `draw` effect). Degens/CryptoBros/Normies still only have one or two utility spells each.

Not yet implemented (next slice): Items, a deck-selection UI/deck builder (the new Frog/Builder decks aren't reachable from a live match yet — `server`/`client` still hardcode `SAMPLE_DECK`), and full Degens/CryptoBros/Normies rosters.

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
