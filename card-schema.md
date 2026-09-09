# CRYPTO CLASH

## Card Schema & Effect DSL Reference

### Version 0.1

---

# 1. What This Document Is

`batlleSpec.md` describes what a card should *feel* like to a player. This document describes what a card *is* to the engine: the exact data shape (`CardTemplate`) and the declarative effect language it's built from — so a new card can be added by writing data, not code, per architecture.md Section 4's "data-driven, easy to balance" rule.

The authoritative source is always `engine/src/types.ts`; this document explains and gives worked examples, but if the two ever disagree, the code wins and this doc is stale — fix the doc.

For current implementation status (which of this is actually finished, what's still a gap), see `STATUS.md`.

---

# 2. CardTemplate

Every card — creature, spell, or (once implemented) item — is one `CardTemplate` object in `engine/src/cards.ts`'s `CARD_POOL`.

```ts
interface CardTemplate {
  id: string;              // unique key, also the CARD_POOL lookup key
  name: string;             // display name
  faction: Faction;         // "Doggos" | "Frogs" | "Degens" | "CryptoBros" | "Builders" | "Normies" | "Neutral"
  type: CardType;           // "Creature" | "Spell" | "Item" | "Secret" (see Section 8 for Secret)
  cost: number;              // Energy cost
  rarity?: Rarity;           // "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic" | "Genesis" — omit only for tokens
  attack?: number;           // Creatures only
  health?: number;           // Creatures only
  keywords?: Keyword[];      // "Rush" | "Guard" | "Stealth" | "Burn" | "HODL"
  effects?: EffectDef[];     // see Section 3
  aura?: AuraDef;            // see Section 5
  text: string;              // the rules text shown on the card
  token?: boolean;           // true = summon-only, not obtainable via deck construction (e.g. Puppy)
}
```

### Worked example — a vanilla creature

```ts
pup_scout: {
  id: "pup_scout",
  name: "Pup Scout",
  faction: "Doggos",
  type: "Creature",
  cost: 1,
  attack: 1,
  health: 2,
  text: "Vanilla.",
},
```

No `effects`, no `keywords` — this is the simplest possible card. Most of the roster should look like this; per batlleSpec.md Section 20, complexity should come from *combinations*, not every individual card doing something.

(`rarity` omitted from this example for brevity — every non-token template in `cards.ts` has one; see spec.md Section 13. It's gameplay-adjacent metadata only: it drives pack odds and collection-screen grouping once those exist, never a stat and never read by the engine's combat/effect resolution. Distinct from a card **edition** — see architecture.md Section 6 — which is a cosmetic variant *of* a template stored in Postgres, not in `CARD_POOL`.)

### Worked example — a keyword creature

```ts
shield_pup: {
  id: "shield_pup",
  name: "Shield Pup",
  faction: "Doggos",
  type: "Creature",
  cost: 2,
  attack: 2,
  health: 3,
  keywords: ["Guard"],
  text: "Guard.",
},
```

Keywords listed here are baked into every copy permanently (`BoardCreature.keywords`, a `Set`, initialized from this array on summon). Compare to *temporary* keywords granted mid-match by an effect (Section 4) — those land in a separate `tempKeywords` set that clears at the owner's next turn.

---

# 3. The Effect DSL

An `EffectDef` pairs a **Trigger** with an **EffectAction**:

```ts
interface EffectDef {
  trigger: Trigger;             // "onPlay" | "onTurnStart" | "onDeath" | "onEnemyAttack" | "onEnemyPlayCreature"
  action: EffectAction;
  requiresTarget?: boolean;     // true = playing this card requires Intent.target to be supplied
}
```

A `CardTemplate` can carry multiple `effects` (a card doesn't have to fire on the same trigger twice, but nothing stops it).

### 3.1 Triggers

| Trigger | Fires when |
|---|---|
| `onPlay` | The card (creature or spell) is played from hand |
| `onTurnStart` | Every startTurn, for each creature belonging to the active player that has this effect (skipped if the creature is `silenced` — see Section 4) |
| `onDeath` | A creature with this effect dies, by any means (combat, spell/burn damage, a Market Event) — the Deathrattle pattern. See Section 3.7 |
| `onEnemyAttack` | **Secret-only.** A Secret's controller's opponent declares a legal attack, before damage is dealt. See Section 8 |
| `onEnemyPlayCreature` | **Secret-only.** A Secret's controller's opponent plays a creature card, after it lands on the board. See Section 8 |

The last two only ever fire via `effects.ts`'s `checkAndFireSecret` — they are not reachable through the normal `resolveEffects(..., trigger, ctx)` call sites used for `onPlay`/`onTurnStart`/`onDeath`, and only make sense on a `type: "Secret"` template. Adding a genuinely new trigger means adding a call site (`engine/src/engine.ts`'s `startTurn`/`playCard`, or `engine/src/combat.ts`'s `resolveAttack`), plus a case in `effects.ts`'s `resolveEffects` switch if it needs a new `EffectContext` field (as `onEnemyAttack`/`onEnemyPlayCreature` needed `triggerSource`).

### 3.7 Worked example — Deathrattle (`onDeath`)

```ts
exit_liquidity: {
  id: "exit_liquidity",
  name: "Exit Liquidity",
  faction: "Degens",
  type: "Creature",
  cost: 6,
  rarity: "Legendary",
  attack: 7,
  health: 3,
  text: "Deathrattle: Deal 3 damage to the enemy player.",
  effects: [{ trigger: "onDeath", action: { kind: "damage", target: { kind: "enemyPlayer" }, amount: 3 } }],
},
```

Mechanically: `matchOps.ts`'s `removeIfDead` is the single choke-point every creature death funnels through (combat, `applyDamageToTarget`, Market Events); it pushes `{ controller, templateId, silenced }` onto `MatchState.pendingDeathrattles` instead of resolving the effect immediately, to avoid a circular import (`matchOps.ts` sits below `effects.ts`). `effects.ts`'s `processPendingDeathrattles` drains that queue in a loop — not a single pass — once per `applyIntent`, so a Deathrattle that kills a second Deathrattle creature chains correctly within the same intent. A `silenced` creature's queued entry is skipped, not resolved (see Section 4).

### 3.2 EffectAction kinds

| Kind | Shape | What it does | Example card |
|---|---|---|---|
| `damage` | `{ target, amount }` | Deals `amount` damage to the resolved target(s) | Spark Bolt |
| `summon` | `{ templateId, count }` | Summons `count` copies of a token template into the controller's first empty slot(s); logs and stops if the board is full | Puppy Swarm |
| `buffSelf` | `{ attack?, health? }` | Permanently buffs *this card's own board instance* (only meaningful with `sourceSlot` set — i.e. creature triggers, not spells) | Diamond Hands (HODL) |
| `grantKeywordFriendlyBoard` | `{ keyword }` | Grants `keyword` to every creature on the controller's board, until their owner's next `startTurn` | Pack Rush |
| `volatility` | `{ amount }` | Shifts the shared Volatility meter by `amount` (negative to lower it), clamped to [0,10]; reaching 10 fires a random Market Event and resets to 0 | Pump Signal / Cool Down |
| `burn` | `{ target, amountPerTurn, turns }` | Applies a ticking Burn status to the target — `amountPerTurn` damage at the end of every turn (anyone's), for `turns` turns | Ember Curse |
| `draw` | `{ count }` | Controller draws `count` cards, via the same `drawCard` fatigue/hand-cap logic as the normal turn draw | Blueprint, Junior Dev |
| `copyRandomFriendly` | `{ count }` | For each of `count` iterations: picks a random *other* friendly board creature (excludes the effect's own `sourceSlot`, so a creature can't copy itself) and creates a fresh base-stat copy of it in an empty slot. Fizzles (logs, no throw) per-iteration if there's nothing to copy or no room | Mimic Frog, Copycat, Deep Croak |
| `heal` | `{ amount }` | Controller's own player gains `amount` HP, clamped to `MAX_PLAYER_HP` (30) | First Aid, Rainy Day Fund |
| `gainEnergy` | `{ amount }` | Controller gains `amount` Energy *this turn only*, clamped to `MAX_ENERGY` (10) — doesn't touch `maxEnergy`, so it doesn't persist to the next turn | Seed Round, Whale Wallet |
| `gainMaxEnergy` | `{ amount }` | Controller's `maxEnergy` *permanently* increases by `amount` (also bumps current `energy` by the same amount so it's usable immediately), both clamped to `MAX_ENERGY` | Venture Capital |
| `buffTarget` | `{ target, attack?, health? }` | Like `buffSelf`, but permanently buffs whatever creature `target` resolves to instead of the effect's own source — a no-op if the target resolves to a player | Sharpening Stone, Power Core (Items) |
| `grantKeywordTarget` | `{ target, keyword }` | Like `grantKeywordFriendlyBoard`, but grants `keyword` (until the target's owner's next `startTurn`) to a single resolved creature instead of the whole board — a no-op if the target resolves to a player. **Only safe with `Rush`/`Guard`** — see Section 4 | Rocket Boots, Bodyguard Badge (Items) |
| `silence` | `{ target }` | Strips the resolved creature's `keywords` and `tempKeywords` and sets its `silenced` flag, which suppresses all *future* template-driven behavior — `onTurnStart`/`onDeath` effects no longer fire, and it stops contributing to any aura (Section 5). **Does not retroactively undo** stat buffs it already granted (`buffAttack`/`buffHealth`) or damage already dealt — silence only stops what happens *next* | Audit Trail |

### 3.3 TargetSelector

Four kinds today:

- `{ kind: "enemyPlayer" }` — always resolves to the opposing player. No `Intent.target` needed.
- `{ kind: "selfPlayer" }` — always resolves to the effect's own controller. No `Intent.target` needed. Used for self-damage (Degens' "pay your own HP" identity — e.g. Margin Call's `damage` action targets `selfPlayer`).
- `{ kind: "chosen" }` — resolves to whatever `TargetRef` the player supplied on the `playCard` intent. **Any effect using `"chosen"` must set `requiresTarget: true`** on its `EffectDef`, or the engine will happily try to resolve an undefined target (in practice `resolveTargets` returns an empty list and the effect silently does nothing — set the flag). A `"chosen"` target can resolve to either a creature or a player `TargetRef` — nothing in the engine restricts *which* side of the board a player picks; `buffTarget`/`grantKeywordTarget` cards are steered toward a friendly creature purely by client-side UX (`util.ts`'s `targetsFriendlyCreature()`, used by both `MatchView.tsx` and `bot.ts`), not an engine-level rule.
- `{ kind: "triggerSource" }` — **Secret-only.** Resolves to whichever creature caused the Secret to fire (the attacker for `onEnemyAttack`, the just-played creature for `onEnemyPlayCreature`), passed through `EffectContext.triggerSource` by `checkAndFireSecret`. Meaningless outside a Secret's own effects — no other trigger populates `triggerSource`, so `resolveTargets` returns an empty list for it anywhere else.

There's no `allEnemyCreatures`, `randomEnemyCreature`, `adjacentFriendly`, etc. yet. Market Events implement their own bespoke targeting (e.g. MARKET_CRASH's "strongest creature per side") directly in `marketEvents.ts` rather than through this selector system — that's a reasonable pattern to follow for one-off global effects; a card-level equivalent (e.g. "deal damage to all enemy creatures") would need a new `TargetSelector` kind plus a case in `resolveTargets`.

### 3.4 Worked example — a targeted spell

```ts
spark_bolt: {
  id: "spark_bolt",
  name: "Spark Bolt",
  faction: "Neutral",
  type: "Spell",
  cost: 2,
  text: "Deal 3 damage.",
  effects: [
    {
      trigger: "onPlay",
      requiresTarget: true,
      action: { kind: "damage", target: { kind: "chosen" }, amount: 3 },
    },
  ],
},
```

### 3.5 Worked example — a status effect (Burn)

```ts
ember_curse: {
  id: "ember_curse",
  name: "Ember Curse",
  faction: "Degens",
  type: "Spell",
  cost: 2,
  keywords: ["Burn"],   // cosmetic tag — see Section 6
  text: "Deal 1 damage to the enemy player at the end of each turn for 3 turns.",
  effects: [
    { trigger: "onPlay", action: { kind: "burn", target: { kind: "enemyPlayer" }, amountPerTurn: 1, turns: 3 } },
  ],
},
```

No `requiresTarget` here — the target selector is `enemyPlayer`, resolved automatically, not player-chosen.

### 3.6 Worked example — a creature with an onTurnStart trigger (HODL)

```ts
diamond_hands: {
  id: "diamond_hands",
  name: "Diamond Hands",
  faction: "Degens",
  type: "Creature",
  cost: 4,
  attack: 2,
  health: 6,
  keywords: ["HODL"],
  text: "At the start of your turn, gain +1 Attack.",
  effects: [{ trigger: "onTurnStart", action: { kind: "buffSelf", attack: 1 } }],
},
```

Note `HODL` here is a keyword purely for player-facing communication (batlleSpec.md Section 15 names it as the signature "wait for it" mechanic) — the actual mechanical effect is the ordinary `onTurnStart` + `buffSelf` combination. There's no engine-level "HODL" special case; any creature can get this behavior by attaching the same effect, with or without the keyword tag.

---

# 4. Keywords

`Keyword = "Rush" | "Guard" | "Stealth" | "Burn" | "HODL"` — batlleSpec.md Section 11's full launch vocabulary, all implemented.

| Keyword | Mechanical effect | Where it's enforced |
|---|---|---|
| **Rush** | Can attack the turn it's summoned | `combat.ts`'s `resolveAttack` — checks `keywords.has("Rush") \|\| tempKeywords.has("Rush")` against the summoning-sickness rule |
| **Guard** | While any Guard creature is alive on a side, **every** attack against that side — whether aimed at the player or at a different creature — must target a Guard creature instead (full Taunt-style lockout, not just face-protection) | `combat.ts` — collects all enemy slots with Guard and rejects any attack whose target isn't one of them |
| **Stealth** | Can't be chosen as an attack or spell target; breaks (reveals) the instant it attacks | `matchOps.ts`'s `isTargetable`, checked in both `combat.ts` (attack target) and `engine.ts`'s `playCard` (chosen spell target) |
| **Burn** | Cosmetic tag only — the actual damage-over-time mechanic is the `burn` `EffectAction` (Section 3.2), not a `BoardCreature` keyword flag | n/a — purely a UI/flavor label on cards that use the `burn` effect |
| **HODL** | Cosmetic tag only, same pattern as Burn — the mechanic is an `onTurnStart` + `buffSelf` effect pair | n/a |

Practical upshot: **Rush, Guard, and Stealth are real runtime flags** the engine checks; **Burn and HODL are just labels** conventionally paired with a specific effect shape. If you want a new "flavor" of Burn or HODL (say, a creature that HODLs health instead of attack), you don't need to touch the keyword system at all — just write the effect.

### 4.1 Silence

Separate from the `Keyword` enum — `silenced` is a boolean field on `BoardCreature`, not a keyword, because it's a one-way state change applied *to* a creature rather than something granted by a card that owns it. The `silence` `EffectAction` (Section 3.2) is what sets it. Effects:

- Clears both `keywords` and `tempKeywords` immediately — a silenced Guard creature stops being a legal Guard, a silenced Stealth creature becomes targetable.
- Suppresses all future `onTurnStart` and `onDeath` firing for that instance (`engine.ts`'s `startTurn` and `effects.ts`'s `processPendingDeathrattles` both check the flag).
- Suppresses aura contribution (`stats.ts`'s `computeAuraBonusAttack` skips a silenced neighbor).
- **Does not** undo `buffAttack`/`buffHealth` already applied, or damage already taken — silence is forward-only, matching Hearthstone's Silence rather than a "reset to vanilla" effect.

---

# 5. Auras

```ts
interface AuraDef {
  filter: "adjacentSameFaction";
  attack?: number;
  health?: number;
}
```

Only one filter exists: `adjacentSameFaction` — applies to board neighbors (`util.ts`'s `getAdjacentSlots`, i.e. slot ± 1) sharing the source's `faction`. Auras are **computed live**, not baked into a stat — `stats.ts`'s `getEffectiveAttack` walks the board fresh every time it's called, so a buffed creature immediately loses the bonus if its aura source dies or is moved off. There's currently no health-aura consumer in the card pool and no aura-vs-attack interaction beyond `attack`/`health` — extending the filter set (e.g. `"allFriendly"`, `"adjacentAnyFaction"`) means adding a case to `computeAuraBonusAttack` in `stats.ts`.

Worked example:

```ts
moon_dog: {
  id: "moon_dog",
  name: "Moon Dog",
  faction: "Doggos",
  type: "Creature",
  cost: 3,
  attack: 4,
  health: 4,
  text: "Gain +1 Attack while next to another Doggo.",
  aura: { filter: "adjacentSameFaction", attack: 1 },
},
```

---

# 6. Adding a New Card — Checklist

1. Add a `CardTemplate` entry to `CARD_POOL` in `engine/src/cards.ts`. Keep the text simple per batlleSpec.md Section 20 — most cards shouldn't need `effects` at all.
2. If it's deck-legal (not a `token`), add it to the relevant faction's `*_SAMPLE_DECK` export (`SAMPLE_DECK` for Doggos) and adjust another card's count in that same array so it stays at exactly 30 (`DECK_SIZE`) — each faction's deck is now independent, six separate arrays, not one shared list.
3. If it introduces a genuinely new `EffectAction` kind or `TargetSelector`, add the type in `types.ts`, the resolution case in `effects.ts`, and cover it with a test in `engine/test/engine.test.ts` — follow the existing pattern of white-box-injecting the card into a hand via the `giveCard` test helper rather than relying on a lucky shuffle.
4. Run `npm run test --workspace=engine` and `npm run typecheck` (or the package's equivalent) before considering it done — see `engine/README.md`.
5. If the card is a **Stealth** or **Guard** creature, think through the cross-keyword edge case before shipping it: a creature with *both* keywords would be forced to be the only legal attack target (Guard) while simultaneously being illegal to target (Stealth). No card in the current pool combines them, and `combat.ts` has no special-case: `isTargetable` (Stealth) is checked before the Guard-forcing logic, so attacking that creature directly throws "Stealthed," while attacking the player or anything else throws "Guard creature — it must be attacked first" (since it's still counted as an active Guard slot). The practical result is a soft-lock — no attack against that side can succeed while it's alive. Add a test for whichever resolution you pick if you introduce this combination.

Nothing about the client needs to change to add a card that fits the existing patterns — `CardFace`, `HandRow`, and `BoardRow` all render generically off `CardTemplate`/`BoardCreature` data, including keyword badges. The one exception: a card whose `"chosen"` target is meant to be a *friendly* creature (an Item) is automatically routed to the right side of the board by `MatchView.tsx`'s targeting logic and `bot.ts`'s AI, both driven off `util.ts`'s `targetsFriendlyCreature()` — which currently keys off `action.kind` being `buffTarget` or `grantKeywordTarget`. If you add a new friendly-targeted `EffectAction` kind, add it to that function's check too, or the client will point it at the opponent's board and the bot will never find a valid target.

---

# 8. Secrets

A `Secret` is a fourth `CardType`, alongside Creature/Spell/Item — Hearthstone's Secret pattern, not Yu-Gi-Oh's Trap Card pattern. The distinction matters: Yu-Gi-Oh traps involve a priority/response window where the opponent can choose to activate a face-down card in reaction to a specific game event, which this engine's turn structure (strict alternating `playCard`/`attack`/`endTurn` intents, no interrupt window) doesn't support without a much bigger redesign. A Secret instead **arms automatically and fires automatically** the first time its trigger condition is met — no player decision at reveal time, which fits the existing intent-resolution model with no new turn-structure concept.

### 8.1 Playing and firing a Secret

```ts
short_position: {
  id: "short_position",
  name: "Short Position",
  faction: "Degens",
  type: "Secret",
  cost: 1,
  rarity: "Rare",
  text: "Secret: The next time the enemy plays a creature, deal 2 damage to it.",
  effects: [{ trigger: "onEnemyPlayCreature", action: { kind: "damage", target: { kind: "triggerSource" }, amount: 2 } }],
},
```

- `playCard` (`engine.ts`) special-cases `template.type === "Secret"`: it pays the cost, removes the card from hand, pushes the `templateId` onto `PlayerState.secrets`, logs "sets a secret," and returns early — no `onPlay` effects run, no board slot is used.
- `effects.ts`'s `checkAndFireSecret(state, reactingPlayerId, trigger, triggerSource)` is called from the two trigger sites that matter: `combat.ts`'s `resolveAttack` (before damage, `trigger: "onEnemyAttack"`, called on the *defender's* secrets) and `engine.ts`'s `playCard` (after a creature lands, `trigger: "onEnemyPlayCreature"`, called on the *enemy of whoever just played*). It scans `secrets` for the first template with a matching-trigger effect, removes it from the array, logs a reveal, and resolves its effect with `triggerSource` set to the creature that caused the fire.
- Only **one** Secret reacts per event — not a full chain-reveal system. If a player has two Secrets that both match the same trigger, only the first (array order) fires.
- A Secret whose effect kills the attacker before its attack lands cancels the attack outright: `resolveAttack` re-checks the attacker's board slot after `checkAndFireSecret` runs and bails out (with a log line) if it's now empty, rather than trusting the `attacker` object reference captured earlier in the function.

### 8.2 The hidden-information gap — closed

Secrets are mechanically real and fully deterministic, and are now also genuinely hidden from an opponent inspecting network traffic. `shared/src/index.ts`'s `serializeState(state, viewerId)` is per-viewer: `server/src/matchRoom.ts` calls it once per socket on every broadcast, and whichever player *isn't* the viewer has their `hand`, `deck` (order), and `secrets` replaced with same-length arrays of a placeholder id (`HIDDEN_CARD_ID`) — real counts (so "Deck: N" and the "🔒 N" Secrets badge on `PlayerHeader.tsx` still work), never real identities. The engine's own `MatchState` is untouched — this is purely an outbound redaction at the serialization boundary, same trust model as before for anything server-authoritative. The client also gained a face-down, count-only `OpponentHandRow.tsx` so the opponent's hand size is visible without ever being able to render real card data for it (there was nothing to redact there before — the client never rendered the opponent's hand at all). Play vs AI is unaffected (it never goes over the network). See `STATUS.md` Section 2.

A "🔒 N" badge on `PlayerHeader.tsx` now shows an armed Secret count for both players, next to the Deck count — closing what was a UI gap, not a rules gap (Secrets already functioned correctly without it).

---

# 9. Known Gaps

- **Items** (`CardType`'s third value) are implemented via two `EffectAction` kinds — `buffTarget` (permanent) and `grantKeywordTarget` (temporary, Rush/Guard only) — both aimed at a player-chosen friendly creature. No engine-level restriction stops an Item from targeting an *enemy* creature instead (see Section 3.3); only the client UI and bot steer toward "friendly." 5 Neutral Items exist in `CARD_POOL`.
- **Faction coverage:** all six spec.md Section 6 factions now have real depth and their own `*_SAMPLE_DECK` export in `cards.ts`, collected in `DECKS`/`getDeck()` for lookup by id. See `STATUS.md` Section 2 for the full table.
- **No deck *builder*** — `DeckPicker.tsx` lets a player pick one of the 6 fixed pre-built decks before a match (wired into both `useMatch.ts` and `useOnlineMatch.ts`/`matchRoom.ts`), but there's no way yet to build a custom list from the full pool.
- **No card editions/rarity/collectibility** — that's the entire spec.md Sections 12-20 layer (Gameplay Identity vs. Collectible Identity), which lives one level up from this document and isn't started; see architecture.md Section 6 for how that's meant to attach to a `CardTemplate` once it exists (`card_editions` / `card_instances` tables, template stays the single source of gameplay truth).
- **No full Yu-Gi-Oh-style Trap Card** (a face-down the *opponent* chooses whether/when to activate, with a priority-passing window) — deliberately out of scope for this pass; would need a turn-structure redesign well beyond the current strict-alternating-intent model. Section 8's Secrets are the intentionally smaller, Hearthstone-shaped substitute.
