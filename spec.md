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

## Pack odds retuned to a real chase curve, anchored to actual Pokémon TCG data — resolved 2026-09-10 (session 20)

Two passes this session. The first pack-odds pass (2026-09-07) put Legendary at ~1-in-26 packs — closer to a Rare than a grail — so the user asked for Legendary to feel like a genuine chase pull, floating "1 in 1000 or more" as a target. A same-session second pass replaced that flat round number (the user's own call: "that's not legit") with odds anchored to real, sourced Pokémon TCG pull-rate data (Pokémon never publishes official odds; these are large community-measured samples): Illustration Rare ≈7.52%/pack (~1-in-13), Hyper Rare (the real "secret rare" chase tier) ≈1.85%/pack (~1-in-54) — and critically, a *specific* Hyper Rare card is only ~1-in-324, because roughly a dozen real cards split that tier's odds. "1 in 1000" had flattened away exactly that tier-vs-specific-card distinction.

Mapped onto this game's ladder: Epic ≈ the Illustration-Rare analog, Legendary ≈ the Hyper-Rare analog (Mythic/Genesis stay non-pack — see below). Retuned in `packsRepo.ts` (`NORMAL_ODDS`/`LAST_SLOT_ODDS` — full math and sourcing in that file's comment). Blended across a pack, against today's 71-template pool (17 Common/23 Uncommon/14 Rare/6 Epic/11 Legendary): Epic ≈8.5%/pack any (~1-in-70 for one specific of the 6), Legendary ≈1.8%/pack any (~1-in-611 for one specific of the 11) — both landing within the same order of magnitude as their real Pokémon analog on *both* the "any card of this tier" and "one specific card" numbers. Rare/Uncommon/Common are close to the first pass's values — Pokémon's own Rare-tier odds are already generous per pack, consistent with this game's existing "guaranteed Uncommon+ last slot" mechanic, so there was no precedent-driven reason to tighten them. Mythic/Genesis stay non-pack (Section 17's reasoning still holds: a random pack outcome would erode "permanently capped").

Still a first real design pass, not a final tuned economy — revisit once there's actual play telemetry. The user flagged, correctly, that this shouldn't turn into repeated re-tuning of constants with zero players yet to tune against; treat this table as settled until real data says otherwise.

## Every card also has a common, guaranteed-access form — resolved 2026-09-10 (session 20)

Direct answer to the "does the common version come from a different pack/set, like Pokémon?" question: **yes.** Two genuinely different things were getting conflated under "rarity," and separating them resolves it:

* **Pull rarity** (this section, Section 17) — how hard a specific *print* is to hit via pack RNG. This is what just got retuned above.
* **Access rarity** — whether a card is ever *playable* without RNG at all.

**Correction, same session:** the shipped game's version of this (`grantStartingCollection` giving every account a full set of *every faction's* Commons, refreshed on every sign-in, forever) turned out to be more generous than intended once discussed further — the user wants a real Hearthstone-style "must be earned" bar instead: **not** every faction's full Common set for free, just one faction's basic set as a guaranteed baseline, everything else (other factions, Uncommon+, other prints) earned via packs/crafting like normal. This does **not** touch Play vs AI / Play Online, which always offer every faction's premade sample deck regardless of ownership (spec.md's Section 0 "least possible friction to just play" principle is unaffected) — it's specifically about what a wallet-connected account's real, ownable collection starts with. **Decided in direction, not yet implemented** — `collectionRepo.ts`'s `grantStartingCollection` still reflects the old all-factions behavior as of this writing, and the exact mechanism (does the player choose their starting faction, or is it fixed/random?) is still open.

The part that *is* new: applying the same split to a card's *premium* prints, not just its baseline one. A card like Moon Dog should be able to exist simultaneously as: an Uncommon pulled from any standard pack (playable, unremarkable presentation), and a Full Art / 1st Edition / serial-numbered version that's exclusive to a specific limited print run or Set — genuinely hard to get, but never gating the card's *gameplay* availability, since the Uncommon print plays identically. This is exactly Section 12's stated principle ("create extremely rare cards without automatically creating extreme pay-to-win problems") applied concretely, and it's how real Pokémon does it — a card's playable rarity in a Theme Deck or common pack pull is decoupled from its rarest alt-art/secret-rare printing in one specific set. See Section 14's new "Sets" subsection for how this maps onto packs/products.

Open naming question, not resolved here: the doc doesn't yet have a "Sets" concept distinct from the Genesis *rarity* tier (Section 16) — calling the first product "the Genesis Set" would collide confusingly with "a Genesis-rarity card." Needs a real name from the user before this goes further than the concept level.

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

## Sets — where each edition comes from — resolved 2026-09-10 (session 20)

Resolves Section 13's "how does the common form differ from the chase form" question by giving editions a *source*, not just a cosmetic description. Three product tiers, each gating a different edition tier:

* **Starter decks** (free, no RNG) — guarantee the Standard edition of a card. This is what makes a card genuinely playable for free; no player is ever locked out of a card's *gameplay*, only its fancier prints.
* **Standard packs** (Section 17, Coins or cash-shop) — roll Standard-edition prints across the full Rarity curve (Common through Legendary), plus the independent Foil roll (Section 17). This is the existing shipped pack.
* **Limited Sets** (not yet named or built — see the open question below) — the only source of First Edition / Full Art / serial-numbered prints of a card. Time-boxed (Section 17 already establishes First Edition as print-run-based, not a pack RNG outcome), separate product from the ongoing Standard packs, so a card's collectible ceiling can keep growing (new Sets, new premium prints of old cards) without ever touching whether that card is playable today.

This only works if a card's *gameplay* identity (Section 12) stays anchored to its cheapest available print — a Full Art Moon Dog from a Limited Set must have the exact same stats as the Standard-pack Moon Dog, or this collapses back into pay-to-win.

**Open, not resolved here:** no name exists yet for "Limited Set" as a real in-game concept, and it needs one that doesn't collide with the Genesis *rarity* tier (Section 16) — raise with the user before building anything on top of this.

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

## Anti-farming redesign of the match-reward loop — resolved 2026-09-10 (session 20)

Raised by the user: a flat per-match Coin payout — including a flat *loss* payout — pays a bot for doing nothing. Traced the actual live exploit in `matchRoom.ts` before proposing a fix: `handleLeave` calls `forfeit()` with **zero grace period and zero minimum-engagement check**, and `forfeit()` unconditionally fires the full reward stack — Coins, both daily "play" quests, referral credit (the "friend completed a real match" gate from session 9), achievements, and rank points. So `findMatch` → immediately click Leave → full rewards, repeatable in seconds, script-able with no game logic needed at all. This is a bigger problem than the 25-Coin number itself.

**Two changes, not one:**

1. **Structural fix, modeled on how Hearthstone actually works:** Hearthstone's normal Play mode has no flat per-match gold at all — gold comes only from daily quests and capped win-streak bonuses, which by construction can't be farmed past their daily cap no matter how many extra games get played. CryptoClash already has the equivalent machinery (Section 21's Quests: Play 1/Play 3/Win 1, Daily Login, Weekly) sitting unused as a *second* income source alongside the flat per-match Coins. Proposal: **remove `MATCH_WIN_COINS`/`MATCH_LOSS_COINS`/`MATCH_DRAW_COINS` entirely** and let the already-capped quest/daily/weekly system be the only Coins-from-matches path. A normal player's first win of the day still nets 100 Coins (the `win_1` quest) — it just can't be repeated by playing match #50. Rank-ladder progression (already built, not Coins-based) remains the reason to keep playing once the day's quests are done, same role Hearthstone's ranked stars play.
2. **Engagement gate + asymmetric penalty, for what's still per-match-triggered** (quest "play"/"win" progress, referral credit, achievement/rank points — these can't be fully quest-capped away since quests themselves need *something* to count toward): void those specifically for whichever player forfeits before the match reaches meaningful play (proposed threshold: `state.turn >= 3`, so each side got at least one real turn — `MatchState.turn` already exists for this). Critically, this must be **asymmetric**: only the player who leaves early gets nothing. The opponent who stayed and queued in good faith still gets full win credit regardless of when the other side quit — voiding *both* sides (the first version of this idea) would punish the honest player for someone else's abuse, which defeats the purpose.

**Decision, made explicitly by the user rather than assumed:** ship change 1 now, defer change 2. Deleting the flat reward already shrinks the exploitable surface from "unbounded, any number of instant leaves" down to "at most one day's capped quest value per account" — judged enough for now, in exchange for not yet touching `matchRoom.ts`'s more invasive engagement-gating logic. **Change 1 is implemented** (`coinsRepo.ts`, `matchRoom.ts`, session 20): `MATCH_WIN_COINS`/`MATCH_LOSS_COINS`/`MATCH_DRAW_COINS` are gone; `awardMatchResult` now only logs a zero-amount `coin_transactions` audit row (reason `match_win`/`match_loss`/`match_draw`) so `leaderboardRepo.ts`'s Most Wins/Win Rate aggregates keep working off real match outcomes — a match itself credits zero Coins either way. **Change 2 (the `turn >= 3` engagement gate + asymmetric leave penalty) is still not built** — quest "play"/"win" progress, referral credit, and rank/achievement points still fire immediately on any forfeit, including an instant Leave, so those remain farmable up to their daily/one-time caps. Revisit change 2 if that residual surface ever turns out to matter in practice.

**Explicitly not solved by either change, flagged rather than glossed over:** two accounts colluding to both stay past `turn >= 3` and simply trade wins can still clear the (now-capped) daily quests/rank points for both accounts — reward-threshold tricks can't distinguish a colluding pair from two real opponents who both happen to play a few real turns. The fix above bounds the *damage* to one day's capped quest value per account instead of unbounded per-match farming, which is the practical mitigation available today — but real Sybil resistance (proof of unique humanity/stake, anomaly detection on suspiciously reciprocal win/loss patterns) is a materially bigger, deferred problem. Worth taking more seriously than a typical F2P game would, specifically because this game's end state has real tradeable NFT value riding on the same accounts (Section 24) — unlike Hearthstone gold, farmed Coins/collection progress here won't stay a purely in-game concern forever.


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
