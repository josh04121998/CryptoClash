/**
 * A tiny Web Audio synth engine — every sound effect in the game is generated
 * from oscillators at play-time, not loaded from audio files. Deliberate:
 * zero asset-licensing/sourcing work, zero bundle-size cost, and generated
 * square/triangle-wave blips are exactly the "retro arcade terminal" sound a
 * CRT-glow trading-floor aesthetic (styles.css, LandingPage.tsx) wants anyway.
 *
 * Mute state persists to localStorage — sound defaults on, but must be
 * user-controllable (browsers also block audio autoplay before a user
 * gesture; every call here is already downstream of one, e.g. a card click).
 */

const MUTE_KEY = "cryptoclash.muted";

let ctx: AudioContext | null = null;
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!ctx) ctx = new AudioCtor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // Private browsing / storage disabled — mute just won't survive a reload.
  }
}

interface Note {
  /** Hz */
  freq: number;
  /** Seconds from the start of this sound. */
  at: number;
  /** Seconds. */
  duration: number;
  type?: OscillatorType;
  /** Peak gain, 0-1. Kept low by default — these layer, so no single blip should dominate. */
  gain?: number;
}

/** Schedules a short sequence of oscillator notes with a simple attack/decay envelope each. A no-op (silently) when muted or Web Audio isn't available. */
function playNotes(notes: Note[]): void {
  if (isMuted()) return;
  const audio = getContext();
  if (!audio) return;
  const base = audio.currentTime;
  for (const note of notes) {
    const osc = audio.createOscillator();
    const gainNode = audio.createGain();
    osc.type = note.type ?? "square";
    osc.frequency.value = note.freq;
    const start = base + note.at;
    const peak = note.gain ?? 0.12;
    gainNode.gain.setValueAtTime(0, start);
    gainNode.gain.linearRampToValueAtTime(peak, start + Math.min(0.015, note.duration / 4));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    osc.connect(gainNode);
    gainNode.connect(audio.destination);
    osc.start(start);
    osc.stop(start + note.duration + 0.02);
  }
}

// --- Named sound effects ---------------------------------------------------

export function playCardSound(): void {
  playNotes([{ freq: 520, at: 0, duration: 0.09, type: "triangle" }, { freq: 780, at: 0.05, duration: 0.09, type: "triangle" }]);
}

export function playAttackSound(): void {
  playNotes([{ freq: 180, at: 0, duration: 0.08, type: "square", gain: 0.16 }, { freq: 90, at: 0.04, duration: 0.1, type: "square", gain: 0.14 }]);
}

export function playHitSound(): void {
  playNotes([{ freq: 110, at: 0, duration: 0.12, type: "sawtooth", gain: 0.14 }]);
}

export function playDeathSound(): void {
  playNotes([
    { freq: 300, at: 0, duration: 0.12, type: "square", gain: 0.12 },
    { freq: 200, at: 0.1, duration: 0.14, type: "square", gain: 0.12 },
    { freq: 120, at: 0.22, duration: 0.2, type: "square", gain: 0.12 },
  ]);
}

export function playHealSound(): void {
  playNotes([{ freq: 660, at: 0, duration: 0.1, type: "sine", gain: 0.1 }, { freq: 880, at: 0.08, duration: 0.14, type: "sine", gain: 0.1 }]);
}

export function playEndTurnSound(): void {
  playNotes([{ freq: 440, at: 0, duration: 0.06, type: "sine", gain: 0.08 }, { freq: 660, at: 0.06, duration: 0.08, type: "sine", gain: 0.08 }]);
}

export function playYourTurnSound(): void {
  playNotes([
    { freq: 523, at: 0, duration: 0.09, type: "triangle", gain: 0.1 },
    { freq: 659, at: 0.09, duration: 0.09, type: "triangle", gain: 0.1 },
    { freq: 784, at: 0.18, duration: 0.16, type: "triangle", gain: 0.1 },
  ]);
}

export function playSelectSound(): void {
  playNotes([{ freq: 900, at: 0, duration: 0.04, type: "square", gain: 0.05 }]);
}

export function playErrorSound(): void {
  playNotes([{ freq: 140, at: 0, duration: 0.1, type: "sawtooth", gain: 0.1 }, { freq: 110, at: 0.09, duration: 0.14, type: "sawtooth", gain: 0.1 }]);
}

export function playMarketEventSound(): void {
  playNotes([
    { freq: 700, at: 0, duration: 0.1, type: "sawtooth", gain: 0.13 },
    { freq: 500, at: 0.1, duration: 0.1, type: "sawtooth", gain: 0.13 },
    { freq: 700, at: 0.2, duration: 0.1, type: "sawtooth", gain: 0.13 },
    { freq: 500, at: 0.3, duration: 0.16, type: "sawtooth", gain: 0.13 },
  ]);
}

export function playWinSound(): void {
  playNotes([
    { freq: 523, at: 0, duration: 0.12, type: "triangle", gain: 0.12 },
    { freq: 659, at: 0.11, duration: 0.12, type: "triangle", gain: 0.12 },
    { freq: 784, at: 0.22, duration: 0.12, type: "triangle", gain: 0.12 },
    { freq: 1047, at: 0.33, duration: 0.3, type: "triangle", gain: 0.14 },
  ]);
}

export function playLoseSound(): void {
  playNotes([
    { freq: 392, at: 0, duration: 0.16, type: "sawtooth", gain: 0.12 },
    { freq: 330, at: 0.15, duration: 0.16, type: "sawtooth", gain: 0.12 },
    { freq: 262, at: 0.3, duration: 0.35, type: "sawtooth", gain: 0.12 },
  ]);
}

export function playDrawSound(): void {
  playNotes([{ freq: 440, at: 0, duration: 0.14, type: "triangle", gain: 0.1 }, { freq: 440, at: 0.16, duration: 0.14, type: "triangle", gain: 0.1 }]);
}

/** Pack/collection reveal — a soft tick for a common pull, a brighter shimmer for anything rarer or foil. */
export function playRevealSound(exciting: boolean): void {
  if (exciting) {
    playNotes([
      { freq: 784, at: 0, duration: 0.08, type: "triangle", gain: 0.12 },
      { freq: 988, at: 0.07, duration: 0.08, type: "triangle", gain: 0.12 },
      { freq: 1319, at: 0.14, duration: 0.2, type: "triangle", gain: 0.14 },
    ]);
  } else {
    playNotes([{ freq: 600, at: 0, duration: 0.05, type: "sine", gain: 0.06 }]);
  }
}

/** Coins/Dust/reward granted — quests, dailies, referrals, crafting. */
export function playRewardSound(): void {
  playNotes([
    { freq: 660, at: 0, duration: 0.07, type: "square", gain: 0.1 },
    { freq: 880, at: 0.06, duration: 0.07, type: "square", gain: 0.1 },
    { freq: 1175, at: 0.12, duration: 0.16, type: "square", gain: 0.12 },
  ]);
}

export function playClickSound(): void {
  playNotes([{ freq: 700, at: 0, duration: 0.03, type: "square", gain: 0.04 }]);
}
