# @cryptoclash/server

Real-time match server — the networking layer from `../architecture.md` Section 5. Wraps `@cryptoclash/engine` (the authoritative battle logic) with WebSocket matchmaking and per-match state broadcast. See `../shared` (`@cryptoclash/protocol`) for the wire format.

## What it does

FIFO matchmaking (first player queued gets matched with the next to join) · one `MatchState` per room, owned server-side · rejects any intent submitted for a player other than the socket that sent it · broadcasts the resulting state to both sockets after every legal action · notifies the remaining player on opponent disconnect.

Not yet implemented: skill-based matchmaking, reconnection to an in-progress match, more than one match server instance (state is in-process memory, so this doesn't horizontally scale yet — fine for the current player counts, worth revisiting before real load).

## Running it

```
npm install                        # from the repo root
npm run test --workspace=server    # matchmaking / in-match / disconnect integration tests
npm run dev --workspace=server     # local dev, watches for changes
npm run start --workspace=server   # production start command (see Deploying below)
```

## Why `tsx` in production, not `tsc` + `node dist/`

`@cryptoclash/engine` and `@cryptoclash/protocol`'s `package.json` `main` fields point straight at their TypeScript source (`src/index.ts`), not a compiled output — there's no publish step in this monorepo. That's fine under a TS-aware runtime (tsx, Vite, Vitest), but a plain `node dist/index.js` would crash trying to load a `.ts` file through node_modules resolution. `npm run start` therefore runs the server directly under `tsx`, which is what `npm run dev` already uses and what's been verified end-to-end. If this ever needs a real compiled-artifact deploy, `engine`/`protocol` would need actual build steps and `main`/`exports` pointed at their `dist/` output first.

## Deploying (Railway)

This is an npm-workspaces monorepo, so the workspace root — not `server/` — has to be the install context, or `@cryptoclash/engine`/`@cryptoclash/protocol` won't resolve.

1. New Railway service → Deploy from GitHub repo → this repo.
2. **Root Directory**: leave as the repository root (do *not* set it to `server/`).
3. **Build Command**: `npm install`
4. **Start Command**: `npm run start --workspace=server`
5. Railway injects `PORT`; `createMatchServer` already reads `process.env.PORT`, so no extra env var is needed there.
6. Settings → Networking → Generate Domain, to get a public `wss://` URL.
7. Point the client at it: set `VITE_SERVER_URL=wss://<that-domain>` in the Vercel project's environment variables, then redeploy the client.
