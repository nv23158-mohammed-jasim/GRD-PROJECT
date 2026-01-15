
import { pgTable, text, serial, integer, decimal, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const entries = pgTable("entries", {
  id: serial("id").primaryKey(),
  steps: integer("steps").notNull(),
  calories: integer("calories").notNull(),
  // Using text for decimal to avoid precision issues in JS, or assume double precision
  weight: decimal("weight", { precision: 5, scale: 2 }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
});

// === BASE SCHEMAS ===
// Allow weight to be a number string or number in Zod, but Drizzle returns string for decimal
export const insertEntrySchema = createInsertSchema(entries).omit({ 
  id: true, 
  date: true 
}).extend({
  weight: z.preprocess((val) => String(val), z.string()), 
});

// === EXPLICIT API CONTRACT TYPES ===
export type Entry = typeof entries.$inferSelect;
export type InsertEntry = z.infer<typeof insertEntrySchema>;

// Request types
export type CreateEntryRequest = InsertEntry;
export type UpdateEntryRequest = Partial<InsertEntry>;

// Response types
export type EntryResponse = Entry;
export type EntriesListResponse = Entry[];
