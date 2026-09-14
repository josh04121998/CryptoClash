# Floorwars — Collectibility Specification

### Version 1.1 — 2026-09-12

This document is the single authoritative spec for how a Floorwars card's *rarity*, *print*, *shine*, *condition*, and *provenance* relate to each other. It consolidates and resolves `spec.md` Sections 12–20 (which were written as an evolving log of proposals and later "resolved" patches — this doc is the clean end state) and settles the naming collisions those sections flagged as open (`spec.md` §13/§14). `spec.md` itself is left as the historical record; this file is what to build against going forward. See `card-schema.md` for gameplay effect syntax and `architecture.md` Section 6 for the underlying data-layer design — this doc only owns the collectibility model.

**Changelog:** v1.1 adds Condition/grading (Section 7) — physical-card-grading and CS:GO-wear-style scarcity, requested directly by the user — and resolves the two axis-interaction questions v1.0 had left open (Section 13).

---

## 1. Core principle

Every card has two identities that must never be allowed to blend into one:

- **Gameplay identity** — what the card *does*. Cost, stats, effects, keywords.
- **Collectible identity** — why a specific *copy* of it is valuable.

A card's gameplay identity is anchored to its cheapest available print, always. **No print of a card is ever stronger in a match than any other print of the same card.** This is the one rule everything below exists to serve — it's what lets Floorwars have genuinely rare, valuable cards without becoming pay-to-win.

---

## 2. The five independent axes

A specific card *instance* a player owns is the product of five separate, independently-varying properties. They are not levels of one scale — a card can be low on one axis and high on another at the same time.

| Axis | Question it answers | Set on | Lives in |
|---|---|---|---|
| **Rarity** | How hard is this *design* to pull from a pack at all? | the template (every copy of Moon Dog shares one Rarity) | `CARD_POOL[id].rarity` (`engine/src/cards.ts`) |
| **Edition** | What print tier is this specific copy — plain, or a premium collectible presentation? | the instance, via which `card_editions` row it points at | `card_editions.edition_type` |
| **Foil** | Does this specific copy have the shiny/holo treatment? | the instance | `card_instances.is_foil` |
| **Serial Number** | Is this copy individually numbered, and which number is it? | the instance | `card_instances.serial_number` |
| **Condition (Floor Grade)** | How pristine is this specific print — a purely cosmetic quality roll? | the instance | new: `card_instances.condition_grade` (Section 7) |

Rarity, Edition, Foil, and Serial Number are unchanged from v1.0. What's new in v1.1 is Condition — a fifth independent dial, not a replacement for or a variant of any of the other four.

---

## 3. Rarity — the pull-odds axis

Unchanged from `spec.md` §13/§17, restated for completeness. Seven tiers, assigned once per template:

| Rarity | Role |
|---|---|
| Common | Guaranteed starter-deck baseline for one chosen faction |
| Uncommon | Common pack filler, still below the guaranteed-slot floor |
| Rare | The guaranteed last-slot floor |
| Epic | Real chase tier — pack odds anchored to Pokémon TCG's Illustration Rare (~8.5%/pack any, ~1-in-70 for one specific) |
| Legendary | Top pack-obtainable chase tier — anchored to Pokémon's Hyper Rare (~1.8%/pack any, ~1-in-611 for one specific) |
| Mythic | Non-pack. Reserved for events/achievements. |
| Genesis | Non-pack, permanently capped (~100 cards total). The game's "genesis block" — its historical first-collection cards. Major-achievement territory. |

Rarity decides *which template* a pack roll lands on. It has no opinion on artwork, foiling, condition, or how many people own that specific print — those are the other four axes' job.

---

## 4. Edition — the print-tier axis

### The naming problem this resolves

`spec.md` §14's own worked example named an edition tier "**Moon Dog — Legendary**" ("animated / premium presentation") and §13 flagged that calling the premium print product "the Genesis Set" would collide with Genesis the *Rarity* tier. Both were the same mistake: reusing Rarity's vocabulary for a different axis. Resolved below by giving Edition its own vocabulary, borrowed from real TCG print-tier conventions (Pokémon, Yu-Gi-Oh) rather than reusing Rarity's.

### The five Edition tiers

| Edition | What it means | Analogous real-TCG term |
|---|---|---|
| **Standard Edition** | The plain, unremarkable print. Identical gameplay to every other edition. | Pokémon's regular/non-holo print |
| **First Edition** | A time-boxed launch-window print-run flag — not a rarity, not a lottery outcome. See the recommended correction in Section 10: this should be modeled as a *flag*, not a rung on this ladder. | Pokémon's literal "1st Edition" stamp |
| **Full Art Edition** | Alternate, full-bleed illustrated artwork replacing the standard frame's compact art window. Cosmetic only. | Pokémon's Full Art cards |
| **Ultra Edition** | Premium presentation layered on top of Full Art — animated/foil-treatment-heavy. The old "Legendary edition" example, renamed. | Yu-Gi-Oh's Ultra Rare / Pokémon's Special Illustration Rare |
| **Secret Edition** | The top chase tier. Always individually serialized (Section 6), always a hard-capped print run (Section 8). The old "Genesis edition" example, renamed. | Pokémon's Secret Rare / Yu-Gi-Oh's Secret Rare |

None of these five words appear in the Rarity ladder (Section 3). That's the whole fix.

---

## 5. Foil — the shine axis

Unchanged from `spec.md` §17: a flat, independent per-instance roll (currently 8%), applied to any pulled template regardless of its Rarity, Edition, or Condition. A Common, Standard-Edition, low-Condition card can still be foil. This is deliberately closer to a Pokémon "shiny" than a value multiplier stacked on rarity — a second, independent thing to get excited about on a flip.

**Resolved in v1.1 (was open in v1.0): yes, Foil rolls independently on every Edition tier, including Secret Edition — no exceptions.** See Section 9 for why this is safe even at the extreme combinatorial end (some grail combinations may end up with zero realized copies, which is a feature, not a bug — real secret-rare chase cards in Pokémon/Yu-Gi-Oh are sometimes famous for having *no known Gem Mint copy in existence*, and that scarcity story is part of what makes them grails). Special-casing Editions to bake in a fixed Foil value would only be a real-world necessity if physical printing presses forced it (a specific foil stamping die per rarity, which is why Yu-Gi-Oh's Starlight Rare *is* its own foil pattern by definition) — Floorwars has no such constraint, so there's no reason to give up an independent axis.

---

## 6. Serial Number — the provenance axis

A per-instance number (`#007 / 1,000`) attached when a card comes from a numbered, capped print run. Purely a provenance/collector-value signal — it says nothing about gameplay or even about Rarity/Edition on its own.

Today, serial numbers only make sense attached to Founders Set output (Section 8) — nothing else in the game produces a capped, countable print run. `card_instances.serial_number` already exists and is nullable; it's simply never populated yet.

**Where Floorwars can beat the physical original:** a serial here is backed by an on-chain mint — the serial *and* the total supply for that edition are independently, trustlessly verifiable by anyone, not just claimed on a piece of cardboard. Section 11 covers the population-report feature this enables.

---

## 7. Condition (Floor Grade) — the quality axis

**New in v1.1**, requested directly by the user: a fifth axis modeling how pristine a specific print is — blending two real precedents on purpose:

- **Physical card grading** (PSA et al.) — a discrete, numbered quality scale that's become one of the single strongest scarcity/prestige signals in the whole collectibles hobby. A "PSA 10" of a known-rare card is worth an order of magnitude more than a lower-graded copy of the exact same print.
- **CS:GO's wear system** — the actual *mechanic* worth borrowing: a hidden value rolled at the moment an item is created, then bucketed into a small number of named tiers. CS:GO never grades an item after the fact based on real handling; the roll happens once, at mint, and is permanent. That maps far more cleanly onto a digital card (which can't physically scuff from being handled) than trying to simulate corners/edges/centering/surface defects the way PSA actually does for cardboard.

### Naming — deliberately not "PSA"

**Recommendation: never call this "PSA" in-game.** PSA is a real third-party grading company's brand — using their name here would be a trademark problem, not just a flavor choice. Instead, name the mechanic and its top tier using Floorwars' own already-established trading-floor vocabulary (Coins, Dust, Market Events, "the floor is the battlefield"):

- The axis/mechanic: **Floor Grade**, an integer **1–10** (mirrors PSA's familiar 1–10 scale on purpose — that recognizability is the whole point — without using their name).
- Named bands, using real finance terms instead of PSA's photographic-condition language (Poor/Good/Mint etc.), so the theme stays consistent with the rest of the game:

| Grade | Band name | Real-grading equivalent |
|---|---|---|
| 10 | **Blue Chip** | Gem Mint |
| 9 | Prime | Mint |
| 8 | Listed | Near Mint-Mint |
| 7 | Near Prime | Near Mint |
| 5–6 | Trading Range | Excellent (-Mint) |
| 3–4 | Volatile | Very Good (-Ex) |
| 1–2 | Distressed | Good / Poor |

"Blue Chip" is a real stock-market term for the safest, most desirable, top-quality asset class — it's an unusually good direct fit for "the rarest, most desirable grade of a card," on top of tying straight into the game's existing identity. "Distressed" (finance jargon for a troubled asset) does the same job at the bottom end.

### How it's rolled

- Rolled **once, at mint time** (a pack opening, or a Founders Set mint) from a hidden float, bucketed into a Grade 1–10 the same way `rollPackCards` already turns a seed into a Rarity outcome — same determinism-by-construction story as everything else this game rolls.
- **Permanent — never re-rollable.** No "spend Dust to attempt a re-grade" mechanic. Real-world "crack out and resubmit" grading-gambling exists specifically because a physical card's condition can be reassessed by a different human grader; a digital roll has no such ambiguity to exploit, and re-rolling would turn a provenance record into a gambling loop layered on top of what's supposed to be a permanent, trustworthy fact about the card. Recommended against.
- **Independent of Rarity, Edition, and Foil** — same reasoning as Foil itself (Section 5): stacking a Rarity-biased Condition roll on top of already-rare templates would make the axes hard to reason about independently. A Common can roll Blue Chip; a Legendary can roll Distressed.
- **Rolls on every paid pull, fixed on free ones:** Standard Packs and Founders Sets roll a genuine random grade per card. Starter Decks (the guaranteed, zero-RNG baseline — `spec.md` §0's "least possible friction" principle) get a fixed baseline grade (e.g. always 7/Near Prime) rather than a roll, consistent with Starters already being Standard-Edition-only/non-foil/non-serialized (Section 8's table).

### Illustrative first-pass distribution

Same caveat as every other economy number in this codebase — a first design pass, not tuned against real data, revisit once there's telemetry:

| Grade | Band | Weight |
|---|---|---|
| 10 | Blue Chip | 2% |
| 9 | Prime | 6% |
| 8 | Listed | 12% |
| 7 | Near Prime | 18% |
| 6 | Trading Range | 20% |
| 5 | Trading Range | 16% |
| 4 | Volatile | 12% |
| 3 | Volatile | 8% |
| 2 | Distressed | 4% |
| 1 | Distressed | 2% |

Skewed toward the middle with a thin top tail, matching how real PSA population data actually looks for most cards (Gem Mint 10 is usually a small single-digit percentage of any population, not a coin flip).

### Cosmetic presentation

Purely visual, same "no new art asset" approach the Foil border already uses (session 6): a subtle overlay scaling with grade — pristine/glossy at Blue Chip, visibly duller/scuffed at Distressed. A lightweight CSS treatment on `CardFace.tsx`'s existing frame, not a new illustration per grade.

**Never affects gameplay.** Same non-negotiable rule as every other axis (Section 1) — a Distressed-grade Legendary plays identically to a Blue Chip one.

---

## 8. Where each Edition comes from (product tiers)

Three products, each gating which Editions/Foil/Serial/Condition combinations are reachable at all — this is `spec.md` §14's "Sets" concept, with "Limited Set" (flagged there as needing a real name) resolved to **Founders Set**. Chosen to avoid colliding with Genesis (Rarity) while still reading as "an early, historically-significant print run" — the game's own crypto-native framing (a "Founders" round/allocation is a familiar crypto-community concept).

| Product | Cost | Editions produced | Foil? | Condition | Serial? | Rarity range |
|---|---|---|---|---|---|---|
| **Starter Decks** | Free | Standard only | No | Fixed baseline (not rolled) | No | Common only (one chosen faction) |
| **Standard Packs** | Coins or cash-shop | Standard only | Yes (independent roll) | Rolled | No | Full curve, Common→Legendary |
| **Founders Sets** | Time-boxed real-money or event product (business model TBD — Section 13) | First Edition / Full Art / Ultra / Secret | Yes (independent roll) | Rolled | Yes, always | Any Rarity — a Founders Set can reprint an existing Common in Full Art just as easily as a Legendary |

The rule that makes this safe: whichever product a print comes from, its gameplay stats are identical.

---

## 9. Worked examples — how the axes multiply into real scarcity

| Card | Rarity | Edition | Foil | Condition | Serial | Source | Reading |
|---|---|---|---|---|---|---|---|
| Moon Dog | Rare | Standard | No | Near Prime (7) | — | Starter Deck | The free, everyone-has-it version. Fully playable, zero collector value. |
| Moon Dog | Rare | Standard | Yes | Trading Range (5) | — | Standard Pack | Same card, shiny — a nice pull, not a grail. |
| Moon Dog | Rare | Full Art | No | Listed (8) | — | Founders Set | Alternate illustrated art, no shine, plays identically to the Starter print. |
| **Alpha Dog** | **Legendary** | **Secret** | No | **Blue Chip (10)** | **#004/250** | **Founders Set** | **The grail. See the math below.** |

### The "only ~5 in the world" math, worked for real

This is the direct answer to what you described — a genuinely tiny, real, verifiable population, produced by stacking independent axes rather than one big rarity roll:

1. **Rarity** decided Alpha Dog is a Legendary template — that's a fact about the design, unrelated to any individual copy.
2. **Edition/Source**: this specific Founders Set print run is *capped at a stated `max_supply`* (a hard number set at launch — say **250** Secret Edition Alpha Dogs will ever be mintable, full stop, enforced the same way `card_editions.max_supply` already exists in the schema today).
3. **Condition** independently rolls Grade 10 (Blue Chip) on roughly **2%** of pulls (Section 7's table).
4. **Expected population** of Blue-Chip-graded Secret Edition Alpha Dogs, ever: `250 × 2% ≈ 5`.

That's your "~5 in the world" card, arrived at by real multiplication of independent, understandable axes — not a single dial cranked to an arbitrary extreme. Add the independent Foil roll on top (Section 5) and the expected count for a *foil* Blue Chip drops toward less than one — meaning it's entirely possible **zero** ever exist. That's not a bug to patch around; it's exactly how real ultra-chase cards get their mythology (some real Pokémon/Yu-Gi-Oh secret rares are famous specifically for having no known Gem Mint copy). The population-report feature (Section 11) is what turns "expected ~5" into a real, live, provably-accurate number players can watch tick toward its final value as a Founders Set print run sells out — and that live countdown is itself a strong piece of the "sought after" feeling you're going for.

---

## 10. Recommended correction: First Edition should be a flag, not a rung

Real Pokémon 1st Edition prints exist across *every* card in a set's initial print run — a 1st Edition Base Set Charizard is still just the Standard-looking card, just stamped, and a 1st Edition Base Set Common exists too. First Edition is orthogonal to *what the print looks like* — it's purely "was this instance minted during the launch window."

Modeled as one of five mutually-exclusive rungs on the Edition ladder (Section 4), First Edition can't stack with Full Art/Ultra/Secret — you'd have to pick either "this is a Full Art print" or "this is a First Edition print," which doesn't match the real-world convention it's borrowing from.

**Recommendation: split it out** — `card_editions` keeps a 4-value `edition_type` (`standard` / `full_art` / `ultra` / `secret`) and gains a separate `is_first_edition boolean`, the same shape as `is_foil` on `card_instances` today. A Founders Set print can then genuinely be "First Edition Secret Edition," matching how the physical hobby actually stacks these. This is a schema-shape call, not just a naming one — flagging for sign-off rather than just doing it, since it touches migration `0002`.

**Signed off and built (migration `0009`):** `card_editions.edition_type`'s check constraint now reads `standard` / `full_art` / `ultra` / `secret`; `card_instances` gained `is_first_edition boolean not null default false`. Schema only — nothing rolls or reads `is_first_edition` yet (no Founders Set product exists to mint one).

---

## 11. What we're borrowing from Pokémon, Yu-Gi-Oh, and CS:GO — and why

Real research, not guesswork — grounded in current (2026) TCG rarity documentation. Sources at the end.

1. **Shine as an independent axis from power** — Pokémon's holo/reverse-holo/foil treatments long predate and remain separate from its rarity-symbol system; a Common can be a foil promo. Floorwars' existing 8% flat Foil roll already follows this — confirmed as the right call.
2. **"Any card of this tier" vs. "one specific card" are different numbers** — Pokémon's Illustration Rare lands ~7.52%/pack, but a *specific* Illustration Rare is far rarer because a dozen-plus cards split that tier's odds. Floorwars' own Epic/Legendary odds (`packsRepo.ts`) are already tuned against this exact distinction (session 20) — validated by this research as correct methodology.
3. **Print-run flags are a stamp, not a lottery.** Pokémon's 1st Edition/Shadowless/Unlimited distinction is about *which physical print run* an otherwise-identical card came from — reinforces Section 10's recommendation that First Edition should be a boolean flag tied to a time window, never something `rollPackCards` decides.
4. **A guaranteed "hit" slot per pack.** Modern Pokémon packs guarantee at least one Reverse Holo/Rare-or-better slot. Floorwars' `LAST_SLOT_ODDS` already does this — confirmed as on-pattern.
5. **A rolled-at-creation, permanent quality tier, bucketed from a hidden value.** This is CS:GO's actual mechanism (a float rolled once, bucketed into Factory New → Battle-Scarred), not a physical grading company's process (which re-examines a real object after the fact for real damage). Section 7's Condition axis borrows CS:GO's *mechanic* while borrowing PSA's *cultural weight* (a numbered 1–10 scale is instantly legible as "how good is this specific copy" to anyone who's ever heard of card grading) — deliberately not borrowing PSA's actual name or band vocabulary (trademark, and it doesn't fit this game's theme as well as finance terms do).
6. **Deliberately not adopting: Yu-Gi-Oh's full rarity ladder.** Yu-Gi-Oh has stacked over a dozen named rarities over 25+ years (Common, Rare, Super Rare, Ultra Rare, Ultimate Rare, Secret Rare, Ghost Rare, Parallel Rare, Starfoil Rare, Mosaic Rare, Starlight Rare, Collector's Rare, Quarter Century Secret Rare, and more) — a real, well-documented source of confusion even among its own hardcore fans. Floorwars' 7-tier Rarity + 5-tier Edition + Foil + Condition stays expressive (more real combinatorial depth than Yu-Gi-Oh's list, per Section 9's math) while staying explicable in one sentence per axis. This is the exact trap Section 4 exists to avoid re-creating.
7. **Numbered/serialized parallels are mostly a sports-card convention** (Topps/Panini `/99`, `/25`, `1-of-1`), not a classic Pokémon/Yu-Gi-Oh one — the user's original "Pokémon-style chase card" is really a blend of Pokémon's Secret Rare *concept*, sports-card-style *serialization*, and now CS:GO-style *condition*. That blend is exactly what this doc leans into, since numbered/graded scarcity is one thing physical TCGs mostly bolt on awkwardly (a third-party grading company, a separate resale market for "raw vs. slabbed") and Floorwars' on-chain layer does natively.
8. **Anniversary reprint editions** (Yu-Gi-Oh's Quarter Century Secret Rare: existing cards re-issued in a new premium finish to mark 25 years) — a good long-tail retention lever worth remembering *later*: a future "1-Year Anniversary Founders Set" could reprint existing templates in a new finish without touching gameplay or minting new supply of the underlying template. Not needed for launch.

---

## 12. Where being on-chain beats the physical original

Two structural advantages worth stating explicitly:

- **Grading/authentication is solved by construction.** Physical TCGs need PSA/BGS grading as an entire third-party industry to prove a card is real and undamaged, with weeks of turnaround and shipping risk. Floorwars' Condition grade (Section 7) is assigned at mint and is provable from the chain itself — no external authority, no waiting, no risk of a counterfeit slab.
- **Population reports are trustless, free, and live.** Pokémon/sports-card collectors pay close attention to PSA's published population reports (how many of a given grade exist). Floorwars can expose the equivalent directly — e.g. "3 Blue Chip Secret Edition Alpha Dogs minted, out of a 250-unit run, 0 in Foil" — computed live from real `card_editions.max_supply` vs. actual mints, verifiable by any player without trusting Floorwars' own claim. **Recommendation: this should be a first-class Collection-screen feature, and arguably the single highest-leverage payoff of the whole axis system** — it's the thing that turns Section 9's "expected ~5" into a real, watchable number (`spec.md` §19 already lists "Serialised cards" as a collection-screen category this extends naturally).

---

## 12.5 A real gap: the NFT image has to bake in what the live UI renders as CSS

Raised 2026-09-14, in a chat about `grok-card-prompts.md`'s "no art needed for Foil/Condition" note — worth stating explicitly so it isn't missed whenever minting actually gets built (architecture.md Section 8, deliberately last on the roadmap).

An NFT's image is one static flat file. Foil (Section 5) and Condition (Section 7) are deliberately pure CSS effects in the *live game UI* (`CardFace.tsx`) — no separate art generated for either, ever, per `branding.md` §9.3/`grok-card-prompts.md`'s own instructions. That's correct and stays correct. But it means the **flattening/minting pipeline** (`tools/card-render/` — currently a hand-copied, one-card, no-DB prototype per its own top comment) has a job the live UI doesn't: it has to *bake* those same CSS effects into the exported image at mint time, per instance, since there's no live DOM to apply them to once the image is a static PNG sitting on IPFS/a marketplace. Two distinct problems stack here, not one:

1. **Foil/Condition — still no new art, but the compositor needs the overlay logic.** Reuse `CardFace.tsx`'s existing CSS (the rainbow-gradient foil border, a condition-scaled gloss/scuff treatment once that's built) as a layer the Playwright screenshot captures, keyed off that specific `card_instances` row's `is_foil`/`condition_grade`. Not built yet — today's prototype renders only the flat, ungraded, non-foil look.
2. **Full Art/Ultra/Secret Edition — the opposite problem, real separate art, unlike Foil/Condition.** `branding.md` §9.3 already flags these need their own generated illustration (a wider re-composition, not a filter over Standard art) — lowest priority, not started. Once that art exists, the compositor needs to pick the *right base illustration* per instance's `edition_type`, matching what `card_editions`/`card_instances` actually says. These two problems compose, not substitute for each other: a Full Art, foil, Blue-Chip-graded instance needs the Full Art illustration as its base, with the foil shimmer and condition gloss layered on top of *that* — not a special-cased fifth image.

Metadata (standard ERC-721 `attributes`) should declare Foil/Condition/Edition/Serial explicitly too, regardless of what the image shows — that's what Section 12's trustless population-report feature and any marketplace trait-filtering actually read, not the pixels. Image and metadata both need to be right; neither substitutes for the other.

Not urgent — minting itself isn't built, and Standard-illustration generation (the actual current bottleneck, `grok-card-prompts.md`) comes first regardless. Flagged here so the compositor's eventual real build accounts for it from the start rather than being discovered as a surprise once Standard art exists and someone tries to mint a foil.

---

## 13. Recommendations and open questions

Stated as recommendations, not unilateral decisions — flagging which ones are ready to build against and which still need your call.

1. **First-Edition-as-flag vs. -as-tier (Section 10): recommend flag.** Matches real-world precedent. **Signed off and built** — see Section 10's changelog note (migration `0009`).
2. **Does Foil stack independently on every Edition, including Secret (Section 5): recommend yes, always, no exceptions.** The occasional zero-population grail combo this produces is a feature (Section 9), not a bug — make the population report honest about a "0 exist" case rather than special-casing it away.
3. **Condition rolls on every paid pull, fixed baseline on free ones (Section 7): recommend yes**, mirroring CS:GO's "everything has a wear value, even the cheapest items" precedent, since it's cheap to implement uniformly and creates fun surprises across the whole pool, not just premium prints. **Schema signed off and built** (migration `0009` added `card_instances.condition_grade`) — the actual roll-at-grant logic and CSS presentation are still unbuilt.
4. **Condition should never be re-rollable/re-gradable (Section 7): recommend against ever adding this**, even as a Dust sink — it would turn a permanent provenance record into a gambling loop, undermining the one thing that makes a grade trustworthy.
5. **Founders Set business model and cadence — still your call, not decided here.** A reasonable default worth considering: a time-boxed, real-money cash-shop product (consistent with `spec.md`'s already-decided principle that real-money packs stay a separate path from the token economy), each Founders Set a distinct, named, hard-capped print run — but whether it's purely paid, partly achievement-gated, or recurring is a genuine product decision.
6. Unchanged from `spec.md` §13: the per-template **Rarity assignment is still a cost-based heuristic**, not tuned design — out of scope for this doc, noted for completeness.

---

Sources consulted for Section 11:
- [Special illustration rare card (TCG) — Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Special_illustration_rare_card_(TCG))
- [The Complete Pokémon TCG Rarity Guide — pkmntools.com](https://pkmntools.com/en/blog/pokemon-tcg-rarity-guide)
- [Pokémon TCG Rarity Guide — PokéRip](https://poke.rip/rarity-guide/)
- [Pokémon TCG Card Rarity Guide (2025-2026) — Mint Vandal](https://mintvandal.com/guides/rarity-guide/)
- [Yu-Gi-Oh Card Rarities Explained — misprint.com](https://www.misprint.com/posts/yugioh-card-rarities-explained)
- [Yu-Gi-Oh! Rarity Tiers Explained — TCG Price Lookup](https://tcgpricelookup.com/blog/yugioh-rarity-tiers-explained)
- [1st Edition (TCG) — Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/1st_Edition_(TCG))
- [Print Runs Explained: 1st Edition, Shadowless, and Unlimited — TradingCardSets.com](https://tradingcardsets.com/blogs/news/first-edition-shadowless-unlimited-explained)
