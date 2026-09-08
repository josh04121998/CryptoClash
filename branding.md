# CRYPTO CLASH — Brand Guide

A reference for anyone (human or AI) generating visual assets for the game — social media, the website, or eventually card art. Read this before generating anything; it's the single source of truth for "what does Crypto Clash look like," so a new asset stays recognizably on-brand instead of drifting session to session. Update this file when the direction changes, the same way `STATUS.md` tracks build state.

---

## 1. Concept

**"The floor is the battlefield."** Crypto Clash's combat identity is a Wall Street trading floor / bullpen at night, doubling as a battle arena — not generic fantasy war-visuals. This is deliberate: the game's cast (Doggos, Frogs, Degens, Crypto Bros, Builders, Normies) is already trading-culture themed, so the visual language should feel like it belongs to the same world as the gameplay, not bolted on.

The palette and typography choices (Section 2/3) land somewhere between a Bloomberg terminal and a retro arcade cabinet — sharp neon-on-black, squared-off "technical" lettering, scanline texture. Think: an exchange-floor monitor wall that's also a fight screen. That retro-terminal/arcade quality is a real, load-bearing part of the identity, not just a side effect of the font choice — lean into it in generated art (CRT glow, scanlines, chunky pixel-adjacent shapes) rather than smoothing it into generic clean-flat-illustration style.

**Explicit non-goals:** literal Hearthstone-style painted fantasy art, photorealism, generic "crypto bro" clip-art (rocket emojis, laser eyes, cartoon coins) — the brand should read as *designed*, not as a template. See `STATUS.md` Section 0 for the same "complete and well-balanced, not AAA" bar applied to the game itself.

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

**Decided (2026-09-08):** a Doggos-flagship mascot — a golden dog character in trading-floor attire (white dress shirt, loosened terminal-green tie, white sneakers), rendered in the brand's bold-outline neon-on-black vector style. Reasoning:
- `STATUS.md`'s token direction already anchors the community/meme layer to the Doggos faction specifically ("dogs being the proven meme-coin lineage") — this mascot rides that same, already-decided lineage rather than introducing a new one.
- One consistent flagship character is stronger for PFP/community-building than rotating between 6 faction mascots — Crypto Twitter PFP culture rewards a single recognizable character.
- It still leaves room for the other 5 factions to get their own character art later (card art, Section 7) without needing a mascot each right now.

This is now *the* face of Crypto Clash on social — see Section 8 for the actual generated assets. Model consistency notes for future generations: **floppy drooping ears** (one early sticker generated pointy ears and had to be redone — say "floppy, drooping ears, not pointy" explicitly in prompts), white dress shirt + loosened terminal-green (`#00e28a`) tie, golden/orange fur (not the site's `--accent` gold `#f2b705` — the fur reads better a shade warmer/oranger, closer to `#f5a623`, the Doggos faction color), white sneakers.

---

## 6. Voice & Tone

Confident, a little dry, in on the joke without being cringe — crypto-native shorthand (ticker lines, "the floor," "the bullpen") over generic hype-speak ("🚀 to the moon 🚀"). The game's own tagline pattern ("Skill > Deck Building > Collection Advantage > Spending" from `spec.md`) is the model: terse, declarative, slightly technical.

---

## 7. Asset Roadmap

Rough order, per the user's direction (2026-09-08):

1. ~~This doc~~ — done.
2. ~~Social assets~~ — done, see Section 8: mascot PFP, 2 banners, 4 stickers.
3. **Website assets** — a real hero illustration for the landing page (currently CSS/SVG-only), possibly faction icons. Not started.
4. **Card art** — illustrated art for the 60 card templates. Last, and the biggest lift — not started.

---

## 8. Generated Assets

Everything here lives in `branding/assets/` as both `.svg` (the real vector source — Recraft's actual output, despite the download URLs being `.jpg`-named; use these for anything that needs to scale, like a large banner print) and `.png` (a rendered preview at the source resolution, ~1024px, for quick viewing/upload where an SVG isn't accepted). Generated with `recraft-v4-pro-vector`'s cheaper sibling `recraft-v4-vector` (18 credits/image via the Pixa MCP tools) — model choice matters for regenerating in the same style later.

| File | Use | Notes |
|---|---|---|
| `pfp.svg` / `.png` | Profile picture | Self-contained circular badge composition — crop-ready as-is. |
| `banner-hero.svg` / `.png` | **Primary** X/social banner (1536×768, ~2:1) | Dramatic hero shot, rain-slicked street, phone to ear. Empty space on the left third for a logo/text overlay. |
| `banner-stride.svg` / `.png` | Alternate banner (1536×768, ~2:1) | Mid-stride, sunglasses, watch — more playful/swagger energy. Kept as a second option, not the primary. |
| `sticker-thumbsup.svg` / `.png` | Sticker | Enthusiastic thumbs-up. |
| `sticker-wave.svg` / `.png` | Sticker | Friendly wave, tongue out — good for a "GM" greeting. |
| `sticker-shocked.svg` / `.png` | Sticker | Panicked, gripping his tie — good for a "market crash" reaction. |
| `sticker-sunglasses.svg` / `.png` | Sticker | Confident, arms crossed. Regenerated once already to fix ear consistency (see Section 5) — this is the corrected version. |

All 7 assets are die-cut/badge-composed already (white sticker border or circular crop baked in by the model) — no further background removal needed for the stickers or PFP. The banners are full-bleed rectangular compositions, not die-cut.

---

*Last updated: 2026-09-08. Social pack generated and committed — see `STATUS.md` for the session writeup.*
