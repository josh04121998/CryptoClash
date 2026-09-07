# @cryptoclash/server

Real-time match server — the networking layer from `../architecture.md` Section 5. Wraps `@cryptoclash/engine` (the authoritative battle logic) with WebSocket matchmaking and per-match state broadcast. See `../shared` (`@cryptoclash/protocol`) for the wire format.

## What it does

FIFO matchmaking (first player queued gets matched with the next to join) · one `MatchState` per room, owned server-side · rejects any intent submitted for a player other than the socket that sent it · broadcasts the resulting state to both sockets after every legal action · notifies the remaining player on opponent disconnect.

Also serves a small REST API (`/api/*`, same HTTP server, no separate deploy) for the collectible-foundation stage (`architecture.md` Section 6, step 1-2): wallet-based accounts (Sign-In with Ethereum) and saved custom decks. See "Accounts & decks API" below.

Not yet implemented: skill-based matchmaking, reconnection to an in-progress match, more than one match server instance (state is in-process memory, so this doesn't horizontally scale yet — fine for the current player counts, worth revisiting before real load).

## Running it

```
npm install                        # from the repo root
npm run migrate --workspace=server # apply DB migrations (needs DATABASE_URL — see below)
npm run test --workspace=server    # matchmaking / in-match / disconnect integration tests
npm run dev --workspace=server     # local dev, watches for changes
npm run start --workspace=server   # production start command (see Deploying below)
```

## Accounts & decks API

Wallet-as-identity (`architecture.md` Section 9, deliberately overridden for this project — see Section 13's reconciliation note): connecting a wallet *is* signing in, via [Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361). There's no separate email/password account system. Play vs AI and Play Online never require this — it's opt-in, only needed to persist a custom deck.

- `GET /api/auth/nonce` → `{ nonce }` — call before every sign-in attempt; nonces are one-time-use and expire after 5 minutes.
- `POST /api/auth/verify` `{ message, signature }` (a signed EIP-4361 message) → `{ token, account }`. `token` is a bearer JWT for the routes below.
- `GET /api/decks` (auth) → `{ decks }` — the caller's saved decks.
- `POST /api/decks` (auth) `{ name, cards }` → `{ deck }`, `422` if `cards` fails `validateDeck()`.
- `PUT /api/decks/:id` (auth) `{ name, cards }` → `{ deck }`, `404` if the deck doesn't exist or belongs to someone else.
- `DELETE /api/decks/:id` (auth) → `204`, same `404` behavior.

Required environment variables (missing `DATABASE_URL` makes `/api/*` return `503` rather than crash the whole server — the WebSocket match server keeps working either way):

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Supabase, Railway Postgres, or local — see below) |
| `JWT_SECRET` | Signs session tokens — any long random string, must stay stable across deploys |
| `SIWE_DOMAIN` | Must exactly match the client's host (e.g. `crypto-clash-client-six.vercel.app`, or `localhost:5173` for local dev) — SIWE messages signed for a different domain are rejected |
| `DATABASE_SSL` | Set to `false` for a local/non-TLS Postgres (e.g. Docker); omit (defaults to a permissive TLS mode) for Supabase/Railway |
| `CLIENT_ORIGIN` | CORS `Access-Control-Allow-Origin` value; defaults to `*` if unset |

### Local development

```
docker run -d --name cryptoclash-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=cryptoclash -p 5433:5432 postgres:16-alpine
DATABASE_URL="postgres://postgres:devpass@localhost:5433/cryptoclash" DATABASE_SSL=false npm run migrate --workspace=server
DATABASE_URL="postgres://postgres:devpass@localhost:5433/cryptoclash" DATABASE_SSL=false JWT_SECRET=dev-secret SIWE_DOMAIN=localhost:5173 npm run dev --workspace=server
```

`server/test/db.test.ts` and `server/test/api.test.ts` are real integration tests against Postgres — they `describe.skip` automatically when `DATABASE_URL` isn't set, so `npm test` stays green without a database, but run them for real (same env vars as above) before trusting a change to `accounts.ts`/`decksRepo.ts`/`httpApi.ts`.

## Why `tsx` in production, not `tsc` + `node dist/`

`@cryptoclash/engine` and `@cryptoclash/protocol`'s `package.json` `main` fields point straight at their TypeScript source (`src/index.ts`), not a compiled output — there's no publish step in this monorepo. That's fine under a TS-aware runtime (tsx, Vite, Vitest), but a plain `node dist/index.js` would crash trying to load a `.ts` file through node_modules resolution. `npm run start` therefore runs the server directly under `tsx`, which is what `npm run dev` already uses and what's been verified end-to-end. If this ever needs a real compiled-artifact deploy, `engine`/`protocol` would need actual build steps and `main`/`exports` pointed at their `dist/` output first.

## Deploying (Railway)

This is an npm-workspaces monorepo, so the workspace root — not `server/` — has to be the install context, or `@cryptoclash/engine`/`@cryptoclash/protocol` won't resolve.

1. New Railway service → Deploy from GitHub repo → this repo.
2. **Root Directory**: leave as the repository root (do *not* set it to `server/`).
3. **Build Command**: `npm install`
4. **Start Command**: `npm run start --workspace=server`
5. Railway injects `PORT`; `createMatchServer` already reads `process.env.PORT`, so no extra env var is needed there.
6. Set `DATABASE_URL`, `JWT_SECRET`, `SIWE_DOMAIN` (and `CLIENT_ORIGIN` to the Vercel client's origin) in Railway's environment variables — see "Accounts & decks API" above. Run `npm run migrate --workspace=server` once (locally, pointed at the production `DATABASE_URL`, or as a Railway deploy step) before the first deploy that needs it.
7. Settings → Networking → Generate Domain, to get a public `wss://` URL.
8. Point the client at it: set `VITE_SERVER_URL=wss://<that-domain>` in the Vercel project's environment variables, then redeploy the client.
