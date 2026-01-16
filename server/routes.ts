import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === ENTRIES ROUTES ===
  app.get(api.entries.list.path, async (req, res) => {
    const entries = await storage.getEntries();
    res.json(entries);
  });

  app.post(api.entries.create.path, async (req, res) => {
    try {
      const input = api.entries.create.input.parse(req.body);
      const entry = await storage.createEntry(input);
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

  app.delete(api.entries.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(404).json({ message: "Invalid ID" });
    }
    await storage.deleteEntry(id);
    res.status(204).send();
  });

  // === WORKOUT SESSIONS ROUTES ===
  app.get(api.workoutSessions.list.path, async (req, res) => {
    const sessions = await storage.getWorkoutSessions();
    res.json(sessions);
  });

  app.post(api.workoutSessions.create.path, async (req, res) => {
    try {
      const input = api.workoutSessions.create.input.parse(req.body);
      const session = await storage.createWorkoutSession(input);
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

  app.delete(api.workoutSessions.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(404).json({ message: "Invalid ID" });
    }
    await storage.deleteWorkoutSession(id);
    res.status(204).send();
  });

  // === GAME SESSIONS ROUTES ===
  app.get(api.gameSessions.list.path, async (req, res) => {
    const sessions = await storage.getGameSessions();
    res.json(sessions);
  });

  app.post(api.gameSessions.create.path, async (req, res) => {
    try {
      const input = api.gameSessions.create.input.parse(req.body);
      const session = await storage.createGameSession(input);
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

  app.delete(api.gameSessions.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(404).json({ message: "Invalid ID" });
    }
    await storage.deleteGameSession(id);
    res.status(204).send();
  });

  return httpServer;
}
