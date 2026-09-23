import { createMatchServer } from "./createMatchServer.js";

const PORT = Number(process.env.PORT) || 8787;

/**
 * Crash guards.
 *
 * This single process holds *all* live state: the matchmaking queue, every
 * in-progress MatchRoom and its authoritative MatchState, and the reconnect
 * indexes. None of it is persisted. Node's default on an unhandled promise
 * rejection is to terminate, so before these handlers existed, one stray
 * rejection anywhere in the codebase destroyed every match in flight — and
 * since reconnect tokens point at rooms that only exist in memory, the players
 * who reconnected afterwards found nothing to reconnect to.
 *
 * That default is the right one for a stateless worker. It is the wrong one
 * here, and especially wrong at launch, where the cost of dropping everyone
 * mid-match is far higher than the cost of running on in a slightly unknown
 * state. Every repo call in this server is already best-effort
 * (`.catch(() => {})` throughout matchRoom.ts) precisely so that a background
 * failure cannot affect a match; a rejection that escapes anyway is the same
 * class of problem and gets the same treatment: log it loudly, keep serving.
 *
 * `uncaughtException` is treated differently and deliberately: an exception
 * that escaped every frame means the process state may genuinely be corrupt,
 * so it is logged and the process exits to let Railway restart it clean. The
 * matches are lost either way in that case — continuing just risks serving
 * wrong game state to the players still connected, which is worse than a
 * restart.
 *
 * Both are logged to stderr, which is where Railway's log view reads from, and
 * are the only signal that any of this happened — there is no error-tracking
 * service wired up on this side.
 */
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] keeping the process alive; live matches would otherwise all be lost:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException] exiting for a clean restart; process state can no longer be trusted:", error);
  process.exit(1);
});

createMatchServer(PORT)
  .then(({ port }) => {
    console.log(`FLOORWARS match server listening on :${port}`);
  })
  .catch((error) => {
    // Boot failure (port already bound, for example). Previously this rejected
    // unhandled, which printed a bare trace and exited with a success-looking
    // code on some Node versions; be explicit instead so Railway sees a failure.
    console.error("[boot] match server failed to start:", error);
    process.exit(1);
  });
