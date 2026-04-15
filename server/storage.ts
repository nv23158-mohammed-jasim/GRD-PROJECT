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

  async adminSearch(search: string, table: string): Promise<unknown[]> {
    const { pool } = await import("./db");
    const like = `%${search}%`;
    const where = search
      ? `WHERE (COALESCE(t.user_email, u.email) ILIKE $1 OR COALESCE(t.user_name, u.name) ILIKE $1)`
      : `WHERE 1=1`;
    const params = search ? [like] : [];

    const queries: Record<string, string> = {
      bmi: `
        SELECT t.*, COALESCE(t.user_email, u.email) AS user_email, COALESCE(t.user_name, u.name) AS user_name,
               'bmi' AS record_type
        FROM bmi_entries t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.date DESC`,
      workout: `
        SELECT t.*, COALESCE(t.user_email, u.email) AS user_email, COALESCE(t.user_name, u.name) AS user_name,
               'workout' AS record_type
        FROM workout_sessions t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.date DESC`,
      game: `
        SELECT t.*, COALESCE(t.user_email, u.email) AS user_email, COALESCE(t.user_name, u.name) AS user_name,
               'game' AS record_type
        FROM game_sessions t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.date DESC`,
      boxing: `
        SELECT t.*, COALESCE(t.user_email, u.email) AS user_email, COALESCE(t.user_name, u.name) AS user_name,
               'boxing' AS record_type
        FROM boxing_sessions t LEFT JOIN users u ON t.user_id = u.id ${where} ORDER BY t.date DESC`,
    };

    const tables = table === "all" ? ["bmi", "workout", "game", "boxing"] : [table];
    const results: unknown[] = [];
    for (const t of tables) {
      if (queries[t]) {
        const res = await pool.query(queries[t], params);
        results.push(...res.rows);
      }
    }
    return results;
  }
}

export const storage = new DatabaseStorage();
