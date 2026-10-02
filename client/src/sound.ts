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

/** bgm.ts reuses the same singleton AudioContext as every one-shot effect above, rather than
 * opening a second one — browsers cap how many contexts can exist/run concurrently. */
export function getAudioContext(): AudioContext | null {
  return getContext();
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

type MuteListener = (muted: boolean) => void;
const muteListeners = new Set<MuteListener>();

/** bgm.ts subscribes so a mute toggle flipped mid-loop takes effect immediately — a one-shot
 * blip can just check isMuted() at play-time, but a *continuous* sound has nothing to re-check
 * until its next scheduled note without this, which could be a second or more away. Returns an
 * unsubscribe function. */
export function onMuteChange(fn: MuteListener): () => void {
  muteListeners.add(fn);
  return () => muteListeners.delete(fn);
}

export function setMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // Private browsing / storage disabled — mute just won't survive a reload.
  }
  muteListeners.forEach((fn) => fn(muted));
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

/**
 * A short filtered white-noise burst, layered under the tonal notes on impact sounds
 * (attack/death) so they read as a "thud" rather than a pure oscillator beep — oscillators
 * alone can only ever sound like a clean electronic tone, never an impact, no matter how the
 * envelope is shaped. `filterFreq` is a lowpass cutoff: lower = duller/heavier, higher = a
 * sharper crack. A no-op (silently) when muted or Web Audio isn't available, same as playNotes.
 */
function playNoiseBurst(startOffset: number, duration: number, peak: number, filterFreq: number): void {
  if (isMuted()) return;
  const audio = getContext();
  if (!audio) return;

  const bufferSize = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = audio.createBufferSource();
  source.buffer = buffer;

  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;

  const gainNode = audio.createGain();
  const start = audio.currentTime + startOffset;
  gainNode.gain.setValueAtTime(peak, start);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audio.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
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

/**
 * `damage` (raw amount dealt, if known — callers without a number just get the old baseline
 * punch) scales the impact: a 1-damage poke and a 7-damage haymaker used to sound identical,
 * since this only ever fired off the log text's *presence* ("X attacks Y"), never its amount.
 * Normalized against 8 since that's roughly the top of the launch card pool's per-hit damage
 * range (batlleSpec.md's finishers aside) — intensity only needs to feel "bigger," not track the
 * exact number 1:1.
 */
export function playAttackSound(damage = 2): void {
  const intensity = Math.min(1, Math.max(0, damage) / 8);
  playNoiseBurst(0, 0.07 + intensity * 0.06, 0.16 + intensity * 0.14, 1300 - intensity * 800);
  playNotes([
    { freq: 180 - intensity * 40, at: 0, duration: 0.08, type: "square", gain: 0.16 },
    { freq: 90 - intensity * 20, at: 0.04, duration: 0.1 + intensity * 0.06, type: "square", gain: 0.14 + intensity * 0.06 },
  ]);
}

export function playDeathSound(): void {
  playNoiseBurst(0, 0.16, 0.2, 450);
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
