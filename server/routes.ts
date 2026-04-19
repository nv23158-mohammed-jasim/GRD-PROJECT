import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { getUserFromToken } from "./auth";

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const tokenUser = await getUserFromToken(req);
  if (tokenUser) {
    req.user = tokenUser;
    return next();
  }
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
}

function userIdentity(req: Request) {
  const u = req.user as Express.User;
  return { id: u.id, email: u.email, name: u.name };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === BMI ENTRIES ROUTES ===
  app.get(api.bmiEntries.list.path, requireAuth, async (req, res) => {
    const entries = await storage.getBmiEntries(userIdentity(req).id);
    res.json(entries);
  });

  app.post(api.bmiEntries.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.bmiEntries.create.input.parse(req.body);
      const entry = await storage.createBmiEntry(input, userIdentity(req));
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // === WORKOUT SESSIONS ROUTES ===
  app.get(api.workoutSessions.list.path, requireAuth, async (req, res) => {
    const sessions = await storage.getWorkoutSessions(userIdentity(req).id);
    res.json(sessions);
  });

  app.post(api.workoutSessions.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.workoutSessions.create.input.parse(req.body);
      const session = await storage.createWorkoutSession(input, userIdentity(req));
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.workoutSessions.delete.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    await storage.deleteWorkoutSession(id, userIdentity(req).id);
    res.status(204).send();
  });

  // === GAME SESSIONS ROUTES ===
  app.get(api.gameSessions.list.path, requireAuth, async (req, res) => {
    const sessions = await storage.getGameSessions(userIdentity(req).id);
    res.json(sessions);
  });

  app.post(api.gameSessions.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.gameSessions.create.input.parse(req.body);
      const session = await storage.createGameSession(input, userIdentity(req));
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.gameSessions.delete.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    await storage.deleteGameSession(id, userIdentity(req).id);
    res.status(204).send();
  });

  // === BOXING SESSIONS ROUTES ===
  app.get(api.boxingSessions.list.path, requireAuth, async (req, res) => {
    const sessions = await storage.getBoxingSessions(userIdentity(req).id);
    res.json(sessions);
  });

  app.post(api.boxingSessions.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.boxingSessions.create.input.parse(req.body);
      const session = await storage.createBoxingSession(input, userIdentity(req));
      res.status(201).json(session);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.boxingSessions.delete.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    await storage.deleteBoxingSession(id, userIdentity(req).id);
    res.status(204).send();
  });

  // === ADMIN ROUTES — restricted to admin email only ===
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "mohammednv23158@gmail.com")
    .split(",").map(e => e.trim().toLowerCase());

  app.get("/api/admin/check", requireAuth, (req, res) => {
    const u = userIdentity(req);
    res.json({ isAdmin: ADMIN_EMAILS.includes(u.email.toLowerCase()) });
  });

  app.get("/api/admin/users", requireAuth, async (req, res) => {
    const u = userIdentity(req);
    if (!ADMIN_EMAILS.includes(u.email.toLowerCase())) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const { pool } = await import("./db");
    try {
      const r = await pool.query(`
        SELECT id, email, name, picture,
               COALESCE(auth_provider, 'google') AS login_method,
               CASE WHEN password_hash IS NOT NULL THEN true ELSE false END AS has_password,
               created_at::text,
               (SELECT COUNT(*) FROM workout_sessions  WHERE user_id = users.id)::int AS workout_count,
               (SELECT COUNT(*) FROM bmi_entries       WHERE user_id = users.id)::int AS bmi_count,
               (SELECT COUNT(*) FROM game_sessions     WHERE user_id = users.id)::int AS game_count,
               (SELECT COUNT(*) FROM boxing_sessions   WHERE user_id = users.id)::int AS boxing_count
        FROM users
        ORDER BY created_at DESC NULLS LAST
      `);
      res.json(r.rows);
    } catch (e) {
      res.status(500).json({ message: String(e) });
    }
  });

  app.delete("/api/admin/users/:id", requireAuth, async (req, res) => {
    const u = userIdentity(req);
    if (!ADMIN_EMAILS.includes(u.email.toLowerCase())) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const targetId = req.params.id;
    if (targetId === u.id) {
      return res.status(400).json({ message: "You cannot delete your own admin account." });
    }
    try {
      const result = await storage.adminDeleteUser(targetId);
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: String(e) });
    }
  });

  app.get("/api/admin/search", requireAuth, async (req, res) => {
    const u = userIdentity(req);
    if (!ADMIN_EMAILS.includes(u.email.toLowerCase())) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const search = String(req.query.search || "");
    const table = String(req.query.table || "all");
    const results = await storage.adminSearch(search, table);
    res.json(results);
  });

  app.post("/api/admin/backfill", requireAuth, async (req, res) => {
    const u = userIdentity(req);
    if (!ADMIN_EMAILS.includes(u.email.toLowerCase())) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const result = await storage.adminBackfill();
    res.json(result);
  });

  app.post("/api/admin/claim-orphans", requireAuth, async (req, res) => {
    const u = userIdentity(req);
    if (!ADMIN_EMAILS.includes(u.email.toLowerCase())) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const result = await storage.adminClaimOrphans(u.id);
    res.json(result);
  });

  // Raw counts — bypasses all JOINs / COALESCE to show true DB totals
  app.get("/api/admin/counts", requireAuth, async (req, res) => {
    const u = userIdentity(req);
    if (!ADMIN_EMAILS.includes(u.email.toLowerCase())) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const { pool } = await import("./db");
    const counts: Record<string, number | string> = {};
    for (const [key, tbl] of [
      ["bmi", "bmi_entries"],
      ["workout", "workout_sessions"],
      ["game", "game_sessions"],
      ["boxing", "boxing_sessions"],
      ["users", "users"],
    ] as [string, string][]) {
      try {
        const r = await pool.query(`SELECT COUNT(*) AS n FROM ${tbl}`);
        counts[key] = Number(r.rows[0].n);
      } catch (e: unknown) {
        counts[key] = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    res.json(counts);
  });

  return httpServer;
}
