import { SAMPLE_DECK } from "@cryptoclash/engine";
import { useState } from "react";
import { DeckBuilder } from "./components/DeckBuilder.js";
import { DeckPicker } from "./components/DeckPicker.js";
import { MyDecksScreen, SavedDeck } from "./components/MyDecksScreen.js";
import { LocalMatch } from "./LocalMatch.js";
import { OnlineMatch } from "./OnlineMatch.js";
import { useWallet } from "./useWallet.js";

type Mode = "menu" | "pick-local" | "pick-online" | "local" | "online" | "my-decks" | "deck-builder";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("menu");
  const [deckCards, setDeckCards] = useState<string[]>(SAMPLE_DECK);
  const [editingDeck, setEditingDeck] = useState<SavedDeck | undefined>(undefined);
  const wallet = useWallet();

  if (mode === "local") return <LocalMatch deckCards={deckCards} onExit={() => setMode("menu")} />;
  if (mode === "online") return <OnlineMatch deckCards={deckCards} onExit={() => setMode("menu")} />;

  if (mode === "pick-local" || mode === "pick-online") {
    return (
      <DeckPicker
        title={mode === "pick-local" ? "vs AI — pick your deck" : "online — pick your deck"}
        token={wallet.token}
        onBack={() => setMode("menu")}
        onPick={(cards) => {
          setDeckCards(cards);
          setMode(mode === "pick-local" ? "local" : "online");
        }}
      />
    );
  }

  if (mode === "my-decks" && wallet.token) {
    return (
      <MyDecksScreen
        token={wallet.token}
        onBack={() => setMode("menu")}
        onCreateNew={() => {
          setEditingDeck(undefined);
          setMode("deck-builder");
        }}
        onEdit={(deck) => {
          setEditingDeck(deck);
          setMode("deck-builder");
        }}
      />
    );
  }

  if (mode === "deck-builder" && wallet.token) {
    return (
      <DeckBuilder
        token={wallet.token}
        existing={editingDeck}
        onCancel={() => setMode("my-decks")}
        onSaved={() => setMode("my-decks")}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">prototype</span>
        <div className="app-bar__actions">
          {wallet.status === "connected" && wallet.walletAddress ? (
            <>
              <button type="button" onClick={() => setMode("my-decks")}>
                My Decks
              </button>
              <button type="button" title={wallet.walletAddress} onClick={wallet.disconnect}>
                {shortAddress(wallet.walletAddress)}
              </button>
            </>
          ) : (
            <button type="button" onClick={wallet.connect} disabled={wallet.status === "connecting"}>
              {wallet.status === "connecting" ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>
      {wallet.status === "error" && wallet.error && <p className="wallet-error">{wallet.error}</p>}
      <main className="menu">
        <button type="button" className="menu__option" onClick={() => setMode("pick-local")}>
          <span className="menu__option-title">Play vs AI</span>
          <span className="menu__option-desc">Practice offline against a bot opponent. No connection required.</span>
        </button>
        <button type="button" className="menu__option" onClick={() => setMode("pick-online")}>
          <span className="menu__option-title">Play Online</span>
          <span className="menu__option-desc">Get matched with another player in real time.</span>
        </button>
      </main>
    </div>
  );
}
