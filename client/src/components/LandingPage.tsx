import { CARD_POOL, Faction } from "@cryptoclash/engine";
import { factionColor } from "../factionColor.js";
import { TickerTape } from "./TickerTape.js";

export interface LandingPageProps {
  onEnter: () => void;
}

// "Neutral" (Items) isn't one of the 6 playable factions the tagline promises — excluded here,
// same reasoning DeckBuilder/CollectionScreen keep it out of their faction-identity UI too.
const FACTIONS: Faction[] = Array.from(new Set(Object.values(CARD_POOL).filter((t) => !t.token).map((t) => t.faction)))
  .filter((f) => f !== "Neutral")
  .sort();

const TICKER_ITEMS = [
  { text: "DOGGOS SWARM ONLINE", direction: "up" as const },
  { text: "BLACK SWAN EVENT DETECTED", direction: "down" as const },
  { text: "GENESIS SUPPLY: PERMANENTLY CAPPED" },
  { text: "FOMO +12%", direction: "up" as const },
  { text: "DEGENS PAY HP FOR POWER", direction: "down" as const },
  { text: "BUILDERS DRAW AHEAD" },
  { text: "PUMP.SIGNAL CONFIRMED", direction: "up" as const },
  { text: "6 FACTIONS. ONE FLOOR." },
];

const PILLARS = [
  { title: "COLLECT", desc: "Open packs, chase rarity, land a foil. Every card is a real, ownable asset — not a skin." },
  { title: "BATTLE", desc: "Deterministic, server-authoritative combat. Deck-build across 6 crypto-native factions." },
  { title: "TRADE", desc: "Disenchant duplicates into Dust, craft the cards you actually want. A real economy, not a grind wall." },
];

const COMMUNITY_LINKS = [
  { label: "Discord" },
  { label: "X / Twitter" },
  { label: "Telegram" },
];

/** A rough skyline silhouette (varied-height rects) — pure inline SVG, no image asset. */
function SkylineSilhouette() {
  const buildings = [
    { x: 0, w: 40, h: 70 },
    { x: 42, w: 26, h: 110 },
    { x: 70, w: 34, h: 60 },
    { x: 106, w: 20, h: 140 },
    { x: 128, w: 44, h: 90 },
    { x: 174, w: 22, h: 130 },
    { x: 198, w: 30, h: 75 },
    { x: 230, w: 18, h: 160 },
    { x: 250, w: 36, h: 100 },
    { x: 288, w: 24, h: 65 },
    { x: 314, w: 40, h: 120 },
    { x: 356, w: 20, h: 85 },
    { x: 378, w: 30, h: 145 },
    { x: 410, w: 46, h: 95 },
    { x: 458, w: 22, h: 70 },
    { x: 482, w: 34, h: 125 },
    { x: 518, w: 26, h: 60 },
    { x: 546, w: 18, h: 155 },
    { x: 566, w: 40, h: 90 },
    { x: 608, w: 28, h: 110 },
  ];
  const full = [...buildings, ...buildings.map((b) => ({ ...b, x: b.x + 640 }))];
  return (
    <svg viewBox="0 0 1280 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="skyline-glow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#00e28a" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#00e28a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1280" height="200" fill="url(#skyline-glow)" />
      {full.map((b, i) => (
        <rect key={i} x={b.x} y={200 - b.h} width={b.w} height={b.h} fill="#0a1f18" stroke="#173a2c" strokeWidth="1" />
      ))}
      {full
        .filter((_, i) => i % 2 === 0)
        .map((b, i) => (
          <rect key={`w-${i}`} x={b.x + 6} y={200 - b.h + 12} width={5} height={7} fill="#f2b705" fillOpacity="0.55" />
        ))}
      {full
        .filter((_, i) => i % 3 === 1)
        .map((b, i) => (
          <rect key={`w2-${i}`} x={b.x + b.w - 12} y={200 - b.h + 26} width={5} height={7} fill="#00e28a" fillOpacity="0.5" />
        ))}
    </svg>
  );
}

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="landing">
      <div className="landing__backdrop" />
      <div className="landing__skyline">
        <SkylineSilhouette />
      </div>

      <div className="landing__content">
        <nav className="landing__nav">
          <span className="landing__logo">CRYPTO CLASH</span>
          <button type="button" className="landing__nav-enter" onClick={onEnter}>
            Enter the Arena
          </button>
        </nav>

        <section className="landing__hero">
          <span className="landing__eyebrow">Web3 Trading-Card Battler</span>
          <h1 className="landing__title">
            The floor is <span>the battlefield</span>.
          </h1>
          <p className="landing__tagline">
            Collect, deck-build, and clash across six crypto-native factions — Doggos, Frogs, Degens, Crypto Bros, Builders, and Normies.
            Free to play. No wallet required to jump in.
          </p>
          <div className="landing__cta-row">
            <button type="button" className="landing__cta" onClick={onEnter}>
              Enter the Arena →
            </button>
          </div>
          <div className="landing__factions">
            {FACTIONS.map((f) => (
              <span key={f} className="landing__faction-chip">
                <span className="landing__faction-dot" style={{ background: factionColor(f) }} />
                {f}
              </span>
            ))}
          </div>
        </section>

        <TickerTape items={TICKER_ITEMS} />

        <section className="landing__section">
          <h2 className="landing__section-title">Skill &gt; Collection &gt; Spending</h2>
          <div className="landing__pillars">
            {PILLARS.map((p) => (
              <div key={p.title} className="landing__pillar">
                <span className="landing__pillar-title">{p.title}</span>
                <p className="landing__pillar-desc">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing__section">
          <h2 className="landing__section-title">Join the floor</h2>
          <div className="landing__community">
            {COMMUNITY_LINKS.map((c) => (
              <span key={c.label} className="landing__community-link" title="Coming soon">
                {c.label}
                <span className="landing__community-badge">Soon</span>
              </span>
            ))}
          </div>
        </section>

        <footer className="landing__footer">CRYPTO CLASH — early access. Balance, odds, and rewards are still first-pass numbers.</footer>
      </div>
    </div>
  );
}
