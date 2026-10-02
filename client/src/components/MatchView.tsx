import { BoardCreature, CARD_POOL, Intent, MatchState, PlayerId, getEffectiveAttack, targetsFriendlyCreature } from "@cryptoclash/engine";
import { useEffect, useRef, useState } from "react";
import { startBgm, stopBgm } from "../bgm.js";
import { playClickSound, playErrorSound, playEndTurnSound, playSelectSound } from "../sound.js";
import type { SpotlightTarget } from "../tutorial/beats.js";
import { useAttackAnimations } from "../useAttackAnimations.js";
import { useCardPlayAnimations } from "../useCardPlayAnimations.js";
import { useMatchSounds } from "../useMatchSounds.js";
import { BoardRow } from "./BoardRow.js";
import { CardInspectOverlay } from "./CardInspectOverlay.js";
import { HandRow } from "./HandRow.js";
import { LogPanel } from "./LogPanel.js";
import { MatchResultOverlay } from "./MatchResultOverlay.js";
import { OpponentHandRow } from "./OpponentHandRow.js";
import { PlayerHeader } from "./PlayerHeader.js";
import { VolatilityMeter } from "./VolatilityMeter.js";

type Selection = { type: "none" } | { type: "hand"; handIndex: number } | { type: "attacker"; slot: number };

function needsTarget(templateId: string): boolean {
  const template = CARD_POOL[templateId];
  return Boolean(template.effects?.some((e) => e.trigger === "onPlay" && e.requiresTarget));
}

function targetsFriendly(templateId: string): boolean {
  return targetsFriendlyCreature(CARD_POOL[templateId]);
}

/** Same eligibility combat.ts's resolveAttack itself enforces (attacked already / just summoned
 * without Rush) — mirrored here so the lethal telegraph below counts only damage the player could
 * actually land this turn, not a hopeful over-count. */
function canCreatureAttack(creature: BoardCreature, turnNumber: number): boolean {
  if (creature.hasAttackedThisTurn) return false;
  const hasRush = creature.keywords.has("Rush") || creature.tempKeywords.has("Rush");
  if (creature.summonedOnTurn === turnNumber && !hasRush) return false;
  return true;
}

/** A drop-zone element under the pointer, resolved via elementFromPoint at drag-end — see onCardDragEnd. */
function resolveDropZone(clientX: number, clientY: number): { zone: string; slot?: number; empty?: boolean } | null {
  const el = document.elementFromPoint(clientX, clientY);
  const zoneEl = el?.closest<HTMLElement>("[data-drop-zone]");
  if (!zoneEl) return null;
  const { dropZone, slot, empty } = zoneEl.dataset;
  return { zone: dropZone!, slot: slot !== undefined ? Number(slot) : undefined, empty: empty === "true" };
}

export interface MatchViewProps {
  state: MatchState;
  myPlayerId: PlayerId;
  dispatch: (intent: Intent) => void;
  lastError: string | null;
  myLabel: string;
  opponentLabel: string;
  opponentTurnLabel: string;
  logOpen: boolean;
  onCloseLog: () => void;
  /** tutorial_v1 */
  spotlight?: SpotlightTarget;
  tutorialMode?: boolean;
  onTutorialPracticeAi?: () => void;
  onTutorialMainMenu?: () => void;
  /** Starts a fresh AI match straight from the result overlay — see MatchResultOverlay's own doc comment. */
  onPlayAgain?: () => void;
}

export function MatchView({
  state,
  myPlayerId,
  dispatch,
  lastError,
  myLabel,
  opponentLabel,
  opponentTurnLabel,
  logOpen,
  onCloseLog,
  spotlight = { kind: "none" },
  tutorialMode = false,
  onTutorialPracticeAi,
  onTutorialMainMenu,
  onPlayAgain,
}: MatchViewProps) {
  const opponentId: PlayerId = myPlayerId === "A" ? "B" : "A";
  const [selection, setSelection] = useState<Selection>({ type: "none" });
  const [inspectedCard, setInspectedCard] = useState<{ side: "own" | "enemy"; slot: number } | null>(null);

  const { marketEventFlash, marketEventText } = useMatchSounds(state, myPlayerId);
  const attackingSlots = useAttackAnimations(state);
  const justPlayedSlots = useCardPlayAnimations(state);

  // Ambient loop for the whole time a match screen is mounted — every match screen (Play vs AI,
  // Play Online, the tutorial) renders this component, so this one effect covers all of them
  // without each needing its own start/stop call. Mute-respecting via bgm.ts's own subscription
  // to sound.ts's mute state, not anything this component tracks itself.
  useEffect(() => {
    startBgm();
    return () => stopBgm();
  }, []);
  const [resultDismissed, setResultDismissed] = useState(false);
  const prevErrorRef = useRef(lastError);
  useEffect(() => {
    if (lastError && lastError !== prevErrorRef.current) playErrorSound();
    prevErrorRef.current = lastError;
  }, [lastError]);

  const [flashing, setFlashing] = useState(false);
  // A real playtest flag: the 0.5s screen flash told you *something* happened, never *what* —
  // finding out meant opening the Log after the fact. This toast surfaces the actual triggered
  // event's own log text (already a clean one-liner, e.g. "📉 MARKET CRASH — the strongest
  // creature on each side takes 2 damage.") for long enough to actually read it.
  const [toastText, setToastText] = useState<string | null>(null);
  const prevFlashCountRef = useRef(marketEventFlash);
  useEffect(() => {
    if (marketEventFlash !== prevFlashCountRef.current) {
      prevFlashCountRef.current = marketEventFlash;
      setFlashing(true);
      setToastText(marketEventText);
      const flashTimer = setTimeout(() => setFlashing(false), 500);
      const toastTimer = setTimeout(() => setToastText(null), 3200);
      return () => {
        clearTimeout(flashTimer);
        clearTimeout(toastTimer);
      };
    }
  }, [marketEventFlash, marketEventText]);

  const me = state.players[myPlayerId];
  const canAct = state.activePlayer === myPlayerId && !state.winner;
  // Client-side rejections (a drag/tap that never reached dispatch at all, e.g. a creature
  // dropped on an occupied slot) used to just silently reset the selection — real feedback only
  // ever existed for *engine*-rejected actions (lastError, above). A real re-playtest (session 39)
  // flagged exactly this gap and deferred it; this is that fix. See the hint call sites below.
  const [actionHint, setActionHint] = useState<string | null>(null);
  useEffect(() => {
    if (!actionHint) return;
    const timer = setTimeout(() => setActionHint(null), 3000);
    return () => clearTimeout(timer);
  }, [actionHint]);

  const act = (fn: () => void) => {
    fn();
    setSelection({ type: "none" });
    setActionHint(null);
  };

  // A tap always just previews/selects — never commits a play on its own, regardless of card
  // type. (Previously a non-targeted spell/item dispatched straight from this first click, with
  // no way to just look at what the card does — a real reported bug.) Creature/targeted-spell
  // cards commit via a second click on a valid slot/portrait (onOwnSlotClick/onEnemySlotClick/
  // onEnemyPortraitClick below); a no-target card commits via confirmNoTargetPlay's prompt.
  function onCardTap(index: number) {
    if (!canAct) return;
    setActionHint(null);
    if (selection.type === "hand" && selection.handIndex === index) {
      playClickSound();
      setSelection({ type: "none" });
      return;
    }
    playSelectSound();
    setSelection({ type: "hand", handIndex: index });
  }

  function confirmNoTargetPlay() {
    if (!canAct || selection.type !== "hand") return;
    act(() => dispatch({ kind: "playCard", playerId: myPlayerId, handIndex: selection.handIndex }));
  }

  function onCardDragStart(index: number) {
    if (!canAct) return;
    setActionHint(null);
    playSelectSound();
    setSelection({ type: "hand", handIndex: index });
  }

  // Drag committed (moved past the threshold and released) — resolve whatever's under the
  // pointer via data-drop-zone attributes and dispatch the same way a click-driven confirm
  // would. A drop that lands nowhere valid just cancels the selection, card snaps back to hand.
  function onCardDragEnd(index: number, clientX: number, clientY: number) {
    if (!canAct) {
      setSelection({ type: "none" });
      return;
    }
    const templateId = me.hand[index];
    const template = CARD_POOL[templateId];
    const drop = resolveDropZone(clientX, clientY);

    if (template.type === "Creature") {
      if (drop?.zone === "own-slot" && drop.empty && drop.slot !== undefined) {
        act(() => dispatch({ kind: "playCard", playerId: myPlayerId, handIndex: index, slot: drop.slot }));
        return;
      }
      setActionHint(
        drop?.zone === "own-slot" ? "That slot is already occupied — drop on an empty one." : "Creatures go on an empty slot of your own board.",
      );
      setSelection({ type: "none" });
      return;
    }

    if (needsTarget(templateId)) {
      if (targetsFriendly(templateId)) {
        if (drop?.zone === "own-slot" && drop.empty === false && drop.slot !== undefined) {
          act(() =>
            dispatch({
              kind: "playCard",
              playerId: myPlayerId,
              handIndex: index,
              target: { type: "creature", playerId: myPlayerId, slot: drop.slot! },
            }),
          );
          return;
        }
      } else {
        if (drop?.zone === "enemy-slot" && drop.empty === false && drop.slot !== undefined) {
          act(() =>
            dispatch({
              kind: "playCard",
              playerId: myPlayerId,
              handIndex: index,
              target: { type: "creature", playerId: opponentId, slot: drop.slot! },
            }),
          );
          return;
        }
        if (drop?.zone === "enemy-portrait") {
          act(() =>
            dispatch({
              kind: "playCard",
              playerId: myPlayerId,
              handIndex: index,
              target: { type: "player", playerId: opponentId },
            }),
          );
          return;
        }
      }
      setActionHint(
        targetsFriendly(templateId) ? "Drop it on one of your own creatures to target them." : "Drop it on an enemy creature or their portrait to target them.",
      );
      setSelection({ type: "none" });
      return;
    }

    // No target required — any recognized drop zone on the battlefield commits it (see the
    // data-drop-zone="battlefield" wrapper below, which fills the gaps between slots/portraits).
    if (drop) {
      act(() => dispatch({ kind: "playCard", playerId: myPlayerId, handIndex: index }));
      return;
    }
    setActionHint("Drop it anywhere on the battlefield to play it.");
    setSelection({ type: "none" });
  }

  function onOwnSlotClick(slot: number) {
    const creature = me.board[slot];

    if (canAct) {
      if (selection.type === "hand") {
        const templateId = me.hand[selection.handIndex];
        const template = CARD_POOL[templateId];
        if (template.type === "Creature") {
          if (!creature) {
            act(() => dispatch({ kind: "playCard", playerId: myPlayerId, handIndex: selection.handIndex, slot }));
          } else {
            setActionHint("That slot is already occupied — pick an empty one.");
          }
          return;
        }
        if (needsTarget(templateId) && targetsFriendly(templateId)) {
          if (creature) {
            act(() =>
              dispatch({
                kind: "playCard",
                playerId: myPlayerId,
                handIndex: selection.handIndex,
                target: { type: "creature", playerId: myPlayerId, slot },
              }),
            );
          } else {
            setActionHint("Select a friendly creature to target, not an empty slot.");
          }
          return;
        }
        setActionHint(`${template.name} can't be played on your own board.`);
        return;
      }

      if (creature && !creature.hasAttackedThisTurn) {
        playSelectSound();
        setSelection(selection.type === "attacker" && selection.slot === slot ? { type: "none" } : { type: "attacker", slot });
        return;
      }

      if (selection.type === "attacker") {
        setActionHint(creature ? "That creature already attacked this turn." : "Select one of your own creatures to attack with.");
      }
      setSelection({ type: "none" });
    }

    // Falls through whenever the click wasn't a real game action (not my turn, an
    // already-attacked creature, an empty slot with nothing selected) — a tap on a
    // minion in that state used to just be a no-op/deselect, now it opens the full
    // card detail instead. Never fires ahead of a real action above.
    if (creature) setInspectedCard({ side: "own", slot });
  }

  function onEnemySlotClick(slot: number) {
    const enemyCreature = state.players[opponentId].board[slot];

    if (canAct) {
      if (selection.type === "hand") {
        const templateId = me.hand[selection.handIndex];
        const template = CARD_POOL[templateId];
        if (needsTarget(templateId) && !targetsFriendly(templateId)) {
          if (enemyCreature) {
            act(() =>
              dispatch({
                kind: "playCard",
                playerId: myPlayerId,
                handIndex: selection.handIndex,
                target: { type: "creature", playerId: opponentId, slot },
              }),
            );
          } else {
            setActionHint("Select an enemy creature to target — that slot is empty.");
          }
        } else {
          setActionHint(`${template.name} can't target the enemy board.`);
        }
        return;
      }

      if (selection.type === "attacker") {
        if (enemyCreature) {
          act(() =>
            dispatch({
              kind: "attack",
              playerId: myPlayerId,
              attackerSlot: selection.slot,
              target: { type: "creature", playerId: opponentId, slot },
            }),
          );
        } else {
          setActionHint("No creature there — attack an enemy creature or their portrait.");
        }
        return;
      }
    }

    // Same fallback as onOwnSlotClick — most of the time this is exactly when you'd
    // want it: no attacker selected yet, so tapping an enemy minion could never have
    // done anything else. Never fires ahead of a real attack/target action above.
    if (enemyCreature) setInspectedCard({ side: "enemy", slot });
  }

  function onEnemyPortraitClick() {
    if (!canAct) return;

    if (selection.type === "hand") {
      const templateId = me.hand[selection.handIndex];
      if (needsTarget(templateId) && !targetsFriendly(templateId)) {
        act(() =>
          dispatch({
            kind: "playCard",
            playerId: myPlayerId,
            handIndex: selection.handIndex,
            target: { type: "player", playerId: opponentId },
          }),
        );
      }
      return;
    }

    if (selection.type === "attacker") {
      act(() =>
        dispatch({ kind: "attack", playerId: myPlayerId, attackerSlot: selection.slot, target: { type: "player", playerId: opponentId } }),
      );
    }
  }

  const enemyTargetable =
    canAct &&
    (selection.type === "attacker" ||
      (selection.type === "hand" && needsTarget(me.hand[selection.handIndex]) && !targetsFriendly(me.hand[selection.handIndex])));

  // combat.ts's resolveAttack forces every attack (creature or face) to target an enemy Guard
  // while one's up — never applied to targeted spells/items, only real attacks. A real playtest
  // (2026-09-30) found every enemy creature still highlighted as attackable regardless, so the
  // only feedback a Guard was actually up came from a real, but reactive, error message *after*
  // clicking a non-Guard target — hit in half the matches played. Restricting the visual target
  // affordance to match the real rule closes that gap instead of just explaining it after the fact.
  const enemyGuardSlot = state.players[opponentId].board.findIndex(
    (c) => c && (c.keywords.has("Guard") || c.tempKeywords.has("Guard")),
  );
  const attackBlockedByGuard = selection.type === "attacker" && enemyGuardSlot !== -1;
  const enemyPortraitTargetable = enemyTargetable && !attackBlockedByGuard;

  // Lethal telegraph: total effective attack still available from creatures that haven't attacked
  // this turn, summed the same way a player would have to actually land it — straight at the
  // enemy face. Only meaningful with no enemy Guard up, since combat.ts's own rule forces every
  // attack onto the Guard first while one's alive; there's no partial-overflow mechanic that lets
  // some damage spill past it onto the face in the same turn.
  const lethalAvailable =
    canAct &&
    enemyGuardSlot === -1 &&
    me.board.reduce(
      (sum, creature, slot) => (creature && canCreatureAttack(creature, state.turnNumber) ? sum + getEffectiveAttack(state, myPlayerId, slot) : sum),
      0,
    ) >= state.players[opponentId].hp;

  // Guard-down telegraph: a Guard dying mid-combat (to an attack, an effect, anything) silently
  // reopened the face/other creatures as legal targets with nothing announcing it — a player who
  // just traded into the Guard had to notice its slot went empty themselves. True→false on
  // "is any enemy Guard up" is the one-shot trigger, same before/after-ref shape as the market
  // event toast above.
  const [guardDownToast, setGuardDownToast] = useState(false);
  const prevEnemyGuardUpRef = useRef(enemyGuardSlot !== -1);
  useEffect(() => {
    const wasUp = prevEnemyGuardUpRef.current;
    const isUp = enemyGuardSlot !== -1;
    prevEnemyGuardUpRef.current = isUp;
    if (wasUp && !isUp) {
      setGuardDownToast(true);
      const timer = setTimeout(() => setGuardDownToast(false), 2400);
      return () => clearTimeout(timer);
    }
  }, [enemyGuardSlot]);

  const ownBoardTargetable =
    canAct && selection.type === "hand" && needsTarget(me.hand[selection.handIndex]) && targetsFriendly(me.hand[selection.handIndex]);

  // A selected creature card doesn't "need a target" in needsTarget()'s sense — it needs an empty
  // slot — so it fell through every existing targetable check above and got zero visual signal
  // for where tapping would actually place it. A real playtest (2026-09-30) found this made the
  // whole tap-to-select-then-tap-to-place flow read as "tapping does nothing": the first tap
  // *does* select the card (a real border glow + lift, `.card-face--selected`), but with no
  // affordance at all on the board telling you where the second tap goes, that selection looked
  // like a dead end rather than a working first half of a two-step gesture.
  const ownEmptySlotTargetable =
    canAct && selection.type === "hand" && CARD_POOL[me.hand[selection.handIndex]].type === "Creature";

  // A selected card that needs no target (a spell/item with no requiresTarget effect) has no
  // slot/portrait to click to confirm — this is the tap-path equivalent of "drop it anywhere
  // on the battlefield" for drag (see onCardDragEnd's no-target branch).
  const pendingNoTargetCard =
    canAct && selection.type === "hand" && !needsTarget(me.hand[selection.handIndex]) && CARD_POOL[me.hand[selection.handIndex]].type !== "Creature"
      ? CARD_POOL[me.hand[selection.handIndex]]
      : undefined;

  // A proactive "what does my second tap/drop do" hint — the selection glow and board
  // highlights (ownBoardTargetable/ownEmptySlotTargetable/enemyTargetable above) already show
  // *where*, but said nothing in words about *what to do there*, especially on a first playthrough.
  const selectionHint: string | null = (() => {
    if (!canAct) return null;
    if (selection.type === "attacker") return "Tap an enemy creature or their portrait to attack.";
    if (selection.type !== "hand") return null;
    const templateId = me.hand[selection.handIndex];
    const template = CARD_POOL[templateId];
    if (template.type === "Creature") return "Tap or drop on an empty slot of your own to play it.";
    if (needsTarget(templateId)) {
      return targetsFriendly(templateId) ? "Tap one of your own creatures to target." : "Tap an enemy creature or their portrait to target.";
    }
    return null; // no-target, non-creature card — the ▶ Play prompt below covers this case
  })();

  const winnerText = state.winner ? (state.winner === "Draw" ? "Draw!" : state.winner === myPlayerId ? "You win!" : "You lose.") : null;

  const mySpotlightSlot = spotlight.kind === "emptySlot" || spotlight.kind === "ownCreature" ? spotlight.slot : undefined;
  const enemySpotlightGuard = spotlight.kind === "enemyGuard";
  const spotlightEnergy = spotlight.kind === "energy";
  const spotlightPortrait = spotlight.kind === "enemyPortrait";
  const spotlightEndTurn = spotlight.kind === "endTurn";
  const handSpotlight =
    spotlight.kind === "handCard"
      ? spotlight.templateId
      : spotlight.kind === "energy" || spotlight.kind === "emptySlot"
        ? me.hand.find((templateId) => {
            const template = CARD_POOL[templateId];
            return template?.type === "Creature" && template.cost === 1;
          })
        : undefined;

  const showTutorialResult = Boolean(tutorialMode && state.winner);

  return (
    <>
      <main className={flashing ? "table table--market-event-flash" : "table"}>
        {toastText && (
          <div className="market-event-toast" role="status" aria-live="polite">
            {toastText}
          </div>
        )}
        {guardDownToast && (
          <div className="market-event-toast guard-down-toast" role="status" aria-live="polite">
            🛡️ Guard is down — the way is clear.
          </div>
        )}
        {/* data-drop-zone="battlefield" is the drag-and-drop fallback for the gaps between
            slots/portraits (the volatility meter, the turn divider, spacing between cards) —
            BoardRow/PlayerHeader tag their own more specific zones, which `.closest` picks up
            first when the drop actually lands on one. Deliberately excludes the hand row, my own
            portrait, and End Turn below, so dropping a card back on itself/those never counts. */}
        <div data-drop-zone="battlefield">
          <OpponentHandRow count={state.players[opponentId].hand.length} />
          <PlayerHeader
            name={opponentLabel}
            player={state.players[opponentId]}
            isActive={state.activePlayer === opponentId}
            targetable={enemyPortraitTargetable}
            onClick={enemyPortraitTargetable ? onEnemyPortraitClick : undefined}
            spotlightPortrait={spotlightPortrait}
            lethal={lethalAvailable}
            isDropZone
          />
          <BoardRow
            state={state}
            playerId={opponentId}
            side="enemy"
            targetable={enemyTargetable}
            restrictTargetToSlot={attackBlockedByGuard ? enemyGuardSlot : undefined}
            attackingSlots={attackingSlots}
            justPlayedSlots={justPlayedSlots}
            attackDirection="down"
            onSlotClick={onEnemySlotClick}
            spotlightGuard={enemySpotlightGuard}
          />

          <VolatilityMeter volatility={state.volatility} />

          <div className="table__divider">
            {winnerText ? (
              <span className="table__winner">{winnerText}</span>
            ) : pendingNoTargetCard ? (
              <button type="button" className="table__play-prompt" onClick={confirmNoTargetPlay}>
                ▶ Play {pendingNoTargetCard.name}
              </button>
            ) : selectionHint ? (
              <span className="table__hint">{selectionHint}</span>
            ) : (
              <span>
                Turn {state.turnNumber} —{" "}
                {state.activePlayer === myPlayerId ? <strong className="table__your-turn">Your move</strong> : opponentTurnLabel}
              </span>
            )}
            {(lastError || actionHint) && (
              <span className="table__error" role="status" aria-live="polite">
                {lastError ?? actionHint}
              </span>
            )}
          </div>

          <BoardRow
            state={state}
            playerId={myPlayerId}
            side="own"
            selectedSlot={selection.type === "attacker" ? selection.slot : undefined}
            targetable={ownBoardTargetable}
            targetableEmpty={ownEmptySlotTargetable}
            attackingSlots={attackingSlots}
            justPlayedSlots={justPlayedSlots}
            attackDirection="up"
            onSlotClick={onOwnSlotClick}
            spotlightSlot={mySpotlightSlot}
          />
        </div>
        <PlayerHeader
          name={myLabel}
          player={me}
          isActive={state.activePlayer === myPlayerId}
          spotlightEnergy={spotlightEnergy}
        />

        <HandRow
          player={me}
          selectedIndex={selection.type === "hand" ? selection.handIndex : undefined}
          interactive={canAct}
          onCardTap={onCardTap}
          onCardDragStart={onCardDragStart}
          onCardDragEnd={onCardDragEnd}
          spotlightTemplateId={handSpotlight}
        />

        <button
          type="button"
          className={["end-turn-btn", spotlightEndTurn ? "end-turn-btn--spotlight" : ""].filter(Boolean).join(" ")}
          disabled={!canAct}
          onClick={() => {
            playEndTurnSound();
            act(() => dispatch({ kind: "endTurn", playerId: myPlayerId }));
          }}
        >
          End Turn
        </button>
      </main>

      <LogPanel log={state.log} open={logOpen} onClose={onCloseLog} />

      {state.winner && !resultDismissed && (
        <MatchResultOverlay
          winner={state.winner}
          myPlayerId={myPlayerId}
          onDismiss={() => setResultDismissed(true)}
          tutorialExit={showTutorialResult}
          onPracticeAi={onTutorialPracticeAi}
          onMainMenu={onTutorialMainMenu}
          onPlayAgain={showTutorialResult ? undefined : onPlayAgain}
        />
      )}

      {inspectedCard && state.players[inspectedCard.side === "own" ? myPlayerId : opponentId].board[inspectedCard.slot] && (
        <CardInspectOverlay
          state={state}
          playerId={inspectedCard.side === "own" ? myPlayerId : opponentId}
          slot={inspectedCard.slot}
          onClose={() => setInspectedCard(null)}
        />
      )}
    </>
  );
}
