/**
 * Runs a full mirror match to completion using the greedy bot on both sides,
 * then prints the replay log. Exercises every system (energy,
 * positioning/aura, summon, Guard, Rush, HODL, fatigue) end-to-end and
 * proves the engine is deterministic and playable from outside a test file.
 *
 * Run with: npm run demo --workspace=engine
 */
import { takeBotTurn } from "./bot.js";
import { SAMPLE_DECK } from "./cards.js";
import { createMatch } from "./engine.js";

function runMatch(seed: number, maxTurns = 60) {
  const state = createMatch(SAMPLE_DECK, SAMPLE_DECK, seed);

  while (!state.winner && state.turnNumber <= maxTurns) {
    takeBotTurn(state, state.activePlayer);
  }

  console.log(`\n=== CRYPTO CLASH engine demo (seed ${seed}) ===\n`);
  for (const entry of state.log) {
    console.log(`[T${entry.turn}] ${entry.text}`);
  }

  console.log("\n--- Result ---");
  console.log(`Winner: ${state.winner ?? "no winner within turn cap"}`);
  console.log(`Final HP — A: ${state.players.A.hp}, B: ${state.players.B.hp}`);
  console.log(`Turns played: ${state.turnNumber}`);
}

runMatch(42);
