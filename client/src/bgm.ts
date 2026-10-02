import { getAudioContext, isMuted, onMuteChange } from "./sound.js";

/**
 * A tiny generative background loop — same zero-asset philosophy as sound.ts's one-shot effects
 * (session 35 confirmed directly with the user: no audio files, ever), just continuous instead of
 * one-shot. A sparse, slow two-voice pattern (a grounding low pulse + occasional higher chimes)
 * rather than a real melody — ambient "trading floor hum" under the match, not something that
 * competes with the sound effects layered on top of it during play.
 *
 * Classic Web-Audio lookahead scheduler: a cheap setInterval tick repeatedly schedules any notes
 * due to start within the next LOOKAHEAD_SEC, rather than scheduling the whole loop up front (so
 * mute/stop take effect quickly) or scheduling exactly one note per setInterval firing (timer
 * jitter would then audibly drift the tempo).
 */

const ROOT_HZ = 110; // A2 — low enough to sit under the SFX layer, not compete with it
const STEP_SEC = 0.42;
const LOOKAHEAD_SEC = 0.15;
const TICK_MS = 100;
const BGM_GAIN = 0.05;

// Semitone offsets from ROOT_HZ; null = rest. 16 steps ≈ 6.7s per loop — long enough not to feel
// like an obvious repeating jingle, short enough to stay one small fixed-size pattern.
const BASS_PATTERN: (number | null)[] = [0, null, null, null, 7, null, null, null, 3, null, null, null, 5, null, null, null];
const CHIME_PATTERN: (number | null)[] = [null, null, null, 12, null, null, 19, null, null, null, null, 15, null, null, 12, null];

function freqFor(semitones: number): number {
  return ROOT_HZ * 2 ** (semitones / 12);
}

interface Engine {
  timer: ReturnType<typeof setInterval>;
  masterGain: GainNode;
  unsubscribeMute: () => void;
  nextStepTime: number;
  step: number;
}

let engine: Engine | null = null;

function scheduleVoice(audio: AudioContext, destination: GainNode, freq: number, startAt: number, duration: number, gain: number, type: OscillatorType) {
  const osc = audio.createOscillator();
  const gainNode = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(gain, startAt + Math.min(0.08, duration / 3));
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gainNode);
  gainNode.connect(destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

function tick(audio: AudioContext) {
  if (!engine) return;
  while (engine.nextStepTime < audio.currentTime + LOOKAHEAD_SEC) {
    const i = engine.step % BASS_PATTERN.length;
    const bass = BASS_PATTERN[i];
    const chime = CHIME_PATTERN[i];
    if (bass !== null) scheduleVoice(audio, engine.masterGain, freqFor(bass), engine.nextStepTime, STEP_SEC * 0.85, 1, "triangle");
    if (chime !== null) scheduleVoice(audio, engine.masterGain, freqFor(chime), engine.nextStepTime, STEP_SEC * 1.4, 0.55, "sine");
    engine.nextStepTime += STEP_SEC;
    engine.step += 1;
  }
}

/** Starts the match-ambient loop. Idempotent — a second call while already running is a no-op,
 * so callers don't need to track whether it's already playing. Silently does nothing if Web
 * Audio isn't available (same posture as every one-shot sound in sound.ts). */
export function startBgm(): void {
  if (engine) return;
  const audio = getAudioContext();
  if (!audio) return;

  const masterGain = audio.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audio.destination);
  // Fade in rather than snap to volume — a sudden loop start under a UI click would read as a
  // glitch, not music.
  masterGain.gain.linearRampToValueAtTime(isMuted() ? 0 : BGM_GAIN, audio.currentTime + 1.2);

  const unsubscribeMute = onMuteChange((muted) => {
    if (!engine) return;
    const now = getAudioContext()?.currentTime ?? 0;
    engine.masterGain.gain.cancelScheduledValues(now);
    engine.masterGain.gain.linearRampToValueAtTime(muted ? 0 : BGM_GAIN, now + 0.25);
  });

  engine = { timer: setInterval(() => tick(audio), TICK_MS), masterGain, unsubscribeMute, nextStepTime: audio.currentTime + 0.05, step: 0 };
}

/** Stops the match-ambient loop and fades it out. Idempotent — safe to call with nothing running
 * (e.g. Web Audio never started). Any notes already scheduled within the lookahead window still
 * ring out naturally, but the immediate gain fade-to-0 means they're inaudible well before that. */
export function stopBgm(): void {
  if (!engine) return;
  const { timer, masterGain, unsubscribeMute } = engine;
  engine = null;
  clearInterval(timer);
  unsubscribeMute();
  const audio = getAudioContext();
  const now = audio?.currentTime ?? 0;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
  setTimeout(() => masterGain.disconnect(), 400);
}
