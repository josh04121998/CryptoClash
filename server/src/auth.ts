import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { generateNonce, SiweMessage } from "siwe";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes — long enough to sign in a wallet, short enough to limit replay risk.
const SESSION_TTL = "7d";

/**
 * Nonces live in-memory (this is a single Railway process, per architecture.md's
 * current deployment). A restart just means an in-flight sign-in has to retry —
 * acceptable; a nonce store is not data anyone needs persisted.
 */
const pendingNonces = new Map<string, number>(); // nonce -> expiresAt

export function issueNonce(): string {
  const nonce = generateNonce();
  pendingNonces.set(nonce, Date.now() + NONCE_TTL_MS);
  return nonce;
}

function consumeNonce(nonce: string): boolean {
  const expiresAt = pendingNonces.get(nonce);
  pendingNonces.delete(nonce); // one-time use regardless of outcome
  return expiresAt !== undefined && expiresAt > Date.now();
}

/** Sweep expired nonces occasionally so the map can't grow unbounded from abandoned sign-in attempts. */
export function pruneExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, expiresAt] of pendingNonces) {
    if (expiresAt <= now) pendingNonces.delete(nonce);
  }
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

export interface SessionClaims {
  accountId: string;
  walletAddress: string;
}

export async function issueSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ walletAddress: claims.walletAddress })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.accountId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.sub !== "string" || typeof payload.walletAddress !== "string") return null;
    return { accountId: payload.sub, walletAddress: payload.walletAddress };
  } catch {
    return null;
  }
}

export interface SiweVerifyResult {
  ok: true;
  address: string;
}
export interface SiweVerifyError {
  ok: false;
  error: string;
}

/**
 * Verifies a signed SIWE message: signature validity, and that the nonce is
 * one we issued and hasn't been used before (replay protection). The message's
 * own `domain`/`uri` fields are checked against `expectedDomain` so a signature
 * collected for this app can't be replayed against a different one.
 */
export async function verifySiwe(
  message: string,
  signature: string,
  expectedDomain: string,
): Promise<SiweVerifyResult | SiweVerifyError> {
  let siweMessage: SiweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch {
    return { ok: false, error: "Malformed SIWE message." };
  }

  if (siweMessage.domain !== expectedDomain) {
    return { ok: false, error: "Domain mismatch." };
  }
  if (!consumeNonce(siweMessage.nonce)) {
    return { ok: false, error: "Unknown or expired nonce." };
  }

  try {
    const result = await siweMessage.verify({ signature });
    if (!result.success) return { ok: false, error: "Signature verification failed." };
    return { ok: true, address: result.data.address.toLowerCase() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
