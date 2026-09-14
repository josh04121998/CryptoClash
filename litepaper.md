# Floorwars — Litepaper

### v1.0 — 2026-09-14

The community/marketing-facing companion to this repo's internal design docs (`spec.md`, `architecture.md`, `collectibility.md`) — written for players, holders, and anyone sizing up the project from outside, not for a future session picking up engineering work. Where a number or decision here touches something still open internally, it's stated as open here too — this document doesn't get ahead of what's actually decided.

The published, designed version of this document is the one meant to be shared; this file is its canonical source text.

---

## 1. The idea

Floorwars brings the Pokémon-collectibles experience on-chain. Collecting and chasing rarity is the main draw — not a side layer bolted onto a card game. The battle engine, the six factions, the ranked ladder: all of it is the vehicle. The thing players are meant to get hooked on is owning, showing off, and trading cards that are genuinely theirs.

**"The floor is the battlefield."** Every faction is trading-culture themed — Doggos, Frogs, Degens, Crypto Bros, Builders, Normies — because the whole identity of the game is a Wall Street trading floor at night doubling as a battle arena.

## 2. The game

A deterministic, server-authoritative PvP trading-card battler. Two players, five board slots each, a shared Volatility meter that can trigger a Market Event and flip a match on its head. Six factions, each with a real, distinct signature mechanic:

| Faction | Signature mechanic |
|---|---|
| Doggos | Swarm — more friends on board, more Attack |
| Frogs | Copy your best creature and lean into chaos |
| Builders | Draw cards, chain combos, out-value the board |
| Degens | Pay your own HP for explosive, above-rate power |
| Crypto Bros | Ramp your Energy and scale out of control |
| Normies | Simple, sturdy, defensive — hard to punish |

**Free to play. No wallet required to jump in.** Play vs AI and Play Online both work with zero connection — a wallet is only ever asked for the moment something needs to persist, like a saved deck or a collection. That's a deliberate floor on friction, not an oversight: the collecting hook only works if getting to the game itself is instant.

## 3. Collect

Every card a player owns is real and independently valuable across five separate axes — not one dial, five:

- **Rarity** — how hard the *design* is to pull from a pack at all. Common through Genesis, seven tiers. Genesis is permanently capped at roughly 100 cards, ever — the game's own "genesis block."
- **Edition** — the print tier of a specific copy: Standard, First Edition, Full Art, Ultra, or Secret. Cosmetic only — no print of a card is ever stronger in a match than any other print of the same card. This is the one rule everything else exists to serve: real collectible value without pay-to-win.
- **Foil** — an independent shine roll on any copy, any rarity, any edition. Closer to a Pokémon "shiny" than a value multiplier stacked on rarity.
- **Serial Number** — a specific numbered copy from a capped print run (`#004/250`), where that applies.
- **Condition (Floor Grade)** — a permanent 1–10 quality roll assigned once at mint, using the game's own finance vocabulary instead of a physical grading company's (10 = Blue Chip, down to 1 = Distressed).

These axes multiply, not add. A Legendary, Secret Edition, Blue-Chip-graded, foil pull isn't a big number — it's the product of five independent long shots, exactly the way a real "only a handful in the world" card gets that way.

**Where being on-chain actually beats the physical original:** a physical grading company needs weeks and a real industry to prove a card is genuine and undamaged. A Floorwars card's Condition is provable from the chain itself, the moment it's minted — no third party, no waiting, no risk of a counterfeit slab. And where PSA publishes population reports collectors pore over, Floorwars can expose the *live, trustless* equivalent — "3 Blue Chip Secret Edition Alpha Dogs minted, out of a 250-unit run, 0 in Foil" — computed directly from the chain, verifiable by anyone, not just claimed.

## 4. The economy

Two paths that are deliberately kept apart:

**Coins** are free, earn-only, and gate the entire core progression loop — match results, daily and weekly logins, quests, permanent achievements, referrals. This is the loop every player has access to regardless of spend, and it's real: currently built out in full, not a placeholder.

**Cash-shop packs** are a separate, real-money path for players who want more shots at rares — the industry-standard "whales buy more shots" lever. It's deliberately never routed through the token, so pack pricing is never exposed to token volatility. A meaningful design constraint, not a footnote: the collecting game and the speculative asset stay on separate rails.

**Duplicate protection**: disenchant a card you don't need into Dust, craft the one you actually want. A real economy, not a grind wall with no exit.

## 5. The token

An external marketing, community, and staking layer — separate from Coins, riding this cycle's memefi wave, thematically anchored to the Doggos faction. Dogs are the most proven meme-coin lineage there is (Doge → Shiba → Floki → Bonk), and that's not incidental to the choice.

The commitment that matters most here: **any staking rewards or buybacks are funded from real revenue — a cut of cash-shop pack sales and marketplace fees — never from token emissions.** This is a direct, deliberate rejection of the pattern that collapsed Axie Infinity's SLP economy, where emission-funded rewards only held up as long as new-buyer inflow outpaced emission, and fell apart the moment growth slowed. An emission-funded reward is a promise the token can't keep once growth stalls; a revenue-funded one only pays when the game is actually earning.

Leaning toward **self-listing** — the project's own contract, an own seeded liquidity pool on a real DEX — over a bonding-curve launchpad, because self-listing lets distribution lean on what actually exists: a real playable game, the Doggos faction's built-in meme identity, and an airdrop to early players and holders as day-one distribution, rather than hoping a listing draws attention on its own. The tradeoff this takes on, stated plainly: a launchpad gives automatic, visible proof that liquidity got locked on migration — self-listing has to earn that trust itself, which means **visibly locking (or burning) liquidity and communicating it clearly is a real requirement here, not optional polish.**

**What's still open, stated honestly rather than invented for this document:** exact supply, allocation, and launch timing. Chain choice is currently leaning toward an EVM-compatible L2 (Robinhood Chain is the current frontrunner, evaluated against Solana, not locked in) — chosen for inheriting an already-shipped, already-tested wallet-connect stack rather than needing to rebuild one from scratch.

## 6. Roadmap — in order, and why that order

Floorwars is being built in a deliberate sequence, not because on-chain features aren't wanted, but because building real financial infrastructure — asset custody, a marketplace, minting — on top of a game and an economy that haven't been proven yet is the single most common failure mode in crypto gaming. The order exists specifically to not repeat it.

1. **The game itself, free and complete.** Engine, all six factions, deterministic server-authoritative combat, the full free Coins-earn loop — done and live today.
2. **Real visual identity and card art.** The current focus — every one of the game's card illustrations, generated and reviewed one at a time.
3. **Early access.** A real, playable, balanced game a crypto-native audience can actually judge — the thing that proves this isn't another unfinished promise.
4. **Token launch** — self-listed, liquidity visibly locked, an airdrop to early players and holders. The acquisition and community-building lever, launched once there's a real product to point at.
5. **On-chain minting and a marketplace** — once there's a real community actually playing and holding, built for the demand that's already there instead of hoping demand shows up because the assets exist.

## 7. Where things actually stand today

Not a promise — a status. The battle engine, all six factions, and the entire free Coins-earn loop (matches, daily/weekly rewards, quests, permanent achievements, a public leaderboard, referrals) are built and live. Wallet-connect (Sign-In with Ethereum) is the identity layer from day one. Packs, foils, rarity, crafting, and duplicate protection are all real, working systems today, not concepts. What's left before the on-chain layer starts: finishing the game's real illustrated card art (in progress) and the early-access push itself.

---

**X / Twitter:** [@playfloorwars](https://x.com/playfloorwars)

*Floorwars — the floor is the battlefield.*
