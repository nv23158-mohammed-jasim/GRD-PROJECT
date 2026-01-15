
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

  // Seed data if needed
  await seedDatabase();

  return httpServer;
}

// Seed function to add some initial data if empty
export async function seedDatabase() {
  const existing = await storage.getEntries();
  if (existing.length === 0) {
    console.log("Seeding database with initial fitness data...");
    const today = new Date();
    
    // Create 5 days of data
    for (let i = 4; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      // Random realistic data
      // Steps: 5000 - 12000
      // Calories: 200 - 600
      // Weight: fluctuating around 75kg
      await storage.createEntry({
        steps: Math.floor(5000 + Math.random() * 7000),
        calories: Math.floor(200 + Math.random() * 400),
        weight: (75 + (Math.random() * 1 - 0.5)).toFixed(2), // 74.5 - 75.5
      });
    }
    console.log("Seeding complete.");
  }
}
