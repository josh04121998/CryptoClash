# Floorwars — Litepaper

### v1.2 — 2026-10-02

The community/marketing-facing companion to this repo's internal design docs (`spec.md`, `architecture.md`, `collectibility.md`) — written for players, holders, and anyone sizing up the project from outside, not for a future session picking up engineering work. Where a number or decision here touches something still open internally, it's stated as open here too — this document doesn't get ahead of what's actually decided.

**v1.2 changes:** Section 7 was badly stale — it still said the on-chain layer hadn't started, when minting and crypto pack purchases have actually been live on **testnet** since mid-session-37/38 work this doc never caught up to. Corrected to say plainly what's real today (the mechanics work, proven on a public testnet) and what still isn't (real money, which is gated on mainnet — itself gated on real demand and a security review, not a date). Section 3's Serial Number/population-report example also updated — it described a capped print run that no longer exists (collectibility.md v1.4: specials are now an uncapped, ongoing pack mechanic, not a one-time run).

**v1.1 changes:** the token section was trimmed to a plain **TBC** — the earlier draft's self-listing/Doggos-meme-anchor/Funding-Rule detail was accurate to `STATUS.md`'s internal design direction, but the user judged it premature to publish in a public-facing document before those specifics are actually locked. Also moved off a claude.ai Artifact link and onto a real static page served from the game's own domain (`client/public/litepaper.html`) — see below.

This file is the canonical source text. The published version is `client/public/litepaper.html` — a static file Vite serves verbatim at `/litepaper.html` on the same domain as the game itself, not a third-party-hosted link, linked from the landing page's "Read the Litepaper" button.

---

## 1. The idea

Floorwars brings the Pokémon-collectibles experience on-chain. Collecting and chasing rarity is the main draw — not a side layer bolted onto a card game. The battle engine, the six factions, the ranked ladder: all of it is the vehicle. The thing players are meant to get hooked on is owning, showing off, and trading cards that are genuinely theirs.

**"The floor is the battlefield."** Every faction is trading-culture themed — Doggos, Frogs, Apes, Bulls, Bears, Cats — because the whole identity of the game is a Wall Street trading floor at night doubling as a battle arena.

## 2. The game

A deterministic, server-authoritative PvP trading-card battler. Two players, five board slots each, a shared Volatility meter that can trigger a Market Event and flip a match on its head. Six factions, each with a real, distinct signature mechanic:

| Faction | Signature mechanic |
|---|---|
| Doggos | Swarm — more friends on board, more Attack |
| Frogs | Copy your best creature and lean into chaos |
| Bears | Draw cards, chain combos, out-value the board |
| Apes | Pay your own HP for explosive, above-rate power |
| Bulls | Ramp your Energy and scale out of control |
| Cats | Simple, sturdy, defensive — hard to punish |

**Free to play. No wallet required to jump in.** Play vs AI and Play Online both work with zero connection — a wallet is only ever asked for the moment something needs to persist, like a saved deck or a collection. That's a deliberate floor on friction, not an oversight: the collecting hook only works if getting to the game itself is instant.

## 3. Collect

Every card a player owns is real and independently valuable across five separate axes — not one dial, five:

- **Rarity** — how hard the *design* is to pull from a pack at all. Common through Genesis, seven tiers. Genesis is permanently capped at roughly 100 cards, ever — the game's own "genesis block."
- **Edition** — the print tier of a specific copy: Standard, First Edition, Full Art, Ultra, or Secret. Cosmetic only — no print of a card is ever stronger in a match than any other print of the same card. This is the one rule everything else exists to serve: real collectible value without pay-to-win.
- **Foil** — an independent shine roll on any copy, any rarity, any edition. Closer to a Pokémon "shiny" than a value multiplier stacked on rarity.
- **Serial Number** — a specific numbered copy (`#41`) when a card rolls a special Edition — a real, permanent mint order, not a slot in a capped run.
- **Condition (Floor Grade)** — a permanent 1–10 quality roll assigned once at mint, using the game's own finance vocabulary instead of a physical grading company's (10 = Blue Chip, down to 1 = Distressed).

These axes multiply, not add. A Legendary, Secret Edition, Blue-Chip-graded, foil pull isn't a big number — it's the product of five independent long shots, exactly the way a real "only a handful in the world" card gets that way.

**Where being on-chain actually beats the physical original:** a physical grading company needs weeks and a real industry to prove a card is genuine and undamaged. A Floorwars card's Condition is provable from the chain itself, the moment it's minted — no third party, no waiting, no risk of a counterfeit slab. And where PSA publishes population reports collectors pore over, Floorwars can expose the *live, trustless* equivalent — "3 Blue Chip Secret Edition Alpha Dogs minted so far, 0 in Foil" — computed directly from the chain, verifiable by anyone, not just claimed.

## 4. The economy

Two paths that are deliberately kept apart:

**Coins** are free, earn-only, and gate the entire core progression loop — match results, daily and weekly logins, quests, permanent achievements, referrals. This is the loop every player has access to regardless of spend, and it's real: currently built out in full, not a placeholder.

**Cash-shop packs** are a separate, real-money path for players who want more shots at rares — the industry-standard "whales buy more shots" lever. It's deliberately never routed through the token, so pack pricing is never exposed to token volatility. A meaningful design constraint, not a footnote: the collecting game and the speculative asset stay on separate rails.

**Duplicate protection**: disenchant a card you don't need into Dust, craft the one you actually want. A real economy, not a grind wall with no exit.

## 5. The token

An external community and utility layer is planned, separate from Coins. Full tokenomics — supply, allocation, listing approach, launch timing — are still being finalized.

**TBC.**

## 6. Roadmap — in order, and why that order

Floorwars is being built in a deliberate sequence, not because on-chain features aren't wanted, but because building real financial infrastructure — asset custody, a marketplace, minting — on top of a game and an economy that haven't been proven yet is the single most common failure mode in crypto gaming. The order exists specifically to not repeat it.

1. **The game itself, free and complete.** Engine, all six factions, deterministic server-authoritative combat, the full free Coins-earn loop — done and live today.
2. **Real visual identity and card art.** The current focus — every one of the game's card illustrations, generated and reviewed one at a time.
3. **Early access.** A real, playable, balanced game a crypto-native audience can actually judge — the thing that proves this isn't another unfinished promise.
4. **Token launch** — self-listed, liquidity visibly locked, an airdrop to early players and holders. The acquisition and community-building lever, launched once there's a real product to point at.
5. **Mainnet minting and a marketplace** — once there's a real community actually playing and holding, built for the demand that's already there instead of hoping demand shows up because the assets exist. (The mechanics themselves are already built and proven — see Section 7 — what's gated on real demand is turning them on with real money.)

## 7. Where things actually stand today

Not a promise — a status. The battle engine, all six factions, and the entire free Coins-earn loop (matches, daily/weekly rewards, quests, permanent achievements, a public leaderboard, referrals) are built and live. Wallet-connect (Sign-In with Ethereum) is the identity layer from day one. Packs, foils, rarity, crafting, and duplicate protection are all real, working systems today, not concepts.

The on-chain layer has started too — deliberately on **testnet**, not mainnet, so the mechanics could be proven out before any real money touches them. Minting a card instance, and buying a pack with crypto instead of Coins, both work today against a real smart contract on Robinhood Chain's public test network — not a mockup. What that means right now: no real money changes hands yet, since testnet tokens have no real-world value and aren't purchasable with real dollars. What's left before any of this moves to mainnet: finishing the game's real illustrated card art (in progress), the early-access push itself, and a real security review of the contracts before they ever hold actual funds.

---

**X / Twitter:** [@playfloorwars](https://x.com/playfloorwars)

*Floorwars — the floor is the battlefield.*
