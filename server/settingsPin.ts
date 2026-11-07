// Settings PIN — a second lock on the admin Settings page.
// ─────────────────────────────────────────────────────────────────────────────
// Only a full super admin (not view-only VEW, not qasim@amu.ac.in) may open
// Settings. On top of the normal admin login they must enter a PIN. A correct PIN
// gives a short-lived "unlock token" (header x-settings-unlock) that every
// Settings write API checks on the server, so typing an address cannot skip it.
//
// Table `admin_settings_pin` (one row per admin) — created in migrations.ts.
// The PIN is stored as an scrypt hash, never in plain text.
import type { Express, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";

const UNLOCK_MINUTES = 30;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const PIN_RE = /^\d{4,8}$/;

// Signing key for unlock tokens. A fixed key from the environment keeps tokens
// valid across restarts; without it a random key is used (restart = PIN again).
const SECRET = process.env.SETTINGS_PIN_SECRET || crypto.randomBytes(32).toString("hex");

/** Same rule as the client (admin-access.ts): full super admins only */
export function isFullSuperAdmin(admin: any): boolean {
  if (!admin) return false;
  const role = String(admin.role || "");
  const isSalary = role === "salary" || role === "salary_admin";
  return !isSalary && admin.userCode !== "VEW" && admin.email !== "qasim@amu.ac.in";
}

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function checkPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pin, salt, 32);
  const real = Buffer.from(hash, "hex");
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function makeUnlockToken(adminId: number): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + UNLOCK_MINUTES * 60_000;
  const payload = `${adminId}.${expiresAt}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

function readUnlockToken(token: unknown): { adminId: number; expiresAt: number } | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  if (expected.length !== parts[2].length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;
  const adminId = Number(parts[0]);
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(adminId) || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return { adminId, expiresAt };
}

// Lock times are worked out by the database clock (NOW()), so the server's time
// zone cannot shift them. lockMsLeft > 0 means locked; hadLock = a lock that ran out.
async function getPinRow(adminId: number) {
  const r = await db.execute(sql`
    SELECT pin_hash, failed_attempts,
           locked_until IS NOT NULL AS had_lock,
           GREATEST(0, CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())) * 1000))::bigint AS lock_ms_left
    FROM admin_settings_pin WHERE admin_id = ${adminId}`);
  const row = r.rows[0] as any;
  if (!row) return null;
  return {
    pinHash: String(row.pin_hash),
    failedAttempts: Number(row.failed_attempts) || 0,
    hadLock: !!row.had_lock,
    lockMsLeft: Number(row.lock_ms_left) || 0,
  };
}

/**
 * Middleware: use AFTER verifyAdminSession. Allows the request only for a full
 * super admin carrying a valid unlock token issued to that same admin.
 */
export function requireSettingsUnlock(req: Request, res: Response, next: NextFunction) {
  const admin = (req as any).adminUser;
  if (!isFullSuperAdmin(admin)) {
    return res.status(403).json({ message: "Only the super admin can change settings" });
  }
  const unlock = readUnlockToken(req.headers["x-settings-unlock"]);
  if (!unlock || unlock.adminId !== admin.id) {
    return res.status(401).json({ message: "Settings are locked. Enter your PIN again.", code: "SETTINGS_LOCKED" });
  }
  next();
}

export function registerSettingsPinRoutes(app: Express, verifyAdminSession: any) {
  const superOnly = (req: Request, res: Response, next: NextFunction) => {
    if (!isFullSuperAdmin((req as any).adminUser)) {
      return res.status(403).json({ message: "Only the super admin can open settings" });
    }
    next();
  };

  // Is a PIN set? Is it locked after wrong tries?
  app.get("/api/admin/settings-pin/status", verifyAdminSession, superOnly, async (req, res) => {
    try {
      const admin = (req as any).adminUser;
      const row = await getPinRow(admin.id);
      const locked = !!row && row.lockMsLeft > 0;
      res.json({
        pinSet: !!row,
        locked,
        lockedUntil: locked ? Date.now() + row!.lockMsLeft : null,
        unlockMinutes: UNLOCK_MINUTES,
      });
    } catch (e) {
      console.error("[SettingsPin] status failed:", e);
      res.status(500).json({ message: "Could not read PIN status" });
    }
  });

  // Set or change the PIN. Needs the admin's login password (re-check who it is).
  app.post("/api/admin/settings-pin/setup", verifyAdminSession, superOnly, async (req, res) => {
    try {
      const admin = (req as any).adminUser;
      const { password, pin } = req.body || {};
      if (typeof password !== "string" || password !== admin.password) {
        return res.status(401).json({ message: "Login password is not correct" });
      }
      if (typeof pin !== "string" || !PIN_RE.test(pin)) {
        return res.status(400).json({ message: "PIN must be 4 to 8 digits" });
      }
      await db.execute(sql`
        INSERT INTO admin_settings_pin (admin_id, pin_hash, failed_attempts, locked_until, updated_at)
        VALUES (${admin.id}, ${hashPin(pin)}, 0, NULL, NOW())
        ON CONFLICT (admin_id) DO UPDATE
          SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = NOW()`);
      res.json({ ok: true, ...makeUnlockToken(admin.id) });
    } catch (e) {
      console.error("[SettingsPin] setup failed:", e);
      res.status(500).json({ message: "Could not save PIN" });
    }
  });

  // Enter the PIN → unlock token
  app.post("/api/admin/settings-pin/verify", verifyAdminSession, superOnly, async (req, res) => {
    try {
      const admin = (req as any).adminUser;
      const pin = req.body?.pin;
      const row = await getPinRow(admin.id);
      if (!row) return res.status(400).json({ message: "No PIN set yet", code: "PIN_NOT_SET" });

      if (row.lockMsLeft > 0) {
        return res.status(429).json({ message: "Too many wrong PINs. Try again later.", lockedUntil: Date.now() + row.lockMsLeft });
      }

      if (typeof pin === "string" && PIN_RE.test(pin) && checkPin(pin, row.pinHash)) {
        await db.execute(sql`
          UPDATE admin_settings_pin SET failed_attempts = 0, locked_until = NULL WHERE admin_id = ${admin.id}`);
        return res.json({ ok: true, ...makeUnlockToken(admin.id) });
      }

      // A lock that has run out starts a fresh count
      const attempts = (row.hadLock ? 0 : row.failedAttempts) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await db.execute(sql`
          UPDATE admin_settings_pin
          SET failed_attempts = ${attempts}, locked_until = NOW() + make_interval(mins => ${LOCK_MINUTES})
          WHERE admin_id = ${admin.id}`);
        return res.status(429).json({
          message: `Too many wrong PINs. Locked for ${LOCK_MINUTES} minutes.`,
          lockedUntil: Date.now() + LOCK_MINUTES * 60_000,
        });
      }
      await db.execute(sql`
        UPDATE admin_settings_pin SET failed_attempts = ${attempts}, locked_until = NULL WHERE admin_id = ${admin.id}`);
      res.status(401).json({ message: `Wrong PIN. ${MAX_ATTEMPTS - attempts} tries left.`, attemptsLeft: MAX_ATTEMPTS - attempts });
    } catch (e) {
      console.error("[SettingsPin] verify failed:", e);
      res.status(500).json({ message: "Could not check PIN" });
    }
  });
}
