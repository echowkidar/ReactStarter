// Per-admin preferences (e.g. a dealing assistant's own salary-register order).
// Stored in its own table `admin_preferences`; nothing else reads or writes it.
import type { Express, Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { DbStorage } from "./dbStorage";

// Only these keys may be stored, each with a validator
const ALLOWED_KEYS: Record<string, (v: unknown) => boolean> = {
  salary_register_order: (v) =>
    Array.isArray(v) && v.length <= 5000 && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 100),
};

/** Same token check as verifyAdminSession; view-only (VEW) admins may also save their OWN preferences */
async function getAdmin(req: Request, storage: DbStorage) {
  let token: any = req.headers["x-session-token"];
  if (!token && req.query.token) token = req.query.token;
  if (!token || typeof token !== "string") return null;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length < 2) return null;
    const email = parts[0];
    const password = parts.slice(1).join(":");
    const admin = await storage.getAdminByEmail(email);
    if (!admin || admin.password !== password) return null;
    return admin;
  } catch {
    return null;
  }
}

export function registerAdminPreferenceRoutes(app: Express, storage: DbStorage) {
  app.get("/api/admin/preferences/:key", async (req, res) => {
    const admin = await getAdmin(req, storage);
    if (!admin) return res.status(401).json({ message: "Unauthorized" });
    const key = req.params.key;
    if (!ALLOWED_KEYS[key]) return res.status(400).json({ message: "Unknown preference" });
    try {
      const r = await db.execute(sql`
        SELECT value FROM admin_preferences WHERE admin_email = ${admin.email.toLowerCase()} AND pref_key = ${key}`);
      res.json({ key, value: r.rows.length ? (r.rows[0] as any).value : null });
    } catch (e) {
      // table missing etc. — behave as "no preference saved"
      console.error("[AdminPrefs] read failed:", e);
      res.json({ key, value: null });
    }
  });

  app.put("/api/admin/preferences/:key", async (req, res) => {
    const admin = await getAdmin(req, storage);
    if (!admin) return res.status(401).json({ message: "Unauthorized" });
    const key = req.params.key;
    const validate = ALLOWED_KEYS[key];
    if (!validate) return res.status(400).json({ message: "Unknown preference" });
    const value = req.body?.value;
    if (!validate(value)) return res.status(400).json({ message: "Invalid value" });
    try {
      await db.execute(sql`
        INSERT INTO admin_preferences (admin_email, pref_key, value, updated_at)
        VALUES (${admin.email.toLowerCase()}, ${key}, ${JSON.stringify(value)}::jsonb, NOW())
        ON CONFLICT (admin_email, pref_key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`);
      res.json({ key, value });
    } catch (e) {
      console.error("[AdminPrefs] save failed:", e);
      res.status(500).json({ message: "Could not save preference" });
    }
  });
}
