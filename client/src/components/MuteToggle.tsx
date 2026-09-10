import { useState } from "react";
import { isMuted, setMuted } from "../sound.js";

/** A small speaker icon toggle, reused in every app-bar that plays sound — mute state is global (localStorage), this just reflects/flips it. */
export function MuteToggle() {
  const [muted, setMutedState] = useState(isMuted());

  return (
    <button
      type="button"
      title={muted ? "Unmute sound" : "Mute sound"}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      onClick={() => {
        const next = !muted;
        setMuted(next);
        setMutedState(next);
      }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
