# CryptoClash — Grok Card Art Prompts

### v1.0 — 2026-09-12

Ready-to-paste prompts for every card illustration, generated from `branding.md` Section 9's style guide and per-card brief, plus `collectibility.md`'s Section 8/10 (what needs generating vs. what's pure CSS). This is the working doc for the actual slow, background Grok-generation grind — go one card at a time, no rush.

**A real gap this doc fixes:** `branding.md` §9.5 (written 2026-09-10) is missing three cards that exist in `engine/src/cards.ts` — **Ember Curse**, **Pump Signal**, and **Cool Down**. They're included below with concepts derived from their actual card text, and `branding.md` should get these three added to §9.5 too next time it's touched.

**Template count:** 71 real templates + 2 summon-only tokens (Puppy/Tadpole, lowest priority) = 73, matching `engine/src/cards.ts`. This doc has all 73, plus the 5 rarity frame-asset prompts from `branding.md` §9.6.

---

## How to use this document

1. Paste a card's **Prompt** block into Grok exactly as written. Don't paraphrase it — the wording is deliberate (see the negative constraints below).
2. Before accepting a result, check it against `branding.md` §9.1's rules: no text/numbers/logos/watermarks/card-border baked in, reads as one clear silhouette even shrunk small, no rarity-specific glow/frame in the art itself.
3. Save the accepted image as `client/src/assets/cards/{id}.jpg` (the id is given after each card name below — this is `cardArt.ts`'s lookup key, same convention Moon Dog already uses).
4. Tick it off the checklist at the end of this doc.
5. **Generate every card's Standard illustration first, in full, before touching Full Art/Ultra/Secret Edition art or the frame templates** — those are lower-priority, later-stage work (`collectibility.md` §8/§10, `branding.md` §9.3).

Nothing here needs Foil or Condition/Floor Grade art — both are pure CSS effects applied at render time over the Standard illustration (`collectibility.md` §5/§7). Never generate a "foil version" or a "graded version" of an image.

---

## The two reusable style blocks

Every character-card prompt below already has the **Character Suffix** folded in at the end — you don't need to append anything extra. It's shown here once just so you know what's constant across every card and why:

> **Character Suffix:** Semi-realistic illustrated character art, anime-adjacent rendering with real lighting and shading — not flat vector, not photorealistic. Dark trading-floor backdrop: a lit NYC skyline low in the frame, or a neon monitor-grid floor, thin scanline texture, soft neon glow. Portrait orientation, roughly 4:5 aspect ratio, subject centered, one clear readable silhouette that still reads well shrunk very small. No text, no numbers, no logos, no watermark, no signature, no card border or frame, no rarity glow baked in, no readable words anywhere in the scene.

Neutral Items/Spells/Secrets are objects, not characters (`branding.md` §9.4), so they use a slightly different suffix, also already folded into their prompts below:

> **Object Suffix:** Semi-realistic illustrated object/artifact art, same rendering register as the character cards — anime-adjacent, real lighting and shading. Dark trading-floor backdrop, thin scanline texture, soft neon glow. Portrait orientation, roughly 4:5 aspect ratio, subject centered, clean readable shape even shrunk very small. No text, no numbers, no logos, no watermark, no signature, no card border or frame, no readable words anywhere in the scene.

Faction accent colors (sampled into each prompt, from `branding.md` §2): Doggos `#f5a623` · Frogs `#4ade80` · Degens `#ef4444` · Crypto Bros `#facc15` · Builders `#60a5fa` · Normies `#a3a3a3`. Neutral cards use the core brand pair instead (gold `#f2b705` / terminal green `#00e28a`), not a faction color.

---

## Doggos (accent `#f5a623`) — confident, loyal, pack-minded; dogs in trading-floor attire

### Fast Fang — Common (`fast_fang`)
> A lean, fast-breed dog (whippet or greyhound), mid-sprint lunge, aggressive forward momentum, a loosened trading-floor blazer and tie flapping behind it. Gold (`#f5a623`) accent lighting. Semi-realistic illustrated character art, anime-adjacent rendering with real lighting and shading — not flat vector, not photorealistic. Dark trading-floor backdrop: a lit NYC skyline low in the frame, or a neon monitor-grid floor, thin scanline texture, soft neon glow. Portrait orientation, roughly 4:5 aspect ratio, subject centered, one clear readable silhouette that still reads well shrunk very small. No text, no numbers, no logos, no watermark, no signature, no card border or frame, no rarity glow baked in, no readable words anywhere in the scene.

### Pup Scout — Common (`pup_scout`)
> A small, scrappy pup in a junior trading-floor vest, alert stance, holding binoculars or in a lookout posture, eyes scanning the distance. Gold (`#f5a623`) accent lighting. [+ Character Suffix]

### Shield Pup — Uncommon (`shield_pup`)
> A sturdy dog holding a makeshift riot-shield stamped with a security badge, standing firm and protective, trading-floor security uniform. Gold (`#f5a623`) accent lighting. [+ Character Suffix]

### Puppy Swarm — Uncommon (`puppy_swarm`)
> A tumbling, excitable pile of small puppies in mismatched trading-floor gear, chaotic energy, all elbows and tails. Gold (`#f5a623`) accent lighting. [+ Character Suffix]

### Pack Rush — Uncommon (`pack_rush`)
> A pack of dogs in suits charging forward together, motion-blurred, ties flying, aggressive group momentum. Gold (`#f5a623`) accent lighting. [+ Character Suffix]

### Moon Dog — Rare (`moon_dog`) — ALREADY DONE, reference only
> **Already generated and shipped — don't regenerate.** Kept here for reference since every other Doggos card is styled off it: a dog in a tailored pinstripe suit and loosened terminal-green tie, standing on the moon's surface with Earth visible in the black sky behind it, confident smirk. This is the one card with a flavor-specific space backdrop instead of the default skyline/monitor-grid (`branding.md` §9.2) — its ability is literally about the moon.

### Guard Dog — Rare (`guard_dog`)
> A broad-chested guard-breed dog (mastiff or rottweiler) in a security blazer, arms crossed, stern unmovable expression, standing at a trading-floor checkpoint. Gold (`#f5a623`) accent lighting. [+ Character Suffix]

### Loyal Hound — Legendary (`loyal_hound`)
> A noble, dignified hound in a tailored suit, calm senior-partner presence, composed posture radiating quiet trust. Gold (`#f5a623`) accent lighting, a slightly more dynamic/prestigious composition fitting its Legendary rarity. [+ Character Suffix]

### Alpha Dog — Legendary (`alpha_dog`)
> An imposing pack-leader dog in a sharp power suit, executive dominance, a few puppies looking up at it from around its feet. Gold (`#f5a623`) accent lighting, a commanding, dynamic composition fitting its Legendary rarity. [+ Character Suffix]

### Shadow Pup — Common (`shadow_pup`)
> A dark-coated dog blending into shadow at the edge of the trading floor, sleek, watchful, half-lit by a distant monitor glow. Gold (`#f5a623`) accent lighting, otherwise darker and lower-contrast than the rest of the faction. [+ Character Suffix]

---

## Frogs (accent `#4ade80`) — chaotic, mischievous, degenerate energy; frogs/toads, sometimes glitch-warped

### Leap Frog — Common (`leap_frog`)
> A frog mid-leap over trading-floor clutter, dynamic explosive jump pose, wide-eyed excitement. Green (`#4ade80`) accent lighting. [+ Character Suffix]

### Warty Lookout — Common (`warty_lookout`)
> A camouflaged warty toad crouched in shadow, watching from the edge of a monitor bank, alert and still. Green (`#4ade80`) accent lighting. [+ Character Suffix]

### Frog Swarm — Uncommon (`frog_swarm`)
> A cluster of tiny tadpoles swimming in murky green water beneath a trading-floor grate, chaotic huddle. Green (`#4ade80`) accent lighting. [+ Character Suffix]

### Sticky Tongue — Common (`sticky_tongue`)
> A frog's long sticky tongue whipping toward a glowing stock-ticker screen, mid-strike, mischievous grin. Green (`#4ade80`) accent lighting. [+ Character Suffix]

### Mimic Frog — Uncommon (`mimic_frog`)
> A frog mid-transformation, its skin reflective and mirror-like, subtly warping into another shape. Green (`#4ade80`) accent lighting. [+ Character Suffix]

### Chaos Croak — Common (`chaos_croak`)
> A frog surrounded by warping, glitching visual static, wild manic grin, digital fragments peeling off its body. Green (`#4ade80`) accent lighting. [+ Character Suffix]

### Glitch Toad — Rare (`glitch_toad`)
> A toad with a digital-glitch skin texture, pixel-fragment distortion rippling across its body, unstable and flickering. Green (`#4ade80`) accent lighting. [+ Character Suffix]

### Warty Prince — Epic (`warty_prince`)
> A regal toad wearing a torn, mismatched dog collar like a crown, a faded royal trading-floor coat, wry knowing smirk — a nod to legend that he was a Doggo once. Green (`#4ade80`) accent lighting, an ornate/regal composition fitting its Epic rarity. [+ Character Suffix]

### Copycat — Rare (`copycat`)
> A frog with a shimmering mirror/chameleon-like skin, visibly splitting into two overlapping copies of itself mid-motion. Green (`#4ade80`) accent lighting. [+ Character Suffix]

### Deep Croak — Legendary (`deep_croak`)
> A large ancient bullfrog emerging from deep water, rippling echo-like reflections around it implying duplication, heavy imposing presence. Green (`#4ade80`) accent lighting, a dynamic composition fitting its Legendary rarity. [+ Character Suffix]

### Primordial Croak — Legendary (`primordial_croak`)
> A colossal, ancient swamp-god frog, the oldest and biggest of the Frogs, chaotic crackling energy arcing around its bulk. Green (`#4ade80`) accent lighting, an epic-scale composition fitting its Legendary rarity. [+ Character Suffix]

---

## Builders (accent `#60a5fa`) — hoodie-and-hard-hat dev culture, earnest, a little frazzled; human engineers and their robots

### Junior Dev — Common (`junior_dev`)
> A young coder at a laptop, an oversized hard hat slightly too big, hoodie, eager and a little overwhelmed expression. Blue (`#60a5fa`) accent lighting. [+ Character Suffix]

### Blueprint — Uncommon (`blueprint`)
> A glowing holographic schematic unrolled in mid-air, technical wireframe lines, green-gold glow. Blue (`#60a5fa`) accent lighting. [+ Object Suffix]

### Scaffold Bot — Uncommon (`scaffold_bot`)
> A construction robot built from mismatched scaffolding parts, standing guard, industrial and jury-rigged. Blue (`#60a5fa`) accent lighting. [+ Character Suffix]

### Efficient Engineer — Uncommon (`efficient_engineer`)
> A focused engineer in a tool belt, checking a glowing tablet, calm and competent posture. Blue (`#60a5fa`) accent lighting. [+ Character Suffix]

### Rapid Prototype — Uncommon (`rapid_prototype`)
> A jury-rigged, duct-taped robot sprinting and half-falling-apart, sparking joints, "built fast, breaks fast" energy. Blue (`#60a5fa`) accent lighting. [+ Character Suffix]

### Technical Debt — Uncommon (`technical_debt`)
> A crumbling, over-patched server tower held together with tape and warning signs, leaning precariously, sparks and loose wires. Blue (`#60a5fa`) accent lighting. [+ Object Suffix]

### Modular Frame — Rare (`modular_frame`)
> A robot built from interlocking modular blocks, another modular bot visible nearby, clean geometric construction. Blue (`#60a5fa`) accent lighting. [+ Character Suffix]

### Iteration Cycle — Epic (`iteration_cycle`)
> An engineer or robot standing inside a spinning gear-loop motif, motion-blurred repetition implying an endless build cycle. Blue (`#60a5fa`) accent lighting, a more elaborate composition fitting its Epic rarity. [+ Character Suffix]

### Crunch Time — Rare (`crunch_time`)
> An exhausted, energy-drink-fueled coder pulling an all-nighter, manic wide-eyed energy, glowing monitors surrounding them. Blue (`#60a5fa`) accent lighting. [+ Character Suffix]

### Full Stack Titan — Legendary (`full_stack_titan`)
> A massive titan built from stacked tech layers — server racks, cabling, exposed hardware — towering and imposing. Blue (`#60a5fa`) accent lighting, an epic-scale composition fitting its Legendary rarity. [+ Character Suffix]

### Unicorn Startup — Legendary (`unicorn_startup`)
> A literal unicorn wearing a startup hoodie and lanyard, knowing confident grin, its horn glowing like a tiny rocket — the visual pun is deliberate. Blue (`#60a5fa`) accent lighting, a dynamic composition fitting its Legendary rarity. [+ Character Suffix]

---

## Degens (accent `#ef4444`) — reckless, high-stakes gambler energy; human traders

### Degen Ape — Common (`degen_ape`)
> A reckless ape/gorilla trader, chest-thumping, chaotic wide grin — the crypto-culture "ape in" reference, a trading-floor vest half on. Red (`#ef4444`) accent lighting. [+ Character Suffix]

### Ember Curse — Uncommon (`ember_curse`) — *not yet in branding.md §9.5, added here*
> A Degens trader with one hand outstretched, a smoldering ember-red curse sigil crackling in the air between his fingers, a reckless grin — the mark of a slow-burning hex. Red (`#ef4444`) accent lighting. [+ Character Suffix]

### Margin Call — Uncommon (`margin_call`)
> A trader mid-panic on a phone call, sweating, red warning screens flashing behind him. Red (`#ef4444`) accent lighting. [+ Character Suffix]

### Rug Pull — Uncommon (`rug_pull`)
> A literal rug yanked out from under a trader mid-fall, chips and papers flying, betrayal and chaos. Red (`#ef4444`) accent lighting. [+ Character Suffix]

### Leverage Trade — Uncommon (`leverage_trade`)
> A trader balanced precariously on a tightrope stretched over a giant leverage bar, risky tense poise. Red (`#ef4444`) accent lighting. [+ Character Suffix]

### YOLO All-In — Uncommon (`yolo_allin`)
> A trader diving headfirst into a swirling, chaotic market chart, reckless full-commitment pose. Red (`#ef4444`) accent lighting. [+ Character Suffix]

### Blown Account — Rare (`blown_account`)
> A trader with an empty turned-out wallet, dazed grin, scattered chips and coins around him — high reward, paper hands. Red (`#ef4444`) accent lighting. [+ Character Suffix]

### Liquidated Ledger — Epic (`liquidated_ledger`)
> A trader engulfed in a wall of cascading red liquidation numbers, still standing, defiant amid the collapse. Red (`#ef4444`) accent lighting, a more dramatic composition fitting its Epic rarity. [+ Character Suffix]

### Diamond Hands — Epic (`diamond_hands`)
> A trader with glowing diamond-textured hands, gripping a steeply falling chart line, unshaken expression. Red (`#ef4444`) accent lighting, a more dramatic composition fitting its Epic rarity. [+ Character Suffix]

### Moonshot — Legendary (`moonshot`)
> A trader riding a literal rocket on a steep upward trajectory, reckless triumphant grin, chaos trailing behind. Red (`#ef4444`) accent lighting, an epic-scale composition fitting its Legendary rarity. [+ Character Suffix]

### Exit Liquidity — Legendary (`exit_liquidity`)
> A trader smugly cashing out at the very peak of a chart as everyone else crashes in the background — the dark crypto-culture irony is the point. Red (`#ef4444`) accent lighting, a dynamic composition fitting its Legendary rarity. [+ Character Suffix]

### Short Position — Rare (`short_position`)
> A shadowy, hooded figure betting against the crowd, face obscured in low light — matches its hidden, face-down Secret nature. Red (`#ef4444`) accent lighting, deliberately darker/lower-contrast than the rest of the faction. [+ Character Suffix]

---

## Crypto Bros (accent `#facc15`) — smug, flashy, gym-meets-boardroom; human VC/finance bros

### Seed Round — Common (`seed_round`)
> A confident handshake sealing an early deal, sunglasses, sharp suit, easy smile. Yellow (`#facc15`) accent lighting. [+ Character Suffix]

### HODL Wallet — Common (`hodl_wallet`)
> A bro gripping a hardware wallet tightly like a lifeline, gold chain jewelry, unshaken determined stance. Yellow (`#facc15`) accent lighting. [+ Character Suffix]

### Angel Investor — Uncommon (`angel_investor`)
> A slick investor with a subtle wing motif on his tailored suit, offering a check, poised and generous smile. Yellow (`#facc15`) accent lighting. [+ Character Suffix]

### Venture Capital — Uncommon (`venture_capital`)
> A boardroom pitch moment — a bro presenting a glowing hockey-stick growth chart to an unseen room. Yellow (`#facc15`) accent lighting. [+ Character Suffix]

### Bull Run — Rare (`bull_run`)
> A bro riding and wrangling a bronze Wall-Street bull, chaotic momentum, other bros cheering nearby. Yellow (`#facc15`) accent lighting. [+ Character Suffix]

### To The Moon — Rare (`to_the_moon`)
> A bro launching a rocket-shaped trophy or drink skyward, over-the-top hype pose, huge grin. Yellow (`#facc15`) accent lighting. [+ Character Suffix]

### Whale Wallet — Epic (`whale_wallet`)
> A bro dwarfed by a massive whale silhouette looming behind him, signifying enormous holdings, calm despite the scale. Yellow (`#facc15`) accent lighting, a more dramatic composition fitting its Epic rarity. [+ Character Suffix]

### Compound Interest — Legendary (`compound_interest`)
> An older, seasoned bro radiating quiet accumulated wealth, calm and smug, subtle stacking-coin motifs worked into the scene. Yellow (`#facc15`) accent lighting, a prestigious composition fitting its Legendary rarity. [+ Character Suffix]

### Unicorn Exit — Legendary (`unicorn_exit`)
> A triumphant bro standing atop a peak beside a golden unicorn statue, guarding it, ultimate payoff pose — the ramp was worth it. Yellow (`#facc15`) accent lighting, an epic-scale composition fitting its Legendary rarity. [+ Character Suffix]

### Pump Signal — Common (`pump_signal`) — *not yet in branding.md §9.5, added here*
> A bro holding up a glowing green megaphone or broadcast dish blasting out a hype "pump" signal, an ascending chart arrow rippling out from it, wide hype grin. Yellow (`#facc15`) accent lighting. [+ Character Suffix]

---

## Normies (accent `#a3a3a3`) — deliberately plain and unremarkable, calm; ordinary office workers

### Steady Hand — Common (`steady_hand`)
> A plain, calm office-worker trader in unremarkable clothes, steady grounded stance. Grey (`#a3a3a3`) accent lighting. [+ Character Suffix]

### First Aid — Common (`first_aid`)
> A Normie handing over a bandage or first-aid kit, warm caring gesture. Grey (`#a3a3a3`) accent lighting. [+ Character Suffix]

### Safe Harbor — Uncommon (`safe_harbor`)
> A Normie standing beside a small literal harbor and anchor, dependable and grounded. Grey (`#a3a3a3`) accent lighting. [+ Character Suffix]

### Rainy Day Fund — Uncommon (`rainy_day_fund`)
> A Normie holding an umbrella over a piggy bank in the rain, sensible and prepared. Grey (`#a3a3a3`) accent lighting. [+ Character Suffix]

### Adaptive Trader — Rare (`adaptive_trader`)
> A Normie calmly adjusting papers amid surrounding chaos, other Normies nearby, entirely unfazed. Grey (`#a3a3a3`) accent lighting. [+ Character Suffix]

### Old Reliable — Rare (`old_reliable`)
> An older, weathered Normie, arms crossed, calmly unbothered — keep it simple energy. Grey (`#a3a3a3`) accent lighting. [+ Character Suffix]

### Community Shield — Epic (`community_shield`)
> A Normie standing protectively in front of a small group of others, shielding them, calm resolve. Grey (`#a3a3a3`) accent lighting, a more dramatic composition fitting its Epic rarity. [+ Character Suffix]

### Steadfast Normie — Legendary (`steadfast_normie`)
> An unshaken Normie standing firm against a chaotic crashing-chart backdrop while everyone else panics around him — never panic sells. Grey (`#a3a3a3`) accent lighting, a striking composition fitting its Legendary rarity. [+ Character Suffix]

### Cool Down — Common (`cool_down`) — *not yet in branding.md §9.5, added here*
> A Normie calmly placing a steady hand on an overheating, spiking monitor gauge, visibly cooling and settling it, unhurried composed expression. Grey (`#a3a3a3`) accent lighting. [+ Character Suffix]

---

## Neutral — Items, Spells, Secrets (accent: brand gold `#f2b705` / terminal green `#00e28a`, not a faction color)

Objects/artifacts, not characters (`branding.md` §9.4) — same lighting/palette language as the faction cards so they don't feel like a different game.

### Spark Bolt — Uncommon (`spark_bolt`)
> A jagged bolt of electric-green energy crackling across a trading-floor monitor, sharp and sudden. Terminal-green (`#00e28a`) accent lighting. [+ Object Suffix]

### Sharpening Stone — Common (`sharpening_stone`)
> A glowing whetstone etched with faint ticker symbols, softly lit. Gold (`#f2b705`) accent lighting. [+ Object Suffix]

### Rocket Boots — Common (`rocket_boots`)
> A pair of sleek rocket-thruster boots, gold and green exhaust glow beneath them. Gold/green (`#f2b705`/`#00e28a`) accent lighting. [+ Object Suffix]

### Reinforced Plating — Uncommon (`reinforced_plating`)
> Industrial armored plating styled like a riot vest, trading-floor design language. Gold (`#f2b705`) accent lighting. [+ Object Suffix]

### Bodyguard Badge — Uncommon (`bodyguard_badge`)
> A security badge/shield emblem with a holographic seal, clean metallic finish. Terminal-green (`#00e28a`) accent lighting. [+ Object Suffix]

### Power Core — Rare (`power_core`)
> A glowing energy core or battery, pulsing gold-green light from within. Gold/green (`#f2b705`/`#00e28a`) accent lighting. [+ Object Suffix]

### Audit Trail — Uncommon (`audit_trail`)
> A ledger or scroll stamped with glowing audit seals, a redacted-document aesthetic. Terminal-green (`#00e28a`) accent lighting. [+ Object Suffix]

### Stop-Loss Order — Rare (`stop_loss_order`)
> A sealed order document with an ominous red "stop-loss" stamp, hidden and face-down — matches its Secret, hidden nature. Deliberately darker/lower-contrast than the rest of this group. [+ Object Suffix]

---

## Tokens (lowest priority — summon-only, never pulled from a pack)

### Puppy (`puppy`)
> A plain, wide-eyed small puppy, no gear yet, simple and innocent. Gold (`#f5a623`) accent lighting. [+ Character Suffix]

### Tadpole (`tadpole`)
> A plain small tadpole swimming in murky water, simple shape. Green (`#4ade80`) accent lighting. [+ Character Suffix]

---

## Rarity frame templates (`branding.md` §9.6) — do these last, after all 73 illustrations exist

One reusable frame/border shell per rarity, no card-specific content — the second rendering pipeline (`tools/card-render/`) composites these behind a card's real art + data-driven text.

**v1.1 correction (2026-09-14):** the first pass at these five (now in `branding/assets/Rarity/`) came back two ways off-spec and both need fixing in this regen:
1. **Dimensions weren't consistent or exact.** "750×1050 (or a clean multiple)" was too loose — the accepted set landed at 1152×1728 for Common but 1184×1664 for the other four (different pixel counts *and* different aspect ratios). The compositor needs one fixed crop rectangle that works for all five, so this round must land on the exact same pixel dimensions across all five, no exceptions. State the target dimensions as a hard requirement, not a suggestion, and if Grok returns something else, reject and regenerate rather than accepting a close-enough size.
2. **The flat background wasn't actually flat.** Each tier's accent glow bled into the art-window/background area instead of staying neutral — sampled pixel color drifted further from the target hex as the accent got more saturated (Legendary's background sampled at `(6,9,14)` vs. the `#0b120e` target `(11,18,14)`, Rare/Epic similarly color-shifted toward blue/purple). A drifting, per-tier-tinted "flat" area can't be chroma-keyed with one tolerance value across all five frames. The background region must be genuinely unlit and identical in hue across all five images — only the frame/metal/gem art itself should carry the rarity color, never the field behind it.

**v1.2 correction (2026-09-14):** the same first-pass set has a third problem — name and rules text are never baked into this image, they're composited on top of it at render time (`tools/card-render/render-card.mjs` + `template.html`, the working prototype this frame is meant to replace), but the frame still has to leave a correctly *sized* flat region for that overlay to land in. It didn't: the accepted frames gave almost the entire interior to one continuous art window and left only a ~5.6%-of-height caption strip below it — big enough for a one-line footer, nowhere near enough for keywords + a multi-sentence rules-text paragraph. `template.html` already proves out the proportions that actually work (measured off its own CSS, all fractions of total card height):

| region | height | purpose |
|---|---|---|
| name plate | 8.2% | card name, one line |
| art window | 56.2% | the character/object illustration |
| **rules-text panel** | **25.7%** | keywords + rules text, multiple lines — this is the region that was missing |
| footer + stat gems | 9.9% | type/faction footer line, hexagon/circle stat sockets |

Translated to this doc's 750×1050 target: name plate **y=0–86**, art window **y=86–676**, rules-text panel **y=676–946**, footer/stat-gem row **y=946–1050**. The rules-text panel must be its own visibly recessed inset area — same visual treatment as the name plate (a darker sunken panel with a border), not just leftover space under the art — so the compositor can find it and so it doesn't read as an accidental gap. Folded into the per-tier prompts below alongside the v1.1 fixes.

Before accepting any result this time: check the image is exactly 750×1050px; sample a pixel from the art window center and the top-left corner (both should read at or extremely close to `#0b120e` / `11,18,14`); and check the rules-text panel is visibly present as its own inset band roughly a quarter of the card's height, not a thin caption strip. Regenerate rather than accepting if any check fails.

All five: exactly 750×1050px, no name, no creature, no card-specific content.

### Common frame (`#9ca3af`)
> An ornate card border/bezel, laid out top to bottom as four distinct regions: (1) a top name-plate band, roughly 8% of the total card height; (2) a large art window below it, roughly 56% of the card height; (3) a second recessed inset panel below the art window, roughly 25% of the card height — same sunken/bordered visual treatment as the name-plate band, sized clearly larger than the name-plate, meant to hold several lines of text; (4) a bottom footer strip with two stat-gem sockets (a hexagon socket for cost/attack, a circle socket for health) in the remaining ~10% of the height. Corner ornaments frame the whole thing. Muted silver-grey metal and gem tone (`#9ca3af`), restrained and simple ornamentation befitting the lowest rarity tier. Dark trading-floor/gold-green brand visual language otherwise. The art-window and the recessed text panel and every other background area must be a single perfectly flat, unlit solid fill of exactly `#0b120e` — no gradient, no vignette, no glow, no light spill from the frame into these areas, like a solid chroma-key plate. No scene, no character, no text, no card name. Output exactly 750×1050px, portrait, nothing cropped or padded beyond that.

### Uncommon frame (`#22c55e`)
> Same four-region structure as the Common tier — name-plate band (~8% height), art window (~56% height), a second recessed text panel below the art window sized clearly larger than the name-plate (~25% height), footer strip with hexagon cost/attack gem socket and circle health gem socket (~10% height) — but in terminal-green metal/gem tones (`#22c55e`), with slightly more detailed ornamentation than Common. The art-window and the recessed text panel and every other background area must be a single perfectly flat, unlit solid fill of exactly `#0b120e` — no gradient, no vignette, no glow, no light spill from the frame into these areas, like a solid chroma-key plate. No scene, no text, no card name. Output exactly 750×1050px, portrait, nothing cropped or padded beyond that.

### Rare frame (`#3b82f6`)
> Same four-region structure again — name-plate band (~8% height), art window (~56% height), a second recessed text panel below the art window sized clearly larger than the name-plate (~25% height), footer strip with stat-gem sockets (~10% height) — in blue metal/gem tones (`#3b82f6`), with noticeably more ornate metalwork than Uncommon. The art-window and the recessed text panel and every other background area must be a single perfectly flat, unlit solid fill of exactly `#0b120e` — no gradient, no vignette, no glow, no light spill from the frame into these areas, like a solid chroma-key plate. No scene, no text, no card name. Output exactly 750×1050px, portrait, nothing cropped or padded beyond that.

### Epic frame (`#a855f7`)
> Same four-region structure again — name-plate band (~8% height), art window (~56% height), a second recessed text panel below the art window sized clearly larger than the name-plate (~25% height), footer strip with stat-gem sockets (~10% height) — in purple metal/gem tones (`#a855f7`), with elaborate, richly detailed metal and gem work. The art-window and the recessed text panel and every other background area must be a single perfectly flat, unlit solid fill of exactly `#0b120e` — no gradient, no vignette, no glow, no light spill from the frame into these areas, like a solid chroma-key plate. No scene, no text, no card name. Output exactly 750×1050px, portrait, nothing cropped or padded beyond that.

### Legendary frame (`#f59e0b`)
> Same four-region structure again — name-plate band (~8% height), art window (~56% height), a second recessed text panel below the art window sized clearly larger than the name-plate (~25% height), footer strip with stat-gem sockets (~10% height) — in gold metal/gem tones (`#f59e0b`) — the most ornate and precious-looking of the five: heavy gold metalwork, glowing gem sockets, should read as a genuine treasure, the way Hearthstone's own Legendary frame does. The art-window and the recessed text panel and every other background area must be a single perfectly flat, unlit solid fill of exactly `#0b120e` — no gradient, no vignette, no glow, no light spill from the frame into these areas, like a solid chroma-key plate. No scene, no text, no card name. Output exactly 750×1050px, portrait, nothing cropped or padded beyond that.

*(Mythic/Genesis frames: lowest priority, do last if at all — no shipped template currently uses either rarity.)*

---

## Progress checklist

**Doggos:** ☐ Fast Fang · ☐ Pup Scout · ☐ Shield Pup · ☐ Puppy Swarm · ☐ Pack Rush · ☑ Moon Dog (done) · ☐ Guard Dog · ☐ Loyal Hound · ☐ Alpha Dog · ☐ Shadow Pup

**Frogs:** ☐ Leap Frog · ☐ Warty Lookout · ☐ Frog Swarm · ☐ Sticky Tongue · ☐ Mimic Frog · ☐ Chaos Croak · ☐ Glitch Toad · ☐ Warty Prince · ☐ Copycat · ☐ Deep Croak · ☐ Primordial Croak

**Builders:** ☐ Junior Dev · ☐ Blueprint · ☐ Scaffold Bot · ☐ Efficient Engineer · ☐ Rapid Prototype · ☐ Technical Debt · ☐ Modular Frame · ☐ Iteration Cycle · ☐ Crunch Time · ☐ Full Stack Titan · ☐ Unicorn Startup

**Degens:** ☐ Degen Ape · ☐ Ember Curse · ☐ Margin Call · ☐ Rug Pull · ☐ Leverage Trade · ☐ YOLO All-In · ☐ Blown Account · ☐ Liquidated Ledger · ☐ Diamond Hands · ☐ Moonshot · ☐ Exit Liquidity · ☐ Short Position

**Crypto Bros:** ☐ Seed Round · ☐ HODL Wallet · ☐ Angel Investor · ☐ Venture Capital · ☐ Bull Run · ☐ To The Moon · ☐ Whale Wallet · ☐ Compound Interest · ☐ Unicorn Exit · ☐ Pump Signal

**Normies:** ☐ Steady Hand · ☐ First Aid · ☐ Safe Harbor · ☐ Rainy Day Fund · ☐ Adaptive Trader · ☐ Old Reliable · ☐ Community Shield · ☐ Steadfast Normie · ☐ Cool Down

**Neutral:** ☐ Spark Bolt · ☐ Sharpening Stone · ☐ Rocket Boots · ☐ Reinforced Plating · ☐ Bodyguard Badge · ☐ Power Core · ☐ Audit Trail · ☐ Stop-Loss Order

**Tokens:** ☐ Puppy · ☐ Tadpole

**Rarity frames (do last):** ☐ Common · ☐ Uncommon · ☐ Rare · ☐ Epic · ☐ Legendary
