import { SAMPLE_DECK } from "@cryptoclash/engine";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api.js";
import { CollectionScreen } from "./components/CollectionScreen.js";
import { CraftingScreen } from "./components/CraftingScreen.js";
import { DeckBuilder } from "./components/DeckBuilder.js";
import { DeckPicker } from "./components/DeckPicker.js";
import { MyDecksScreen, SavedDeck } from "./components/MyDecksScreen.js";
import { LandingPage } from "./components/LandingPage.js";
import { LeaderboardScreen } from "./components/LeaderboardScreen.js";
import { PacksScreen } from "./components/PacksScreen.js";
import { QuestsScreen } from "./components/QuestsScreen.js";
import { ReferralScreen } from "./components/ReferralScreen.js";
import { LocalMatch } from "./LocalMatch.js";
import { OnlineMatch } from "./OnlineMatch.js";
import { useWallet } from "./useWallet.js";

type Mode =
  | "landing"
  | "menu"
  | "pick-local"
  | "pick-online"
  | "local"
  | "online"
  | "my-decks"
  | "deck-builder"
  | "packs"
  | "collection"
  | "crafting"
  | "quests"
  | "leaderboard"
  | "referral";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("landing");
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

  if (mode === "landing") return <LandingPage onEnter={() => setMode("menu")} />;

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

  if (mode === "leaderboard") {
    return <LeaderboardScreen token={wallet.token} onBack={() => setMode("menu")} />;
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

  if (mode === "quests" && wallet.token) {
    return (
      <QuestsScreen
        token={wallet.token}
        balance={coinsBalance}
        onBalanceChange={setCoinsBalance}
        onBack={() => setMode("menu")}
      />
    );
  }

  if (mode === "referral" && wallet.token) {
    return <ReferralScreen token={wallet.token} onBack={() => setMode("menu")} />;
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
        <button type="button" className="app-bar__logo-btn" onClick={() => setMode("landing")} title="Back to landing">
          <h1>CRYPTO CLASH</h1>
        </button>
        <div className="app-bar__actions">
          {wallet.status === "connected" && wallet.walletAddress ? (
            <>
              <span className="app-bar__coins" title="Coins">
                🪙 {coinsBalance ?? "…"}
              </span>
              <button type="button" onClick={() => setMode("quests")}>
                Quests
              </button>
              <button type="button" onClick={() => setMode("packs")}>
                Packs
              </button>
              <button type="button" onClick={() => setMode("collection")}>
                Collection
              </button>
              <button type="button" onClick={() => setMode("crafting")}>
                Crafting
              </button>
              <button type="button" onClick={() => setMode("referral")}>
                Invite Friends
              </button>
              <button type="button" onClick={() => setMode("my-decks")}>
                My Decks
              </button>
              <button type="button" title={`Switch wallet (currently ${wallet.walletAddress})`} onClick={wallet.switchWallet}>
                {shortAddress(wallet.walletAddress)}
              </button>
              <button type="button" title="Disconnect" onClick={wallet.disconnect}>
                Disconnect
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
        <button type="button" className="menu__option" onClick={() => setMode("leaderboard")}>
          <span className="menu__option-title">Leaderboard</span>
          <span className="menu__option-desc">Most wins, best win rate, most Coins earned. No wallet required to look.</span>
        </button>
      </main>
    </div>
  );
}
