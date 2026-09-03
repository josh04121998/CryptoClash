import { CARD_POOL } from "./cards.js";
import { resolveAttack } from "./combat.js";
import { checkWin, createBoardCreature, resolveEffects } from "./effects.js";
import { mulberry32, shuffle } from "./rng.js";
import { BOARD_SIZE, Intent, MatchState, PlayerId, PlayerState } from "./types.js";
import { enemyOf } from "./util.js";

const STARTING_HP = 30;
const OPENING_HAND_SIZE = 4;
const MAX_HAND_SIZE = 10;
const MAX_ENERGY = 10;

function pushLog(state: MatchState, text: string) {
  state.log.push({ turn: state.turnNumber, text });
}

function createPlayer(id: PlayerId, deckList: string[], rng: () => number): PlayerState {
  const shuffled = shuffle(deckList, rng);
  return {
    id,
    hp: STARTING_HP,
    maxEnergy: 0,
    energy: 0,
    deck: shuffled.slice(OPENING_HAND_SIZE),
    hand: shuffled.slice(0, OPENING_HAND_SIZE),
    board: Array(BOARD_SIZE).fill(null),
    fatigue: 0,
  };
}

function drawCard(state: MatchState, playerId: PlayerId) {
  const player = state.players[playerId];
  if (player.deck.length === 0) {
    player.fatigue += 1;
    player.hp -= player.fatigue;
    pushLog(state, `${playerId} draws from an empty deck and takes ${player.fatigue} fatigue damage (HP: ${player.hp}).`);
    checkWin(state);
    return;
  }
  const cardId = player.deck.shift()!;
  if (player.hand.length >= MAX_HAND_SIZE) {
    pushLog(state, `${playerId}'s hand is full — ${CARD_POOL[cardId].name} is discarded.`);
    return;
  }
  player.hand.push(cardId);
}

function startTurn(state: MatchState) {
  const player = state.players[state.activePlayer];
  player.maxEnergy = Math.min(MAX_ENERGY, player.maxEnergy + 1);
  player.energy = player.maxEnergy;

  for (const creature of player.board) {
    if (!creature) continue;
    creature.hasAttackedThisTurn = false;
    creature.tempKeywords.clear();
  }

  pushLog(state, `Turn ${state.turnNumber}: ${state.activePlayer}'s turn begins (Energy ${player.energy}/${player.maxEnergy}).`);

  drawCard(state, state.activePlayer);

  player.board.forEach((creature, slot) => {
    if (!creature) return;
    const template = CARD_POOL[creature.templateId];
    if (template.effects) {
      resolveEffects(state, template.effects, "onTurnStart", { controller: state.activePlayer, sourceSlot: slot });
    }
  });
}

function playCard(state: MatchState, intent: Extract<Intent, { kind: "playCard" }>) {
  const player = state.players[intent.playerId];
  const templateId = player.hand[intent.handIndex];
  if (!templateId) throw new Error("Invalid hand index.");
  const template = CARD_POOL[templateId];
  if (player.energy < template.cost) throw new Error("Not enough energy.");

  if (template.type === "Creature") {
    if (intent.slot === undefined) throw new Error("A board slot is required to play a creature.");
    if (intent.slot < 0 || intent.slot >= BOARD_SIZE) throw new Error("Slot out of range.");
    if (player.board[intent.slot] !== null) throw new Error("That slot is occupied.");
  }

  const requiresTarget = template.effects?.some((e) => e.trigger === "onPlay" && e.requiresTarget);
  if (requiresTarget && !intent.target) throw new Error("This card requires a target.");

  player.energy -= template.cost;
  player.hand.splice(intent.handIndex, 1);
  pushLog(state, `${intent.playerId} plays ${template.name}.`);

  let sourceSlot: number | undefined;
  if (template.type === "Creature") {
    player.board[intent.slot!] = createBoardCreature(state, templateId);
    sourceSlot = intent.slot;
  }

  if (template.effects) {
    resolveEffects(state, template.effects, "onPlay", {
      controller: intent.playerId,
      sourceSlot,
      chosenTarget: intent.target,
    });
  }
}

function endTurn(state: MatchState, intent: Extract<Intent, { kind: "endTurn" }>) {
  pushLog(state, `${intent.playerId} ends their turn.`);
  const next = enemyOf(intent.playerId);
  state.activePlayer = next;
  if (next === "A") state.turnNumber += 1;
  startTurn(state);
}

export function createMatch(deckA: string[], deckB: string[], seed: number): MatchState {
  const rng = mulberry32(seed);
  const state: MatchState = {
    players: {
      A: createPlayer("A", deckA, rng),
      B: createPlayer("B", deckB, rng),
    },
    activePlayer: "A",
    turnNumber: 1,
    nextInstanceId: 1,
    log: [],
    winner: null,
    rng,
  };
  startTurn(state);
  return state;
}

export function applyIntent(state: MatchState, intent: Intent): MatchState {
  if (state.winner) throw new Error("The match is already over.");
  if (state.activePlayer !== intent.playerId) throw new Error("It is not that player's turn.");

  switch (intent.kind) {
    case "playCard":
      playCard(state, intent);
      break;
    case "attack":
      resolveAttack(state, intent);
      break;
    case "endTurn":
      endTurn(state, intent);
      break;
  }
  return state;
}
