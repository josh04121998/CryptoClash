import { Faction } from "@cryptoclash/engine";

/**
 * A 3-letter "stock ticker" abbreviation per faction — the card frame's faction cue
 * (`CardFace.tsx`'s `card-face__ticker` badge). Deliberately typographic rather than
 * an icon/mascot (no art-asset pipeline exists yet — branding.md Section 7) and
 * on-theme: the whole brand identity is built around ticker-tape/exchange-floor
 * motifs (see `TickerTape.tsx`, `branding.md` Section 4), so a card reading like a
 * ticker symbol fits the "the floor is the battlefield" concept directly.
 */
export function factionTicker(faction: Faction): string {
  switch (faction) {
    case "Doggos":
      return "DOG";
    case "Frogs":
      return "FRG";
    case "Degens":
      return "DGN";
    case "CryptoBros":
      return "CBR";
    case "Builders":
      return "BLD";
    case "Normies":
      return "NRM";
    case "Neutral":
      return "NTR";
    default:
      return "???";
  }
}
