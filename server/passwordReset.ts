// Password-reset tokens kept in the database (survive restarts). Only a SHA-256
// hash of each token is stored; a token is valid for one hour and one use.
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";

export type ResetKind = "admin" | "department";

let tableReady: Promise<unknown> | null = null;
function ensureTable() {
  tableReady ??= db.execute(sql`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    kind TEXT NOT NULL,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (kind, email))`);
  return tableReady;
}

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const norm = (email: string) => String(email || "").trim().toLowerCase();

/** New token for this account (replaces an older one). Returns the plain token for the e-mail link. */
export async function createResetToken(kind: ResetKind, email: string, minutes = 60): Promise<string> {
  await ensureTable();
  const token = crypto.randomBytes(32).toString("base64url");
  await db.execute(sql`INSERT INTO password_reset_tokens (kind, email, token_hash, expires_at)
    VALUES (${kind}, ${norm(email)}, ${hash(token)}, NOW() + (${minutes} * INTERVAL '1 minute'))
    ON CONFLICT (kind, email) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at`);
  return token;
}

export async function isResetTokenValid(kind: ResetKind, email: string, token: string): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  await ensureTable();
  const row = (await db.execute(sql`SELECT token_hash FROM password_reset_tokens
    WHERE kind = ${kind} AND email = ${norm(email)} AND expires_at > NOW()`)).rows[0] as any;
  if (!row) return false;
  const a = Buffer.from(String(row.token_hash), "hex");
  const b = Buffer.from(hash(token), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function clearResetToken(kind: ResetKind, email: string): Promise<void> {
  await ensureTable();
  await db.execute(sql`DELETE FROM password_reset_tokens WHERE kind = ${kind} AND email = ${norm(email)}`);
}
