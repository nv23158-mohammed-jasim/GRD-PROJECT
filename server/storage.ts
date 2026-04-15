import { db } from "./db";
import {
  bmiEntries,
  workoutSessions,
  gameSessions,
  boxingSessions,
  users,
  type CreateBmiEntryRequest,
  type BmiEntryResponse,
  type CreateWorkoutSessionRequest,
  type WorkoutSessionResponse,
  type CreateGameSessionRequest,
  type GameSessionResponse,
  type CreateBoxingSessionRequest,
  type BoxingSessionResponse,
  type User,
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

interface UserIdentity {
  id: string;
  email: string;
  name: string;
}

export interface AdminRecord {
  id: number;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  date: Date;
  table: string;
  details: Record<string, unknown>;
}

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | null>;

  // BMI entry methods
  getBmiEntries(userId: string): Promise<BmiEntryResponse[]>;
  createBmiEntry(entry: CreateBmiEntryRequest, user: UserIdentity): Promise<BmiEntryResponse>;

  // Workout session methods
  getWorkoutSessions(userId: string): Promise<WorkoutSessionResponse[]>;
  createWorkoutSession(session: CreateWorkoutSessionRequest, user: UserIdentity): Promise<WorkoutSessionResponse>;
  deleteWorkoutSession(id: number, userId: string): Promise<void>;

  // Game session methods
  getGameSessions(userId: string): Promise<GameSessionResponse[]>;
  createGameSession(session: CreateGameSessionRequest, user: UserIdentity): Promise<GameSessionResponse>;
  deleteGameSession(id: number, userId: string): Promise<void>;

  // Boxing session methods
  getBoxingSessions(userId: string): Promise<BoxingSessionResponse[]>;
  createBoxingSession(session: CreateBoxingSessionRequest, user: UserIdentity): Promise<BoxingSessionResponse>;
  deleteBoxingSession(id: number, userId: string): Promise<void>;

  // Admin methods
  adminSearch(search: string, table: string): Promise<unknown[]>;
  adminBackfill(): Promise<{ updated: number }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || null;
  }

  // BMI entry methods
  async getBmiEntries(userId: string): Promise<BmiEntryResponse[]> {
    return await db.select().from(bmiEntries)
      .where(eq(bmiEntries.userId, userId))
      .orderBy(desc(bmiEntries.date));
  }

  async createBmiEntry(entry: CreateBmiEntryRequest, user: UserIdentity): Promise<BmiEntryResponse> {
    const [created] = await db.insert(bmiEntries).values({
      ...entry,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
    }).returning();
    return created;
  }

  // Workout session methods
  async getWorkoutSessions(userId: string): Promise<WorkoutSessionResponse[]> {
    return await db.select().from(workoutSessions)
      .where(eq(workoutSessions.userId, userId))
      .orderBy(desc(workoutSessions.date));
  }

  async createWorkoutSession(session: CreateWorkoutSessionRequest, user: UserIdentity): Promise<WorkoutSessionResponse> {
    const [created] = await db.insert(workoutSessions).values({
      ...session,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
    }).returning();
    return created;
  }

  async deleteWorkoutSession(id: number, userId: string): Promise<void> {
    await db.delete(workoutSessions).where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)));
  }

  // Game session methods
  async getGameSessions(userId: string): Promise<GameSessionResponse[]> {
    return await db.select().from(gameSessions)
      .where(eq(gameSessions.userId, userId))
      .orderBy(desc(gameSessions.date));
  }

  async createGameSession(session: CreateGameSessionRequest, user: UserIdentity): Promise<GameSessionResponse> {
    const [created] = await db.insert(gameSessions).values({
      ...session,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
    }).returning();
    return created;
  }

  async deleteGameSession(id: number, userId: string): Promise<void> {
    await db.delete(gameSessions).where(and(eq(gameSessions.id, id), eq(gameSessions.userId, userId)));
  }

  // Boxing session methods
  async getBoxingSessions(userId: string): Promise<BoxingSessionResponse[]> {
    return await db.select().from(boxingSessions)
      .where(eq(boxingSessions.userId, userId))
      .orderBy(desc(boxingSessions.date));
  }

  async createBoxingSession(session: CreateBoxingSessionRequest, user: UserIdentity): Promise<BoxingSessionResponse> {
    const [created] = await db.insert(boxingSessions).values({
      ...session,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
    }).returning();
    return created;
  }

  async deleteBoxingSession(id: number, userId: string): Promise<void> {
    await db.delete(boxingSessions).where(and(eq(boxingSessions.id, id), eq(boxingSessions.userId, userId)));
  }

  async adminBackfill(): Promise<{ updated: number }> {
    const { pool } = await import("./db");
    let total = 0;
    const tables = ["bmi_entries", "workout_sessions", "game_sessions", "boxing_sessions"];
    for (const t of tables) {
      // First ensure the columns exist, then backfill
      try {
        await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_email varchar(255)`);
        await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_name varchar(255)`);
        const res = await pool.query(`
          UPDATE ${t} SET user_email = u.email, user_name = u.name
          FROM users u
          WHERE ${t}.user_id = u.id AND (${t}.user_email IS NULL OR ${t}.user_name IS NULL)
        `);
        total += res.rowCount || 0;
      } catch (err) {
        console.error(`[adminBackfill] failed for table "${t}":`, err);
      }
    }
    return { updated: total };
  }

  async adminSearch(search: string, table: string): Promise<unknown[]> {
    const { pool } = await import("./db");
    const like = `%${search}%`;
    // Only search on the joined users table — avoids referencing optional columns that may not exist yet
    const where = search
      ? `WHERE (u.email ILIKE $1 OR u.name ILIKE $1)`
      : ``;
    const params = search ? [like] : [];

    // Explicit column lists — avoids duplicate-column issues when t.* overlaps with our aliases
    const queries: Record<string, string> = {
      bmi: `
        SELECT t.id, t.user_id, t.age, t.height_cm, t.weight_kg, t.bmi, t.category,
               t.gender, t.activity_level, t.suggested_difficulty, t.date,
               u.email AS user_email, u.name AS user_name, 'bmi' AS record_type
        FROM bmi_entries t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.date DESC`,
      workout: `
        SELECT t.id, t.user_id, t.exercise_type, t.difficulty,
               t.target_reps, t.completed_reps, t.time_limit, t.time_taken, t.grade, t.date,
               u.email AS user_email, u.name AS user_name, 'workout' AS record_type
        FROM workout_sessions t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.date DESC`,
      game: `
        SELECT t.id, t.user_id, t.difficulty, t.stage, t.score, t.target_score,
               t.completed, t.time_played, t.date,
               u.email AS user_email, u.name AS user_name, 'game' AS record_type
        FROM game_sessions t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.date DESC`,
      boxing: `
        SELECT t.id, t.user_id, t.difficulty, t.round, t.total_rounds, t.score,
               t.punches_landed, t.punches_missed, t.dodges_successful, t.dodges_missed,
               t.blocks_successful, t.blocks_missed, t.completed, t.time_played, t.date,
               u.email AS user_email, u.name AS user_name, 'boxing' AS record_type
        FROM boxing_sessions t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.date DESC`,
    };

    const tables = table === "all" ? ["bmi", "workout", "game", "boxing"] : [table];
    const results: unknown[] = [];
    for (const t of tables) {
      if (queries[t]) {
        try {
          const res = await pool.query(queries[t], params);
          results.push(...res.rows);
        } catch (err) {
          console.error(`[adminSearch] query failed for table "${t}":`, err);
        }
      }
    }
    return results;
  }
}

export const storage = new DatabaseStorage();
