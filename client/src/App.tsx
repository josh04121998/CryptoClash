import { SAMPLE_DECK } from "@cryptoclash/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api.js";
import { setTelemetryAuthToken, track } from "./telemetry.js";
import { AchievementsScreen } from "./components/AchievementsScreen.js";
import { CollectionScreen } from "./components/CollectionScreen.js";
import { CraftingScreen } from "./components/CraftingScreen.js";
import { DeckBuilder } from "./components/DeckBuilder.js";
import { DeckPicker } from "./components/DeckPicker.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { EventBanner } from "./components/EventBanner.js";
import { MyDecksScreen, SavedDeck } from "./components/MyDecksScreen.js";
import { LandingPage } from "./components/LandingPage.js";
import { LeaderboardScreen } from "./components/LeaderboardScreen.js";
import { MuteToggle } from "./components/MuteToggle.js";
import { PacksScreen } from "./components/PacksScreen.js";
import { QuestsScreen } from "./components/QuestsScreen.js";
import { ReferralScreen } from "./components/ReferralScreen.js";
import { StartingFactionScreen } from "./components/StartingFactionScreen.js";
import { WalletPicker } from "./components/WalletPicker.js";
import { LocalMatch } from "./LocalMatch.js";
import { OnlineMatch } from "./OnlineMatch.js";
import { TutorialMatch } from "./tutorial/TutorialMatch.js";
import { TutorialOfferModal } from "./tutorial/TutorialOfferModal.js";
import {
  markTutorialSkipped,
  shouldOfferTutorial,
} from "./tutorialStorage.js";
import { useWallet } from "./useWallet.js";

type Mode =
  | "landing"
  | "menu"
  | "pick-local"
  | "pick-online"
  | "local"
  | "online"
  | "tutorial"
  | "my-decks"
  | "deck-builder"
  | "packs"
  | "collection"
  | "crafting"
  | "quests"
  | "achievements"
  | "leaderboard"
  | "referral";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Module-level, deliberately NOT a ref or state: `app_open` means "once per
 * page load". React 18 StrictMode double-invokes mount effects in dev, and a
 * component-scoped guard would also re-arm if App ever remounted — the module
 * is evaluated exactly once per page load, so this flag is the right scope.
 */
let appOpenTracked = false;

export default function App() {
  const [mode, setMode] = useState<Mode>("landing");
  const [deckCards, setDeckCards] = useState<string[]>(SAMPLE_DECK);
  const [editingDeck, setEditingDeck] = useState<SavedDeck | undefined>(undefined);
  const [coinsBalance, setCoinsBalance] = useState<number | null>(null);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [showTutorialOffer, setShowTutorialOffer] = useState(false);
  const wallet = useWallet();

  useEffect(() => {
    if (appOpenTracked) return;
    appOpenTracked = true;
    track("app_open");
  }, []);

  // One event per *distinct* screen. The ref survives StrictMode's simulated
  // remount (refs aren't reset by the double-invoke), so the initial "landing"
  // isn't reported twice in dev.
  const lastScreenRef = useRef<Mode | null>(null);
  useEffect(() => {
    if (lastScreenRef.current === mode) return;
    lastScreenRef.current = mode;
    track("screen_view", { screen: mode });
  }, [mode]);

  // Lets the server resolve account_id for itself on the fetch transport. The
  // client never sends account_id, per the contract.
  useEffect(() => {
    setTelemetryAuthToken(wallet.token);
  }, [wallet.token]);

  function handleConnectClick() {
    // The contract calls this "wallet picker opened", but most users have zero
    // or one wallet installed and never see a picker — the funnel step that
    // actually matters is "asked to connect", which is this whole branch.
    track("wallet_connect_started");
    if (wallet.discoveredWallets.length > 1) setShowWalletPicker(true);
    else wallet.connect();
  }
  function handleSwitchClick() {
    if (wallet.discoveredWallets.length > 1) setShowWalletPicker(true);
    else wallet.switchWallet();
  }

  const refreshCoins = useCallback((token: string) => {
    apiFetch<{ balance: number }>("/api/coins", { token })
      .then((res) => setCoinsBalance(res.balance))
      .catch(() => setCoinsBalance(null));
  }, []);

  useEffect(() => {
    if (wallet.token) refreshCoins(wallet.token);
    else setCoinsBalance(null);
  }, [wallet.token, refreshCoins]);

  function enterMenuFromLanding() {
    track("landing_cta");
    setMode("menu");
    if (shouldOfferTutorial()) {
      setShowTutorialOffer(true);
      track("tutorial_offered");
    }
  }

  if (mode === "landing") return <LandingPage onEnter={enterMenuFromLanding} />;

  // The three match screens carry by far the most render complexity in the app
  // (77 cards, animations, live server state), so they are where a render error
  // is most likely and where blanking the whole app would hurt most. Boundaried
  // individually, each recovering to the menu: a crash costs one match, not the
  // session. `key={mode}` remounts the boundary on every screen change, so a
  // caught error can never persist into the next match.
  if (mode === "tutorial") {
    return (
      <ErrorBoundary key={mode} where="tutorial" onRecover={() => setMode("menu")}>
        <TutorialMatch onPracticeAi={() => setMode("pick-local")} onMainMenu={() => setMode("menu")} />
      </ErrorBoundary>
    );
  }

  if (mode === "local") {
    return (
      <ErrorBoundary key={mode} where="local-match" onRecover={() => setMode("menu")}>
        <LocalMatch deckCards={deckCards} onExit={() => setMode("menu")} />
      </ErrorBoundary>
    );
  }

  if (mode === "online") {
    return (
      <ErrorBoundary key={mode} where="online-match" onRecover={() => setMode("menu")}>
        <OnlineMatch deckCards={deckCards} token={wallet.token} onExit={() => setMode("menu")} />
      </ErrorBoundary>
    );
  }

  if (mode === "pick-local" || mode === "pick-online") {
    return (
      <DeckPicker
        title={mode === "pick-local" ? "vs AI — pick your deck" : "online — pick your deck"}
        token={wallet.token}
        onBack={() => setMode("menu")}
        onHome={() => setMode("landing")}
        onPick={(cards) => {
          setDeckCards(cards);
          setMode(mode === "pick-local" ? "local" : "online");
        }}
      />
    );
  }

  if (mode === "leaderboard") {
    return <LeaderboardScreen token={wallet.token} onBack={() => setMode("menu")} onHome={() => setMode("landing")} />;
  }

  // The one-time starting-faction choice (STATUS.md roadmap item 1) gates only the screens whose
  // whole purpose is real card ownership — Packs/Quests/etc. work fine with no faction chosen yet.
  // wallet.startingFaction === undefined means "not fetched yet," not "unchosen" — don't flash this
  // screen while that's still in flight.
  const needsStartingFaction =
    wallet.token !== null &&
    wallet.startingFaction === null &&
    (mode === "collection" || mode === "crafting" || mode === "deck-builder" || mode === "my-decks");
  if (needsStartingFaction) {
    return (
      <StartingFactionScreen
        onChoose={(faction) => wallet.chooseStartingFaction(faction)}
        onBack={() => setMode("menu")}
        onHome={() => setMode("landing")}
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
        onHome={() => setMode("landing")}
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
        onHome={() => setMode("landing")}
      />
    );
  }

  if (mode === "achievements" && wallet.token) {
    return (
      <AchievementsScreen
        token={wallet.token}
        balance={coinsBalance}
        onBalanceChange={setCoinsBalance}
        onBack={() => setMode("menu")}
        onHome={() => setMode("landing")}
      />
    );
  }

  if (mode === "referral" && wallet.token) {
    return <ReferralScreen token={wallet.token} onBack={() => setMode("menu")} onHome={() => setMode("landing")} />;
  }

  if (mode === "collection" && wallet.token) {
    return <CollectionScreen token={wallet.token} onBack={() => setMode("menu")} onHome={() => setMode("landing")} />;
  }

  if (mode === "crafting" && wallet.token) {
    return (
      <CraftingScreen
        token={wallet.token}
        startingFaction={wallet.startingFaction ?? null}
        onBack={() => setMode("menu")}
        onHome={() => setMode("landing")}
      />
    );
  }

  if (mode === "my-decks" && wallet.token) {
    return (
      <MyDecksScreen
        token={wallet.token}
        onBack={() => setMode("menu")}
        onHome={() => setMode("landing")}
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
        onHome={() => setMode("landing")}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-bar">
        <button type="button" className="app-bar__logo-btn" onClick={() => setMode("landing")} title="Back to landing">
          <h1>FLOORWARS</h1>
        </button>
        <div className="app-bar__actions">
          <MuteToggle />
          {wallet.status === "connected" && wallet.walletAddress ? (
            <>
              <span className="app-bar__coins" title="Coins" aria-label={`Coins: ${coinsBalance ?? "loading"}`}>
                🪙 {coinsBalance ?? "…"}
              </span>
              <button type="button" onClick={() => setMode("quests")}>
                Quests
              </button>
              <button type="button" onClick={() => setMode("achievements")}>
                Achievements
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
              <button type="button" title={`Switch wallet (currently ${wallet.walletAddress})`} onClick={handleSwitchClick}>
                {shortAddress(wallet.walletAddress)}
              </button>
              <button type="button" title="Disconnect" onClick={wallet.disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              {/* Collection/Packs/Crafting used to just vanish with no wallet connected, while the
                  landing page sells "collecting" hard — a real IA gap flagged during the tutorial_v1
                  handoff's own client walkthrough. Greyed, clickable entries that nudge toward
                  connecting (rather than a dead disabled button) read as "here, but gated" instead
                  of invisible, matching this project's "least friction to just play, wallet only
                  when something needs to persist" principle — the nudge itself is the low-friction
                  path in. */}
              <button type="button" className="app-bar__locked" title="Connect a wallet to open Packs" onClick={handleConnectClick}>
                Packs
              </button>
              <button type="button" className="app-bar__locked" title="Connect a wallet to view your Collection" onClick={handleConnectClick}>
                Collection
              </button>
              <button type="button" className="app-bar__locked" title="Connect a wallet to craft cards" onClick={handleConnectClick}>
                Crafting
              </button>
              <button type="button" onClick={handleConnectClick} disabled={wallet.status === "connecting"}>
                {wallet.status === "connecting" ? "Connecting…" : "Connect Wallet"}
              </button>
            </>
          )}
        </div>
      </header>
      {wallet.status === "error" && wallet.error && (
        <p className="wallet-error" role="status" aria-live="polite">
          {wallet.error}
        </p>
      )}
      {showWalletPicker && (
        <WalletPicker
          wallets={wallet.discoveredWallets}
          onClose={() => setShowWalletPicker(false)}
          onSelect={(uuid) => {
            setShowWalletPicker(false);
            wallet.connectWithWallet(uuid);
          }}
        />
      )}
      {showTutorialOffer && (
        <TutorialOfferModal
          onAccept={() => {
            setShowTutorialOffer(false);
            setMode("tutorial");
          }}
          onSkip={() => {
            markTutorialSkipped();
            track("tutorial_skipped");
            setShowTutorialOffer(false);
          }}
        />
      )}
      <main className="menu">
        <EventBanner />
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
        <button type="button" className="menu__option" onClick={() => setMode("tutorial")}>
          <span className="menu__option-title">Tutorial</span>
          <span className="menu__option-desc">Learn the floor in one guided match. No wallet.</span>
        </button>
      </main>
    </div>
  );
}
