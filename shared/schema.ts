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

// Boxing mode sessions (shadow boxing trainer history)
export const boxingSessions = pgTable("boxing_sessions", {
  id: serial("id").primaryKey(),
  difficulty: varchar("difficulty", { length: 20 }).notNull(), // "easy" | "medium" | "hard"
  round: integer("round").notNull(),
  totalRounds: integer("total_rounds").notNull(),
  score: integer("score").notNull(),
  punchesLanded: integer("punches_landed").notNull(),
  punchesMissed: integer("punches_missed").notNull(),
  dodgesSuccessful: integer("dodges_successful").notNull(),
  dodgesMissed: integer("dodges_missed").notNull(),
  blocksSuccessful: integer("blocks_successful").notNull(),
  blocksMissed: integer("blocks_missed").notNull(),
  completed: integer("completed").notNull(), // 1 = completed all rounds, 0 = quit early
  timePlayed: integer("time_played").notNull(), // in seconds
  date: timestamp("date").defaultNow().notNull(),
});

// Game sessions (Neon Run game history)
export const gameSessions = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  difficulty: varchar("difficulty", { length: 20 }).notNull(), // "easy" | "medium" | "hard"
  stage: integer("stage").notNull(),
  score: integer("score").notNull(),
  targetScore: integer("target_score").notNull(),
  completed: integer("completed").notNull(), // 1 = completed, 0 = failed
  timePlayed: integer("time_played").notNull(), // in seconds
  date: timestamp("date").defaultNow().notNull(),
});

// Workout sessions (pushups, squats with pose detection)
export const workoutSessions = pgTable("workout_sessions", {
  id: serial("id").primaryKey(),
  exerciseType: varchar("exercise_type", { length: 50 }).notNull(), // "pushups" | "squats"
  difficulty: varchar("difficulty", { length: 20 }).notNull(), // "beginner" | "medium" | "pro"
  intensity: integer("intensity").default(2).notNull(), // 1, 2, or 3
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

export const insertGameSessionSchema = createInsertSchema(gameSessions).omit({
  id: true,
  date: true,
});

export const insertBoxingSessionSchema = createInsertSchema(boxingSessions).omit({
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

// Game session types
export type GameSession = typeof gameSessions.$inferSelect;
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;
export type CreateGameSessionRequest = InsertGameSession;
export type GameSessionResponse = GameSession;
export type GameSessionsListResponse = GameSession[];

// Boxing session types
export type BoxingSession = typeof boxingSessions.$inferSelect;
export type InsertBoxingSession = z.infer<typeof insertBoxingSessionSchema>;
export type CreateBoxingSessionRequest = InsertBoxingSession;
export type BoxingSessionResponse = BoxingSession;
export type BoxingSessionsListResponse = BoxingSession[];

// Exercise and difficulty types
export type ExerciseType = "pushups" | "squats";
export type DifficultyLevel = "beginner" | "medium" | "pro";
export type IntensityLevel = 1 | 2 | 3;
export type Grade = "AA+" | "A+" | "A" | "B" | "C" | "D" | "F";

// Base difficulty configuration (for intensity level 2)
export interface BaseDifficultyConfig {
  level: DifficultyLevel;
  baseTimeLimit: number; // seconds at intensity 2
  baseTargetReps: number; // reps at intensity 2
}

// Computed difficulty config with intensity applied
export interface DifficultyConfig {
  level: DifficultyLevel;
  intensity: IntensityLevel;
  timeLimit: number;
  targetReps: number;
}

// Base configs at intensity level 2 (balanced)
const baseDifficultyConfigs: Record<ExerciseType, Record<DifficultyLevel, BaseDifficultyConfig>> = {
  pushups: {
    beginner: { level: "beginner", baseTimeLimit: 90, baseTargetReps: 10 },
    medium: { level: "medium", baseTimeLimit: 75, baseTargetReps: 20 },
    pro: { level: "pro", baseTimeLimit: 60, baseTargetReps: 30 },
  },
  squats: {
    beginner: { level: "beginner", baseTimeLimit: 90, baseTargetReps: 15 },
    medium: { level: "medium", baseTimeLimit: 75, baseTargetReps: 30 },
    pro: { level: "pro", baseTimeLimit: 60, baseTargetReps: 50 },
  },
};

// Intensity multipliers:
// Level 1: More time (+25%), fewer reps (-25%) - easier
// Level 2: Balanced (base values)
// Level 3: Less time (-25%), more reps (+25%) - harder
const intensityModifiers: Record<IntensityLevel, { timeMod: number; repsMod: number }> = {
  1: { timeMod: 1.25, repsMod: 0.75 },
  2: { timeMod: 1.0, repsMod: 1.0 },
  3: { timeMod: 0.75, repsMod: 1.25 },
};

// Get config for specific exercise, difficulty, and intensity
export function getDifficultyConfig(
  exercise: ExerciseType,
  difficulty: DifficultyLevel,
  intensity: IntensityLevel = 2
): DifficultyConfig {
  const base = baseDifficultyConfigs[exercise][difficulty];
  const mod = intensityModifiers[intensity];
  
  return {
    level: difficulty,
    intensity,
    timeLimit: Math.round(base.baseTimeLimit * mod.timeMod),
    targetReps: Math.round(base.baseTargetReps * mod.repsMod),
  };
}

// Legacy export for backwards compatibility
export const difficultyConfigs: Record<ExerciseType, Record<DifficultyLevel, DifficultyConfig>> = {
  pushups: {
    beginner: getDifficultyConfig("pushups", "beginner", 2),
    medium: getDifficultyConfig("pushups", "medium", 2),
    pro: getDifficultyConfig("pushups", "pro", 2),
  },
  squats: {
    beginner: getDifficultyConfig("squats", "beginner", 2),
    medium: getDifficultyConfig("squats", "medium", 2),
    pro: getDifficultyConfig("squats", "pro", 2),
  },
};
