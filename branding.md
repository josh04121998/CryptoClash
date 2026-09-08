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

---

## 6. Voice & Tone

Confident, a little dry, in on the joke without being cringe — crypto-native shorthand (ticker lines, "the floor," "the bullpen") over generic hype-speak ("🚀 to the moon 🚀"). The game's own tagline pattern ("Skill > Deck Building > Collection Advantage > Spending" from `spec.md`) is the model: terse, declarative, slightly technical.

---

## 7. Asset Roadmap

Rough order, per the user's direction (2026-09-08):

1. ~~This doc~~ — done.
2. **Social assets** — PFP + banner done (see Section 8), on the second attempt (first was a rejected animal-mascot direction, see Section 5). **Stickers not yet regenerated for the new character** — ran low on Pixa credits (26 left after the trader exploration/banner) mid-session; the old dog-based stickers were retired along with the rest of that direction rather than kept mismatched. Next up when there's more credit budget: 3-4 retro-trading-themed sticker poses/expressions for the hedge-fund-manager character.
3. **Website assets** — a real hero illustration for the landing page (currently CSS/SVG-only), possibly faction icons. Not started.
4. **Card art** — illustrated art for the 60 card templates. Last, and the biggest lift — not started.

---

## 8. Generated Assets

Everything here lives in `branding/assets/` as both `.svg` (the real vector source — Recraft's actual output, despite the download URLs being `.jpg`-named; use these for anything that needs to scale, like a large banner print) and `.png` (a rendered preview at the source resolution, for quick viewing/upload where an SVG isn't accepted). Generated with `recraft-v4-vector` (18 credits/image via the Pixa MCP tools) — model choice matters for regenerating in the same style later.

| File | Use | Notes |
|---|---|---|
| `pfp.svg` / `.png` | Profile picture | Self-contained circular badge composition — crop-ready as-is. The retro hedge-fund-manager character, sleek/heroic take. |
| `banner.svg` / `.png` | X/social banner (1536×768, ~2:1) | Full-body hero pose on a glowing floor grid, art-deco skyline, open space on the left third for a logo/text overlay. |

**Previewing a banner with a wordmark overlay without spending generation credits:** rather than baking text into the AI-generated image, composite it — a plain HTML page with the image positioned/masked behind CSS text is enough, screenshotted with Playwright (`chromium.launch()` → `page.goto('file:///...')` → `page.screenshot()`). This is how the C-vs-B comparison was actually decided this session (which suit color blended better against the banner's black background) — reuse this technique for any "how would X look in context" check before spending more credits on a full regeneration.

**Retired:** the first-attempt Doggos-mascot pack (1 PFP, 2 banners, 4 stickers) — see Section 5 for why. Not kept as files; the character description there is enough to regenerate if the dog direction is ever revisited.

**Not yet generated:** stickers for the new character (ran low on credits this session — 8 left as of this writing). Description in Section 5 has enough detail to pick this back up.

---

*Last updated: 2026-09-08. PFP + banner generated and committed for the retro-trader direction (second attempt, after the Doggos-mascot pack was rejected) — see `STATUS.md` for the session writeup.*
