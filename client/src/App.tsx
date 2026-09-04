import { DEFAULT_DECK_ID } from "@cryptoclash/engine";
import { useState } from "react";
import { DeckPicker } from "./components/DeckPicker.js";
import { LocalMatch } from "./LocalMatch.js";
import { OnlineMatch } from "./OnlineMatch.js";

type Mode = "menu" | "pick-local" | "pick-online" | "local" | "online";

export default function App() {
  const [mode, setMode] = useState<Mode>("menu");
  const [deckId, setDeckId] = useState(DEFAULT_DECK_ID);

  if (mode === "local") return <LocalMatch deckId={deckId} onExit={() => setMode("menu")} />;
  if (mode === "online") return <OnlineMatch deckId={deckId} onExit={() => setMode("menu")} />;

  if (mode === "pick-local" || mode === "pick-online") {
    return (
      <DeckPicker
        title={mode === "pick-local" ? "vs AI — pick your deck" : "online — pick your deck"}
        onBack={() => setMode("menu")}
        onPick={(id) => {
          setDeckId(id);
          setMode(mode === "pick-local" ? "local" : "online");
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">prototype</span>
      </header>
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
