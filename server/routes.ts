import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
}

function userId(req: Request): string {
  return (req.user as Express.User).id;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === ENTRIES ROUTES ===
  app.get(api.entries.list.path, requireAuth, async (req, res) => {
    const entries = await storage.getEntries(userId(req));
    res.json(entries);
  });

  app.post(api.entries.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.entries.create.input.parse(req.body);
      const entry = await storage.createEntry(input, userId(req));
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

  app.delete(api.entries.delete.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(404).json({ message: "Invalid ID" });
    }
    await storage.deleteEntry(id, userId(req));
    res.status(204).send();
  });

  // === WORKOUT SESSIONS ROUTES ===
  app.get(api.workoutSessions.list.path, requireAuth, async (req, res) => {
    const sessions = await storage.getWorkoutSessions(userId(req));
    res.json(sessions);
  });

  app.post(api.workoutSessions.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.workoutSessions.create.input.parse(req.body);
      const session = await storage.createWorkoutSession(input, userId(req));
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
    if (isNaN(id)) {
      return res.status(404).json({ message: "Invalid ID" });
    }
    await storage.deleteWorkoutSession(id, userId(req));
    res.status(204).send();
  });

  // === GAME SESSIONS ROUTES ===
  app.get(api.gameSessions.list.path, requireAuth, async (req, res) => {
    const sessions = await storage.getGameSessions(userId(req));
    res.json(sessions);
  });

  app.post(api.gameSessions.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.gameSessions.create.input.parse(req.body);
      const session = await storage.createGameSession(input, userId(req));
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
    if (isNaN(id)) {
      return res.status(404).json({ message: "Invalid ID" });
    }
    await storage.deleteGameSession(id, userId(req));
    res.status(204).send();
  });

  // === BOXING SESSIONS ROUTES ===
  app.get(api.boxingSessions.list.path, requireAuth, async (req, res) => {
    const sessions = await storage.getBoxingSessions(userId(req));
    res.json(sessions);
  });

  app.post(api.boxingSessions.create.path, requireAuth, async (req, res) => {
    try {
      const input = api.boxingSessions.create.input.parse(req.body);
      const session = await storage.createBoxingSession(input, userId(req));
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
    if (isNaN(id)) {
      return res.status(404).json({ message: "Invalid ID" });
    }
    await storage.deleteBoxingSession(id, userId(req));
    res.status(204).send();
  });

  return httpServer;
}
