import { useState } from "react";
import { LocalMatch } from "./LocalMatch.js";
import { OnlineMatch } from "./OnlineMatch.js";

type Mode = "menu" | "local" | "online";

export default function App() {
  const [mode, setMode] = useState<Mode>("menu");

  if (mode === "local") return <LocalMatch onExit={() => setMode("menu")} />;
  if (mode === "online") return <OnlineMatch onExit={() => setMode("menu")} />;

  return (
    <div className="app">
      <header className="app-bar">
        <h1>CRYPTO CLASH</h1>
        <span className="app-bar__subtitle">prototype</span>
      </header>
      <main className="menu">
        <button type="button" className="menu__option" onClick={() => setMode("local")}>
          <span className="menu__option-title">Play vs AI</span>
          <span className="menu__option-desc">Practice offline against a bot opponent. No connection required.</span>
        </button>
        <button type="button" className="menu__option" onClick={() => setMode("online")}>
          <span className="menu__option-title">Play Online</span>
          <span className="menu__option-desc">Get matched with another player in real time.</span>
        </button>
      </main>
    </div>
  );
}
