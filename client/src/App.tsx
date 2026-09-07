import { SAMPLE_DECK } from "@cryptoclash/engine";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api.js";
import { CollectionScreen } from "./components/CollectionScreen.js";
import { CraftingScreen } from "./components/CraftingScreen.js";
import { DeckBuilder } from "./components/DeckBuilder.js";
import { DeckPicker } from "./components/DeckPicker.js";
import { MyDecksScreen, SavedDeck } from "./components/MyDecksScreen.js";
import { PacksScreen } from "./components/PacksScreen.js";
import { LocalMatch } from "./LocalMatch.js";
import { OnlineMatch } from "./OnlineMatch.js";
import { useWallet } from "./useWallet.js";

type Mode =
  | "menu"
  | "pick-local"
  | "pick-online"
  | "local"
  | "online"
  | "my-decks"
  | "deck-builder"
  | "packs"
  | "collection"
  | "crafting";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("menu");
  const [deckCards, setDeckCards] = useState<string[]>(SAMPLE_DECK);
  const [editingDeck, setEditingDeck] = useState<SavedDeck | undefined>(undefined);
  const [coinsBalance, setCoinsBalance] = useState<number | null>(null);
  const wallet = useWallet();

  const refreshCoins = useCallback((token: string) => {
    apiFetch<{ balance: number }>("/api/coins", { token })
      .then((res) => setCoinsBalance(res.balance))
      .catch(() => setCoinsBalance(null));
  }, []);

  useEffect(() => {
    if (wallet.token) refreshCoins(wallet.token);
    else setCoinsBalance(null);
  }, [wallet.token, refreshCoins]);

  if (mode === "local") return <LocalMatch deckCards={deckCards} onExit={() => setMode("menu")} />;
  if (mode === "online") return <OnlineMatch deckCards={deckCards} token={wallet.token} onExit={() => setMode("menu")} />;

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

  if (mode === "packs" && wallet.token) {
    return (
      <PacksScreen
        token={wallet.token}
        balance={coinsBalance}
        onBalanceChange={setCoinsBalance}
        onBack={() => setMode("menu")}
      />
    );
  }

  if (mode === "collection" && wallet.token) {
    return <CollectionScreen token={wallet.token} onBack={() => setMode("menu")} />;
  }

  if (mode === "crafting" && wallet.token) {
    return <CraftingScreen token={wallet.token} onBack={() => setMode("menu")} />;
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
              <span className="app-bar__coins" title="Coins">
                🪙 {coinsBalance ?? "…"}
              </span>
              <button type="button" onClick={() => setMode("packs")}>
                Packs
              </button>
              <button type="button" onClick={() => setMode("collection")}>
                Collection
              </button>
              <button type="button" onClick={() => setMode("crafting")}>
                Crafting
              </button>
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
