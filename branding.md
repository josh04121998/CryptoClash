# CRYPTO CLASH — Brand Guide

A reference for anyone (human or AI) generating visual assets for the game — social media, the website, or eventually card art. Read this before generating anything; it's the single source of truth for "what does Crypto Clash look like," so a new asset stays recognizably on-brand instead of drifting session to session. Update this file when the direction changes, the same way `STATUS.md` tracks build state.

---

## 1. Concept

**"The floor is the battlefield."** Crypto Clash's combat identity is a Wall Street trading floor / bullpen at night, doubling as a battle arena — not generic fantasy war-visuals. This is deliberate: the game's cast (Doggos, Frogs, Degens, Crypto Bros, Builders, Normies) is already trading-culture themed, so the visual language should feel like it belongs to the same world as the gameplay, not bolted on.

The palette and typography choices (Section 2/3) land somewhere between a Bloomberg terminal and a retro arcade cabinet — sharp neon-on-black, squared-off "technical" lettering, scanline texture. Think: an exchange-floor monitor wall that's also a fight screen. That retro-terminal/arcade quality is a real, load-bearing part of the identity, not just a side effect of the font choice — lean into it in generated art (CRT glow, scanlines, chunky pixel-adjacent shapes) rather than smoothing it into generic clean-flat-illustration style.

**Explicit non-goals:** literal Hearthstone-style painted fantasy art, photorealism, generic "crypto bro" clip-art (rocket emojis, laser eyes, cartoon coins) — the brand should read as *designed*, not as a template. See `STATUS.md` Section 0 for the same "complete and well-balanced, not AAA" bar applied to the game itself.

**Open question, raised 2026-09-08:** the user is reconsidering whether "Crypto Clash" is the right name for the game — a separate, bigger conversation from the visual identity work in this doc, not yet resolved. Consequence for asset work in the meantime: **don't bake the "CRYPTO CLASH" wordmark into anything hard to redo** (a character avatar, a mascot pose) — keep name-bearing text on separate, easily-swapped layers/overlays (see the banner mockup technique in Section 8) until the name is settled.

---

## 2. Color Palette

Pulled directly from `client/src/styles.css`'s `:root` — this is the actual, shipped palette, not an aspirational one. Any generated asset should sample from this set rather than inventing new colors, so social/website/card art all read as the same brand.

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#050907` | Base background — near-black, faint green undertone |
| `--panel` | `#0d1512` | Card/panel surfaces |
| `--panel-alt` | `#131e19` | Secondary surfaces |
| `--border` | `#22322b` | Hairline borders |
| `--border-bright` | `#2e5c46` | Emphasized borders, hover states |
| `--text` | `#dfeee7` | Primary text (off-white, cool) |
| `--text-dim` | `#71887d` | Secondary text |
| **`--accent`** | **`#f2b705`** | **Ticker gold** — the primary brand color. Logo, CTAs, "money" moments. |
| **`--accent-2`** | **`#00e28a`** | **Terminal green** — the secondary brand color. Glow, "gain" states, CTA buttons. |
| `--hp` / `--danger` | `#ff4757` | Damage, loss, warnings |
| `--energy` | `#35c7ff` | Energy resource (battle-specific — don't reuse for brand marks, keep it reserved for the in-game resource so it stays legible) |

**Primary brand pairing for social/marketing assets: gold (`#f2b705`) + terminal green (`#00e28a`) on near-black (`#050907`).** Cyan (`--energy`) is a gameplay color, not a brand color — avoid it in logo/PFP/banner work to keep that association clean.

**Faction colors** (`client/src/factionColor.ts`) — use only when an asset is explicitly about one faction, not for general brand marks:

| Faction | Hex |
|---|---|
| Doggos | `#f5a623` |
| Frogs | `#4ade80` |
| Degens | `#ef4444` |
| Crypto Bros | `#facc15` |
| Builders | `#60a5fa` |
| Normies | `#a3a3a3` |

---

## 3. Typography

- **Display / headlines:** [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) (weights 500/600/700) — a squared-off, technical face with a slight sci-fi/terminal character. Used for the logo wordmark, headlines, buttons. This is the font doing most of the "retro arcade" work in the identity — its blocky letterforms read like an old arcade marquee or a HUD font.
- **Data / numbers:** [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) (400/500/600) — anything that should read like a terminal readout (stats, prices, countdowns).
- **Body text:** plain system sans (not a brand font) — dense text needs to stay readable, not stylized.

For a logo wordmark or sticker text, Chakra Petch (or a visually similar squared/technical face — Recraft won't have the exact font, describe "squared-off technical/sci-fi lettering, slight arcade-marquee character" in prompts) is the right reference.

---

## 4. Visual Motifs

Recurring elements already shipped in the product (`LandingPage.tsx`, `TickerTape.tsx`) — reuse these rather than inventing new ones, so generated assets feel like they're from the same world:

- **NYC skyline silhouette**, lit from within (warm gold + green window lights against black), low on the frame — the "floor" the game is set on.
- **Scrolling ticker tape** — short all-caps market-flavor lines (`"BLACK SWAN EVENT DETECTED"`, `"GENESIS SUPPLY: PERMANENTLY CAPPED"`, `"FOMO +12%"`) with ▲/▼ indicators in green/red. Good texture for banners, sticker text, loading states.
- **Scanline / CRT texture** — thin horizontal line overlay, very subtle, evokes an old monitor.
- **Neon glow** — soft green/gold glow behind text and shapes, not hard drop-shadow.
- **Terminal green-on-black** as the "screen" motif generally — anything meant to look like it's displayed on a trading floor monitor.

---

## 5. Mascot & Character Direction

**First attempt, rejected (2026-09-08):** a Doggos-flagship mascot — a golden dog character in trading-floor attire. Reasoned from `STATUS.md`'s token direction (Doggos already anchor the meme/community layer) and generated as a full pack (PFP, 2 banners, 4 stickers) — but the user didn't vibe with it on review. Their reference points instead: CryptoPunks, Bored Ape Yacht Club, Milady, Ponke, and specifically a "slick Wall Street trader" avatar style currently landing well on Robinhood (e.g. accounts like Al Dunlop). Takeaway: this brand's character identity wants a **human retro-finance caricature**, not an animal mascot — closer to the trading-floor-bullpen half of the brand concept (Section 1) than the meme-animal half. The dog direction is fully retired, including for stickers — not kept as a fallback.

**Decided (2026-09-08): a retro hedge-fund-manager character** — a slick 1980s Wall Street trader caricature (swept-back hair, pinstripe suit in brand gold/green, a vintage brick cell phone as his signature prop) rendered in the same bold-outline flat-vector style. Three takes were generated and compared: a moodier/sinister pompadour version, a chubbier cartoonish/collectible-charm version closer to a BAYC feel, and the chosen **sleek/heroic version** — flowing hair and scarf, cleanest color-coordination with the brand palette, and (practically) the one whose dark suit blends into a black banner background instead of sitting on top of it like a sticker. Neither unchosen version was kept as a file — regenerate from this doc's description if either is worth revisiting.

This is now *the* face of the brand on social — see Section 8 for the actual generated assets. Model consistency notes for future generations: swept-back dark hair with a flowing scarf/tie catching the wind, pinstripe suit color-blocked in brand gold (`#f2b705`) and terminal green (`#00e28a`), a vintage brick cell phone held to the ear, confident/smirking expression, near-black background with art-deco skyscrapers.

**Render style upgraded to photorealistic (2026-09-08, same session):** the flat-vector illustration above was a good character concept but the user wanted the execution more realistic, and supplied a reference render (via Grok, not Pixa) hitting the mark — same character DNA (the hair curl, the pinstripe suit, the green/gold tie, the brick phone, gold rings) but photoreal, studio-lit against black, GQ-photoshoot energy rather than cartoon-mascot energy. Adopted directly as `pfp.jpg` (Section 8). The original flat-vector PFP is kept as `pfp-flat-vector-archive.svg`/`.png`, not deleted — still potentially useful anywhere a small/scalable flat icon is needed (a favicon, for instance) even though it's no longer the primary social identity.

**Consequence — the banner (`banner.svg`/`.png`, Section 8) now mismatches the PFP's render style** (flat-vector vs. photorealistic) and needs to be redone to match, along with the not-yet-started stickers. **Important for whoever does that regeneration:** don't just re-describe the character in a text prompt — a fresh text-only generation will not reliably reproduce the *same face*. Use `pfp.jpg` as an image-to-image / reference input instead (Flux 2 Pro or Max support this via their `attachments`/`input_image` parameter in the Pixa `generate_media` tool) so the banner and any future stickers are recognizably the *same person*, not just a similar archetype. This needs Pixa credits Flux-tier pricing (12-14/image) — see Section 8 for the current balance.

---

## 6. Voice & Tone

Confident, a little dry, in on the joke without being cringe — crypto-native shorthand (ticker lines, "the floor," "the bullpen") over generic hype-speak ("🚀 to the moon 🚀"). The game's own tagline pattern ("Skill > Deck Building > Collection Advantage > Spending" from `spec.md`) is the model: terse, declarative, slightly technical.

---

## 7. Asset Roadmap

Rough order, per the user's direction (2026-09-08):

1. ~~This doc~~ — done.
2. **Social assets** — PFP done, in its final photorealistic style (see Section 8), after two prior attempts (a rejected animal-mascot direction, then a flat-vector human trader — see Section 5). **Banner needs redoing to match the photoreal PFP, and stickers still aren't generated at all** — blocked on Pixa credits (8 left, below every model's per-image floor) as of this session. Next up once there's more credit budget: regenerate the banner using `pfp.jpg` as an image-to-image reference (see Section 5's note on why a fresh text prompt won't reproduce the same face), then 3-4 retro-trading-themed sticker poses/expressions, same technique.
3. **Website assets** — a real hero illustration for the landing page (currently CSS/SVG-only), possibly faction icons. Not started.
4. **Card art** — illustrated art for the 71 card templates. Last, and the biggest lift. **Style guide + a per-card visual spec for all 71 written up 2026-09-10 (Section 9)** — generation itself not started, and will be a slow background process (Grok generation limits), not a single session's work.

---

## 8. Generated Assets

Files in `branding/assets/`:

| File | Use | Notes |
|---|---|---|
| **`pfp.jpg`** | **Profile picture — current/primary** | Photorealistic render, user-supplied (generated via Grok, not Pixa) and adopted as the flagship social identity. Studio-lit portrait against pure black, same character as the archived vector version. |
| `banner.svg` / `.png` | X/social banner (1536×768, ~2:1) — **stale, needs redoing** | Still the old flat-vector illustration style — mismatches `pfp.jpg` now. Full-body hero pose on a glowing floor grid, art-deco skyline, open space on the left third for a logo/text overlay; the composition is still good, only the render style needs to change. Regenerate using `pfp.jpg` as an image-to-image reference (Section 5) once there's credit budget. |
| `pfp-flat-vector-archive.svg` / `.png` | Archived — not the current PFP | The original flat-vector illustration of the same character concept, `recraft-v4-vector` output. Kept for anywhere a small/scalable flat icon is still useful (a favicon, e.g.), not as a fallback for the social identity. |

`.svg` files are the real vector source (Recraft's actual output, despite the download URLs being `.jpg`-named) — use those for anything that needs to scale. `recraft-v4-vector` costs 18 credits/image via the Pixa MCP tools; photorealistic work (the banner redo, future stickers) needs a Flux model instead (12-14 credits/image) with `pfp.jpg` passed as a reference attachment for face consistency, not a fresh text prompt.

**Previewing a banner with a wordmark overlay without spending generation credits:** rather than baking text into the AI-generated image, composite it — a plain HTML page with the image positioned/masked behind CSS text is enough, screenshotted with Playwright (`chromium.launch()` → `page.goto('file:///...')` → `page.screenshot()`). This is how the two flat-vector trader takes were actually compared this session (which suit color blended better against the banner's black background) — reuse this technique for any "how would X look in context" check before spending more credits on a full regeneration.

**Retired:** the first-attempt Doggos-mascot pack (1 PFP, 2 banners, 4 stickers) — see Section 5 for why. Not kept as files; the character description there is enough to regenerate if the dog direction is ever revisited.

**Blocked on Pixa credits (8 left, below every model's per-image cost):** the banner redo and all stickers for the photorealistic character. Section 5 and this section both have enough detail to pick this back up once there's more budget.

---

## 9. Card Art

Written 2026-09-10, from a real reference the user generated (via Grok — a Moon Dog illustration, plus rarity/edition frame mockups labeled "Floor Wars — Rarity System v1"). The user has hit Grok's generation limits, so this is meant to be worked through slowly in the background over many separate sessions — write the prompt, generate, move to the next card, no rush. `spec.md` §13's Rarity table and `engine/src/cards.ts` are the source of truth for what exists; this section is purely the visual brief.

### 9.1 What to actually generate — read this before prompting anything

**Generate the illustration only — never the card.** `CardFace.tsx` (the component that renders every card in the app) has an empty `.card-face__portrait` div waiting for art — right now it's just a CSS glow placeholder. Name, cost, Attack/Health, rarity gem, faction ticker, keywords, and rules text are **all separate UI elements the app draws on top**, not part of the image. So every generated asset should be:

- A character/scene illustration **with no text, numbers, logos, card border, or UI chrome baked in** — not even the card name.
- Portrait-oriented, roughly **4:5** (the live card frame itself is ~0.74:1 w:h, but the art window is only the upper portion of that, after cost/ticker/name-plate/stats/text-box take their share — a touch wider than the whole card reads better once cropped).
- Composed with the subject centered and readable **small** — cards render as small as ~52×76px on a crowded mobile board, so one clear silhouette/pose beats fine detail that will just vanish. Generate at full resolution regardless (collection-screen/full-art views will show it large) — this is a composition note, not a resolution one.
- **Rarity is not shown in the art itself** — no special glow/background/frame-tier baked in. That's the rarity-colored border + gem, already handled by CSS (`rarityColor.ts`). What can reasonably scale with rarity is ambition of *composition* (a Legendary earning a more dynamic pose/setting than a Common) — a soft guideline, not a rule; every card still gets full illustrative effort.

### 9.2 Rendering style

Anchored on the Moon Dog reference: semi-realistic/detailed illustrated character art (anime-adjacent rendering, real lighting/shading) — **not** this doc's flat-vector or photorealistic-human mascot style (Section 5), which stays reserved for social/PFP use only. Card art is its own register, closer to a modern illustrated-TCG look than either of the brand's other two styles.

- Work the brand's existing motifs (Section 4) into the backdrop where the card's flavor allows — the lit skyline, a monitor-glow grid floor, gold/green neon — so the world feels continuous with the site, not generic fantasy backdrops. Moon Dog's space/moon backdrop is a flavor-specific exception (the card's name/ability is literally about the moon), not the default setting for every card.
- Sample color accents from the brand palette (Section 2) and the relevant faction color (Section 2's faction table) rather than inventing new hues — a Doggos card's accent lighting should read gold/amber, a Frogs card green, etc.
- No watermarks, no signatures, no incidental readable text anywhere in the scene (a monitor in the background showing gibberish numbers is fine; showing actual English words is not, since it reads as a UI mistake).

### 9.3 Editions — what needs separate generation vs. what doesn't

- **Standard** — the base illustration described here. Generate this first, for every card, before anything else.
- **Foil** — needs **no separate generation**. It's a pure CSS shimmer already implemented (`card-face--foil`, a rainbow-gradient border trick) applied at render time over a card's existing Standard art. Never generate a "foil version" of an image.
- **Full Art / 1st Edition** (the not-yet-named Limited Set tier, `spec.md` §14) — these genuinely need their own generation later: real TCG Full Art means the illustration bleeds across the whole card rather than sitting in a small window, so it's a wider/more elaborate re-composition of the same character, not a crop of the Standard art. **Lowest priority** — the client doesn't even have a slot to render this yet, and the tier still needs a real name. Don't spend generation budget here until Standard art exists for the roster.

### 9.4 Faction identity

The visual "species" for each faction's creatures, reasoned from the faction's existing name/flavor/signature mechanic (`spec.md` §6, `cards.ts`) — keep every card within its faction visually consistent with this:

| Faction | Species / archetype | Tone |
|---|---|---|
| Doggos | Dogs (breed varies by card) in trading-floor attire — suits, ties, badges | Confident, loyal, pack-minded. Moon Dog is the established reference: tailored, composed, a little smug. |
| Frogs | Frogs/toads, often with a glitch/warped visual edge | Chaotic, mischievous, degenerate-energy — "Frogs love chaos" is the literal flavor text on Chaos Croak. |
| Builders | Human engineers/coders, and robots/constructs they've built | Hoodie-and-hard-hat dev culture — earnest, a little frazzled, DIY/jury-rigged where the card's flavor calls for it. |
| Degens | Human traders (an ape/gorilla motif is fine and on-theme for Degen Ape specifically, per crypto culture's own "ape in" slang — not the default for the whole faction) | Reckless, high-stakes, gambler energy — chips, neon, wrecked or triumphant, never calm. |
| Crypto Bros | Human VC/finance bros | Smug, flashy, gym-meets-boardroom — sunglasses, chains, oversized confidence. |
| Normies | Ordinary human office workers | Deliberately plain and unremarkable — the visual contrast against every other faction's chaos *is* the point; a Normie card should look calm even when everything around it (Degens, Frogs) doesn't. |
| Neutral (Items/Spells/Secrets) | **Objects, not characters** — a whetstone, boots, a ledger, a sealed order | Trading-floor gadgets/artifacts, not portraits. Keep the same lighting/palette language as the creature cards so they don't feel like a different game. |

### 9.5 Per-card visual specs

One line per card — terse and prompt-ready, not a full paragraph brief. Grouped by faction, in `cards.ts` order. `Puppy`/`Tadpole` (summon-only tokens, never in a pack) are included last, lowest priority.

**Doggos**

| Card | Rarity | Concept |
|---|---|---|
| Fast Fang | Common | Lean, fast-breed dog (whippet/greyhound) mid-sprint lunge, aggressive momentum |
| Pup Scout | Common | Small scrappy pup, alert stance, binoculars or a lookout posture |
| Shield Pup | Uncommon | Sturdy dog holding a makeshift riot-shield/badge, standing firm |
| Puppy Swarm | Uncommon | A tumbling pile of excitable puppies |
| Pack Rush | Uncommon | A pack of dogs charging forward together, motion-blurred |
| Moon Dog | Rare | **Already established** — pinstripe suit, collar, standing on the moon with Earth visible, confident smirk. Use the existing approved reference. |
| Guard Dog | Rare | Broad-chested guard-breed (mastiff/rottweiler) in a security blazer, arms crossed, stern |
| Loyal Hound | Legendary | Noble, dignified hound in a tailored suit — calm, trusted "senior partner" presence |
| Alpha Dog | Legendary | The pack leader — imposing dog in a power suit, puppies at its heels, executive dominance |
| Shadow Pup | Common | Dark-coated dog blending into shadow, sleek and watchful |

**Frogs**

| Card | Rarity | Concept |
|---|---|---|
| Leap Frog | Common | Frog mid-leap, dynamic jump pose |
| Warty Lookout | Common | Camouflaged warty toad, watching from shadow |
| Frog Swarm | Uncommon | A cluster of tiny tadpoles in murky water |
| Sticky Tongue | Common | A frog's tongue whipping toward a glowing stock-ticker screen |
| Mimic Frog | Uncommon | Frog mid-transformation, reflective/mirror-like skin shimmer |
| Chaos Croak | Common | Frog surrounded by warping/glitching visual static, wild grin |
| Glitch Toad | Rare | Toad with a digital-glitch skin texture, pixel-fragment distortion |
| Warty Prince | Epic | A regal toad wearing a torn/mismatched dog collar like a crown — a wry nod to "legend says he was a Doggo once," otherwise a faded royal trading-floor coat |
| Copycat | Rare | Frog with a mirror/chameleon shimmer, visibly splitting into two |
| Deep Croak | Legendary | Large ancient bullfrog emerging from deep water, rippling echo-reflections implying duplication |
| Primordial Croak | Legendary | Colossal, ancient swamp-god frog — the oldest/biggest of the Frogs, chaotic energy crackling around it |

**Builders**

| Card | Rarity | Concept |
|---|---|---|
| Junior Dev | Common | Young coder at a laptop, hoodie, hard hat slightly too big, eager |
| Blueprint | Uncommon | A glowing holographic schematic unrolled in mid-air |
| Scaffold Bot | Uncommon | A construction robot built from scaffolding parts, standing guard |
| Efficient Engineer | Uncommon | Focused engineer, tool belt, checking a tablet |
| Rapid Prototype | Uncommon | A jury-rigged, duct-taped robot sprinting, sparking and half-falling-apart — "built fast, breaks fast" |
| Technical Debt | Uncommon | A crumbling, over-patched server tower held together with tape and warning signs |
| Modular Frame | Rare | A robot built from interlocking modular blocks, another modular bot nearby |
| Iteration Cycle | Epic | Engineer/robot inside a spinning-gear loop motif |
| Crunch Time | Rare | An exhausted, energy-drink-fueled coder pulling an all-nighter, manic energy, glowing screens |
| Full Stack Titan | Legendary | A massive titan built from stacked tech layers — server racks, cabling, hardware |
| Unicorn Startup | Legendary | A literal unicorn in a startup hoodie and lanyard, knowing grin, glowing horn like a tiny rocket — the visual pun is deliberate |

**Degens**

| Card | Rarity | Concept |
|---|---|---|
| Degen Ape | Common | A reckless ape/gorilla trader, chest-thumping, chaotic grin — the crypto-culture "ape in" reference |
| Margin Call | Uncommon | A trader mid-panic on a phone call, sweat, red warning screens behind |
| Rug Pull | Uncommon | A literal rug yanked out from under a trader mid-fall — betrayal, chaos |
| Leverage Trade | Uncommon | A trader balanced on a tightrope over a leverage bar, risky poise |
| YOLO All-In | Uncommon | A trader diving headfirst into a swirling, chaotic market chart |
| Blown Account | Rare | A trader with an empty wallet, dazed grin, scattered chips/coins — "high reward, paper hands" |
| Liquidated Ledger | Epic | A trader engulfed in a wall of red liquidation numbers, still standing defiant |
| Diamond Hands | Epic | A trader with glowing diamond-textured hands gripping a falling chart, unshaken |
| Moonshot | Legendary | A trader riding a literal rocket trajectory, reckless triumphant grin, chaos trailing |
| Exit Liquidity | Legendary | A trader cashing out smugly at the peak as everyone else crashes behind them — the dark crypto-culture irony is the point |
| Short Position | Rare | A shadowy, hooded figure betting against the crowd, face obscured — matches its hidden/Secret nature |

**Crypto Bros**

| Card | Rarity | Concept |
|---|---|---|
| Seed Round | Common | A confident handshake sealing an early deal, sunglasses |
| HODL Wallet | Common | A bro gripping a hardware wallet tightly like a lifeline, chain jewelry, unshaken stance |
| Angel Investor | Uncommon | A slick investor with a subtle wing motif, tailored suit, offering a check |
| Venture Capital | Uncommon | A boardroom pitch moment — a bro presenting a hockey-stick growth chart |
| Bull Run | Rare | A bro riding/wrangling a Wall-Street bull, chaotic momentum, other bros nearby |
| To The Moon | Rare | A bro launching a rocket-shaped trophy/drink skyward, over-the-top hype pose |
| Whale Wallet | Epic | A bro dwarfed by a massive whale silhouette looming behind him, signifying huge holdings |
| Compound Interest | Legendary | An older, seasoned bro radiating quiet accumulated wealth — calm, smug, stacking-coin motifs subtly worked into the scene |
| Unicorn Exit | Legendary | A triumphant bro atop a peak beside a golden unicorn statue — "the ramp was worth it," ultimate payoff pose, guarding it |

**Normies**

| Card | Rarity | Concept |
|---|---|---|
| Steady Hand | Common | A plain, calm office-worker trader, unremarkable clothes, steady stance |
| First Aid | Common | A Normie handing over a bandage/first-aid kit, caring gesture |
| Safe Harbor | Uncommon | A Normie standing by a small literal harbor/anchor, dependable |
| Rainy Day Fund | Uncommon | A Normie holding an umbrella over a piggy bank in the rain — prepared, sensible |
| Adaptive Trader | Rare | A Normie calmly adjusting amid chaos, other Normies nearby, unfazed |
| Old Reliable | Rare | An older, weathered Normie, arms crossed, unbothered — "keep it simple" |
| Community Shield | Epic | A Normie standing in front of a small group of others, shielding them |
| Steadfast Normie | Legendary | An unshaken Normie standing firm against a chaotic crashing-chart backdrop while everyone else panics — "never panic sells" |

**Neutral — Items, Spells, Secrets (objects, not characters — see 9.4)**

| Card | Rarity | Concept |
|---|---|---|
| Spark Bolt | Uncommon | A jagged bolt of electric-green energy crackling across a trading-floor monitor |
| Sharpening Stone | Common | A glowing whetstone etched with faint ticker symbols |
| Rocket Boots | Common | A pair of sleek rocket-thruster boots, gold/green exhaust glow |
| Reinforced Plating | Uncommon | Industrial armored plating/riot-vest, trading-floor styled |
| Bodyguard Badge | Uncommon | A security badge/shield emblem with a holographic seal |
| Power Core | Rare | A glowing energy core/battery, pulsing gold-green light |
| Audit Trail | Uncommon | A ledger/scroll stamped with glowing audit seals — a redacted-document aesthetic |
| Stop-Loss Order | Rare | A sealed order document with an ominous red "stop-loss" stamp — hidden/face-down, matching its Secret nature |

**Tokens (lowest priority — summon-only, never pulled from a pack)**

| Card | Concept |
|---|---|
| Puppy | A plain, wide-eyed small puppy, no gear yet |
| Tadpole | A plain small tadpole in murky water |

---

*Last updated: 2026-09-10. Added Section 9 (Card Art style guide + per-card visual specs for all 71 templates), and corrected Section 7's roadmap line. See `STATUS.md` for the session writeup.*
