import { pgTable, text, serial, integer, decimal, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

// Daily fitness entries (steps, calories, weight tracking)
export const entries = pgTable("entries", {
  id: serial("id").primaryKey(),
  steps: integer("steps").notNull(),
  calories: integer("calories").notNull(),
  weight: decimal("weight", { precision: 5, scale: 2 }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
});

// Workout sessions (pushups, squats with pose detection)
export const workoutSessions = pgTable("workout_sessions", {
  id: serial("id").primaryKey(),
  exerciseType: varchar("exercise_type", { length: 50 }).notNull(), // "pushups" | "squats"
  difficulty: varchar("difficulty", { length: 20 }).notNull(), // "beginner" | "medium" | "pro"
  targetReps: integer("target_reps").notNull(),
  completedReps: integer("completed_reps").notNull(),
  timeLimit: integer("time_limit").notNull(), // in seconds
  timeTaken: integer("time_taken").notNull(), // in seconds
  grade: varchar("grade", { length: 10 }).notNull(), // "AA+", "A+", "A", "B", "C", "D", "F"
  date: timestamp("date").defaultNow().notNull(),
});

// === BASE SCHEMAS ===
export const insertEntrySchema = createInsertSchema(entries).omit({ 
  id: true, 
  date: true 
}).extend({
  weight: z.preprocess((val) => String(val), z.string()), 
});

export const insertWorkoutSessionSchema = createInsertSchema(workoutSessions).omit({
  id: true,
  date: true,
});

// === EXPLICIT API CONTRACT TYPES ===

// Entry types
export type Entry = typeof entries.$inferSelect;
export type InsertEntry = z.infer<typeof insertEntrySchema>;
export type CreateEntryRequest = InsertEntry;
export type UpdateEntryRequest = Partial<InsertEntry>;
export type EntryResponse = Entry;
export type EntriesListResponse = Entry[];

// Workout session types
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type InsertWorkoutSession = z.infer<typeof insertWorkoutSessionSchema>;
export type CreateWorkoutSessionRequest = InsertWorkoutSession;
export type WorkoutSessionResponse = WorkoutSession;
export type WorkoutSessionsListResponse = WorkoutSession[];

// Exercise and difficulty types
export type ExerciseType = "pushups" | "squats";
export type DifficultyLevel = "beginner" | "medium" | "pro";
export type Grade = "AA+" | "A+" | "A" | "B" | "C" | "D" | "F";

// Difficulty configuration
export interface DifficultyConfig {
  level: DifficultyLevel;
  timeLimit: number; // seconds
  targetReps: number;
}

export const difficultyConfigs: Record<ExerciseType, Record<DifficultyLevel, DifficultyConfig>> = {
  pushups: {
    beginner: { level: "beginner", timeLimit: 120, targetReps: 10 },
    medium: { level: "medium", timeLimit: 90, targetReps: 20 },
    pro: { level: "pro", timeLimit: 60, targetReps: 30 },
  },
  squats: {
    beginner: { level: "beginner", timeLimit: 120, targetReps: 15 },
    medium: { level: "medium", timeLimit: 90, targetReps: 30 },
    pro: { level: "pro", timeLimit: 60, targetReps: 50 },
  },
};
