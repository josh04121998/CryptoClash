# CRYPTO CLASH

## Product & Game Design Specification

### Version 0.2 — Simplified Core / Pre-Production

---

# 1. Product Vision

**CRYPTO CLASH** is a free-to-play digital collectible card game built around three things:

1. **A genuinely fun and easy-to-learn card battler**
2. **Deep collecting and rarity**
3. **An optional crypto economy and digital ownership layer**

The game should feel immediately accessible like **Hearthstone** and **Teamfight Tactics**, while offering the long-term collecting appeal of Pokémon.

Crypto adds ownership, trading, scarcity, staking and community participation — but should never be required to understand the basic game.

## Design North Star

> **Easy to learn. Fast to play. Hard to master. Fun to collect.**

---

# 2. Core Product Philosophy

A new player should be able to understand the basic game after watching a single match.

The game should primarily create complexity through:

* Card combinations
* Faction synergies
* Positioning
* Resource management
* Timing
* Risk/reward decisions

It should NOT create complexity through:

* Large numbers of rules
* Dozens of keywords
* Complicated turn phases
* Long chains of reactions
* Excessive card types
* Overly complicated targeting rules

---

# 3. Core Player Loop

### Gameplay Loop

**Play → Earn Coins → Open Packs → Collect Cards → Build Deck → Battle → Earn More**

### Collector Loop

**Open Packs → Find Rare Cards → Complete Sets → Find Limited Editions → Trade → Build Collection**

### Crypto Loop

**Acquire Token → Stake → Earn Rewards/Perks → Collect/Trade → Participate**

The crypto loop is optional.

---

# 4. Target Audience

### Primary

* Casual digital card-game players
* Hearthstone players
* Pokémon collectors
* TFT players
* TCG collectors
* Crypto-native users
* NFT/digital collectible enthusiasts
* Internet culture communities

### Secondary

* Competitive TCG players
* Traditional gamers
* Players completely unfamiliar with crypto

---

# 5. Game World

The game takes place inside a fictional internet/crypto universe called **The Chain**.

Communities compete for control, influence and wealth across a constantly changing digital world.

The tone should be:

* Funny
* Self-aware
* Chaotic
* Competitive
* Internet-native
* Slightly ridiculous

Crypto culture is the inspiration, not a requirement for understanding the lore.

## IP Principle

Characters should be original.

The game can parody archetypes such as:

* Dog communities
* Frog memes
* Traders
* Builders
* Degens
* Whales
* Normies

However, third-party characters, artwork and trademarks should not be directly reproduced without licensing.

---

# 6. Factions

The launch should contain six simple factions.

## Doggos

**"More friends = stronger."**

Style:

* Aggressive
* Swarm
* Adjacency
* Speed

---

## Frogs

**"Copy it. Change it. Make it weird."**

Style:

* Copying
* Transformation
* Controlled randomness
* Trickery

---

## Degens

**"Risk everything."**

Style:

* Self-damage
* Sacrifice
* Explosive turns
* High risk / high reward

---

## Crypto Bros

**"Make money. Make more money."**

Style:

* Energy
* Resource generation
* Scaling
* Investment

---

## Builders

**"Build the machine."**

Style:

* Combos
* Spells
* Efficient cards
* Technical interactions

---

## Normies

**"Keep it simple."**

Style:

* Flexible
* Reliable
* Defensive
* Adaptable

---

# 7. Match Basics

A standard match contains:

* 2 players
* 30 HP each
* 30-card decks
* 4-card opening hand
* 5 battlefield slots
* Energy system
* Creature combat

The goal:

> Reduce the opponent's HP to 0.

---

# 8. The Battlefield

Each player has five slots.

Example:

**[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]**

Cards can be positioned anywhere there is an empty slot.

Positioning matters because certain cards interact with:

* Adjacent cards
* Center positions
* Flanks
* Specific formations

However, positioning should remain extremely easy to understand.

---

# 9. Card Types

Launch with only three card types.

### Creatures

Stay on the battlefield and fight.

### Spells

One-time effects.

### Items

Simple permanent or temporary upgrades.

No other card types are required for launch.

---

# 10. Card Stats

Creatures primarily use:

**Energy Cost**
**Attack**
**Health**

Example:

### Moon Dog

**3 Energy**

**4 / 4**

> Gain +1 Attack while next to another Doggo.

A player immediately understands the card.

---

# 11. Keywords

The launch game should have a very small keyword vocabulary.

## Rush

Can attack immediately.

## Guard

Protects the player from attacks.

## Stealth

Cannot normally be targeted until it attacks or is revealed.

## Burn

Deals damage directly or over time.

## HODL

Becomes stronger if it survives for multiple turns.

That's enough for the initial set.

New keywords can be introduced in future expansions.

---

# 12. Collectibility

Collectibility is one of the game's primary pillars.

Cards have:

### Gameplay Identity

What the card does.

### Collectible Identity

Why a particular copy is valuable.

This distinction allows us to create extremely rare cards without automatically creating extreme pay-to-win problems.

---

# 13. Rarity

Initial rarity structure:

| Rarity    | Approx. Supply |
| --------- | -------------: |
| Common    |     Very large |
| Uncommon  |          Large |
| Rare      |        ~50,000 |
| Epic      |        ~10,000 |
| Legendary |         ~1,000 |
| Mythic    |           ~100 |
| Genesis   |        ~10–100 |

Exact supply will be determined for each collection.

---

# 14. Editions

The same gameplay card can have multiple collectible editions.

Example:

### Moon Dog

Standard

### Moon Dog — First Edition

Different artwork.

### Moon Dog — Legendary

Animated / premium presentation.

### Moon Dog — Genesis

Extremely scarce.

The editions can differ in:

* Artwork
* Animation
* Foiling
* Border
* Cosmetic effects
* Serial number
* Provenance

Gameplay stats can remain identical.

---

# 15. Serial Numbers

Limited cards can be individually numbered.

Example:

**Moon Dog — Genesis**

**#007 / 1,000**

This creates collector value independent from competitive value.

Collectors can care about:

* #001
* #007
* #420
* #777
* Final serial
* Historically significant cards

---

# 16. Genesis

The first collection should have permanent historical significance.

Working target:

**100 Genesis cards**

Genesis cards should have permanently capped supply.

Owning Genesis cards should be a major collection achievement.

---

# 17. Packs

Packs are one of the most important experiences in the game.

Example:

**1,000 Coins**

**5 cards**

Packs should have:

* Guaranteed baseline value
* Rarity chances
* Exciting reveal animation
* Chance of premium editions
* Chance of extremely rare collectibles

The pack-opening experience should be one of the game's signature moments.

## Rarity chances (odds-only) vs. premium editions (cosmetic-variant) — resolved 2026-09-07

These are two separate, orthogonal axes, not one combined "how good is this pull" roll:

* **Rarity stays a pure odds mechanic.** It decides *which template* comes out of the pack — Common through Legendary, weighted so every pack guarantees at least one Uncommon+ in its last slot (implemented in `server/src/packsRepo.ts`'s `NORMAL_ODDS`/`LAST_SLOT_ODDS`). This is the "how hard is this design to get" axis, and it's the one that stays odds-only — no purchasable way to skip it (Section 29 still holds).
* **Foil is a separate, independent cosmetic roll** (Section 14's "editions... can differ in... foiling"), applied to *any* pulled template regardless of its rarity — a Common can be a foil Common. This is deliberately closer to a Pokémon "shiny" than a value multiplier stacked on rarity: it's a second, independent thing to get excited about on a flip, not a bigger jackpot on the same one. Implemented as a flat 8%-per-card roll, independent of the rarity roll.
* **First Edition and Genesis are deliberately *not* random pack outcomes.** First Edition (Section 14) is a specific print-run flag, not a per-pack coin flip — it should be tied to a time-boxed window (e.g. a launch period), consistent with how physical TCGs use the term. Genesis (Section 16) needs a hard, permanently-capped supply — if it were ever a nonzero-odds pack outcome, "permanently capped" would erode a little more with every pack opened industry-wide, so it's reserved for event/achievement grants outside the pack RNG path entirely. Mythic is held to the same standard as Genesis for the same reason. None of the three exist as pack outcomes today; `packsRepo.ts` enforces the Mythic/Genesis exclusion in code (`PACK_ELIGIBLE_RARITIES`), not just in this doc.

Both the rarity weights and the foil rate are a first real design pass, not numbers backed by playtesting or live telemetry yet — see `server/src/packsRepo.ts` for the exact figures and reasoning. Revisit once there's real pack-opening data to tune against.

---

# 18. Duplicate Protection

Duplicates should have value.

Duplicate cards can be converted into crafting resources.

Crafting allows players to work toward cards they actually want.

This prevents free players from feeling trapped by bad luck.

## Implemented 2026-09-07

The crafting resource is called **Dust** — a fully separate ledger from Coins (its own balance + audit log, `server/src/craftingRepo.ts`), never interchangeable with it. Commons and Genesis/Mythic are deliberately excluded from crafting entirely, on both the disenchant and craft side:

* **Commons** are excluded because the starting-collection grant (`grantStartingCollection`) re-tops every account up to a full set of Commons on *every* sign-in — allowing Common disenchant would let a player farm Dust for free (disenchant → sign out → sign back in → re-granted → disenchant again).
* **Genesis/Mythic** are excluded for the same reason packs exclude them (Section 17) — letting Dust craft a Genesis card would be another way around its permanently-capped supply (Section 16).

Dust values are anchored to Hearthstone's long-tested disenchant/craft economy (the closest real precedent for exactly this problem) — Uncommon 10/70, Rare 20/100, Epic 100/400, Legendary 400/1600 (disenchant value / craft cost). The ~4-7x craft:disenchant ratio is deliberate: without it, disenchanting an unwanted card and immediately re-crafting that same card back would be free, making "duplicates have value" trivially gameable. A player's foil copies of a card are protected by default when bulk-disenchanting duplicates (non-foil copies are consumed first) — crafted cards themselves are never foil, since foil stays a pack-exclusive surprise (Section 17). First design pass, not tuned against real play data, same caveat as Section 17's pack odds.

Section 21's "Coins are spent on: ... Crafting" is not implemented as written — Coins do not buy Dust or craft cards directly in this version. The shipped loop is duplicates-only (disenchant → Dust → craft), matching architecture.md Section 10's more detailed design. A Coins-funded crafting path is a possible future addition, not a decision made here.

---

# 19. Collection

Players have a dedicated collection screen showing:

* Cards owned
* Cards missing
* Sets
* Factions
* Rare cards
* Legendary cards
* Genesis
* First Editions
* Foils
* Serialised cards

The collection should feel like a digital binder.

---

# 20. Collection Status

Players can display achievements such as:

* Genesis Collector
* Full Set
* Legendary Collector
* First Edition Collector
* Rare Serial Collector

Collection status becomes social prestige.

---

# 21. Coins

Coins are the game's normal gameplay currency.

Players earn Coins by:

* Playing
* Winning
* Quests
* Daily rewards
* Weekly rewards
* Achievements
* Ranked progression
* Events

Coins are spent on:

* Packs
* Crafting
* Selected cosmetics
* Events

Coins are initially off-chain and non-transferable.

Packs can also be purchased directly with real money or stablecoin, as a separate path alongside earning Coins — the industry-standard cash-shop lever (Hearthstone, Pokémon TCG Live, MTG Arena all do this). This deliberately never routes through the external token: pack pricing stays stable in real terms and isn't exposed to token price volatility. This is the game's accepted "pay for more shots at rares" lever — not stat-boosted cards, which stay unpurchasable at any price (Section 29's rule).

---

# 22. Crypto Token

The external crypto token is separate from Coins.

### Coins

Gameplay economy.

### Token

External ecosystem economy.

This prevents the game's everyday economy from being directly tied to token price speculation.

---

# 23. Wallets

Wallets are optional.

A player can enjoy the entire core game without crypto.

Advanced players can connect a wallet to:

* Own collectibles
* Mint eligible cards
* Trade
* Use the marketplace
* Stake
* Participate in token-related systems

The wallet experience should be progressively introduced.

---

# 24. Blockchain

Blockchain is primarily used for:

* Ownership
* Scarcity
* Provenance
* Transfers
* Marketplace assets
* Token staking

The actual battle engine remains off-chain.

This keeps the game:

* Fast
* Cheap
* Reliable
* Easy to update

---

# 25. Marketplace

The eventual marketplace allows players to trade eligible:

* Cards
* Limited editions
* Cosmetics
* Genesis assets
* Other collectibles

Potential functions:

* Buy
* Sell
* Offers
* Auctions

Marketplace fees can provide an economic sink.

---

# 26. DeFi / Vault System

The crypto layer contains optional **Vaults**.

Players can stake the game's token and receive ecosystem rewards and benefits.

The Vault system should feel like part of the game's world without being necessary for normal gameplay.

---

# 27. Staking

Potential staking benefits:

* Token rewards
* XP boosts
* Cosmetic rewards
* Special card backs
* Profile effects
* Seasonal rewards
* Marketplace fee benefits
* Collector perks
* Access to special drops

## Important Rule

Staking should **not directly increase combat statistics**.

No:

> Stake 10,000 tokens → +10% Attack.

Instead:

> Stake tokens → earn cosmetic/progression/collector benefits.

## Funding Rule

Token rewards paid to stakers, and any buyback/burn activity, should be funded from real protocol revenue (a share of real-money pack sales and marketplace fees — Section 21's cash-shop path and Section 25's marketplace fee sink) — not from new token emissions.

This is a deliberate reaction to what happened to Axie Infinity's SLP: paying players in a token emitted by playing/staking only holds its value while new-buyer inflow keeps outpacing emission, which is structurally a Ponzi shape once growth slows — it isn't a hypothetical, it's the thing that already happened to the most prominent play-to-earn token. Backing rewards with a share of real revenue instead means the payout is bounded by actual cash flow, not printable supply, so it doesn't carry the same collapse mode.

---

# 28. Conviction

The staking system may include a simple **Conviction** level.

Higher commitment can unlock:

* Better cosmetic rewards
* Increased XP
* Seasonal rewards
* Collector perks
* Marketplace benefits

The system should remain optional and understandable.

---

# 29. Seasonal Vaults

Special themed Vaults can appear for limited periods.

Example:

**DOGGO VAULT**

Players stake tokens and earn Doggo-themed rewards.

This creates recurring community events around factions.

---

# 30. Free-to-Play

The game must remain genuinely playable without spending money.

Free players can:

* Play all core modes
* Earn Coins
* Open packs
* Build decks
* Compete
* Progress
* Collect cards

Paying primarily accelerates collection and access to premium collectibles.

---

# 31. Competitive Philosophy

The ideal competitive hierarchy is:

**Skill > Deck Building > Collection Advantage > Spending**

Not:

**Wallet Size > Everything**

Players may spend money to collect cards faster, but competitive skill should remain highly relevant.

---

# 32. Game Modes

Launch:

* Tutorial
* Casual
* Ranked

Future:

* Draft
* Sealed
* Tournaments
* Seasonal modes
* Guilds
* Special events

---

# 33. Technical Philosophy

The game should be:

* Server authoritative
* Fast
* Deterministic
* Data-driven
* Replayable
* Easy to balance

Blockchain should not sit in the critical path of a battle.

---

# 34. MVP

The first prototype should focus almost entirely on gameplay.

### Required

* Accounts
* Tutorial
* Basic matchmaking
* PvP
* 30 HP system
* Energy
* Battlefield
* Creatures
* Spells
* Basic factions
* Deck builder
* Collection
* Coins
* Packs

### Later

* NFTs
* Marketplace
* Token
* Staking
* Vaults
* RWA
* Tournaments
* Guilds

---

# 35. Product Test

The game should pass three tests:

### Test 1 — New Player

Can someone understand the basic rules in minutes?

### Test 2 — Experienced Player

Does the game offer meaningful strategic decisions?

### Test 3 — Collector

Does opening a pack make someone genuinely excited about what they might find?

If all three are true, the product is working.

---

# 36. North Star

CRYPTO CLASH should feel like:

> **Hearthstone simplicity + TFT-style decision making + Pokémon collecting + crypto culture.**

Not:

> A complicated crypto game with cards.

The **game comes first.**

The **collection makes it addictive.**

The **crypto layer makes ownership and participation interesting.**
