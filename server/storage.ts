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
  adminBackfill(): Promise<{ updated: number; detail: Record<string, unknown> }>;
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

  async adminBackfill(): Promise<{ updated: number; detail: Record<string, unknown> }> {
    const { pool } = await import("./db");
    let total = 0;
    const detail: Record<string, unknown> = {};
    const tables = ["bmi_entries", "workout_sessions", "game_sessions", "boxing_sessions"];
    for (const t of tables) {
      try {
        await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_id    varchar`);
        await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_email varchar(255)`);
        await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_name  varchar(255)`);

        // Count rows that still need backfilling
        const needsUpdate = await pool.query(
          `SELECT COUNT(*) AS n FROM ${t} WHERE user_email IS NULL OR user_name IS NULL`
        );
        const nullBefore = Number(needsUpdate.rows[0].n);

        // Use correlated subquery — works even if user_id is cast differently
        const res = await pool.query(`
          UPDATE ${t}
          SET
            user_email = (SELECT email FROM users WHERE CAST(id AS TEXT) = CAST(${t}.user_id AS TEXT) LIMIT 1),
            user_name  = (SELECT name  FROM users WHERE CAST(id AS TEXT) = CAST(${t}.user_id AS TEXT) LIMIT 1)
          WHERE user_email IS NULL OR user_name IS NULL
        `);
        const updated = res.rowCount || 0;
        total += updated;

        // Count how many are still NULL after update
        const stillNull = await pool.query(
          `SELECT COUNT(*) AS n FROM ${t} WHERE user_email IS NULL OR user_name IS NULL`
        );
        detail[t] = { nullBefore, updated, stillNull: Number(stillNull.rows[0].n) };
      } catch (err) {
        console.error(`[adminBackfill] failed for table "${t}":`, err);
        detail[t] = { error: String(err) };
      }
    }
    return { updated: total, detail };
  }

  async adminSearch(search: string, table: string): Promise<unknown[]> {
    const { pool } = await import("./db");

    const like = `%${search}%`;
    const searchWhere = search
      ? `WHERE (COALESCE(t.user_email, u.email, '') ILIKE $1 OR COALESCE(t.user_name, u.name, '') ILIKE $1)`
      : ``;
    const searchWhereFallback = search
      ? `WHERE (u.email ILIKE $1 OR u.name ILIKE $1)`
      : ``;
    const params = search ? [like] : [];

    // Primary queries: use COALESCE(stored, joined) so backfilled values show even for users not in `users` table
    // Fallback queries: join-only, used if the table is missing user_email/user_name columns
    type TableQueries = { primary: string; fallback: string };
    const queries: Record<string, TableQueries> = {
      bmi: {
        primary: `
          SELECT t.id, t.user_id, t.age, t.height_cm, t.weight_kg, t.bmi, t.category,
                 t.gender, t.activity_level, t.suggested_difficulty, t.date,
                 COALESCE(t.user_email, u.email) AS user_email,
                 COALESCE(t.user_name,  u.name)  AS user_name,
                 'bmi' AS record_type
          FROM bmi_entries t LEFT JOIN users u ON t.user_id = u.id ${searchWhere} ORDER BY t.date DESC`,
        fallback: `
          SELECT t.id, t.user_id, t.age, t.height_cm, t.weight_kg, t.bmi, t.category,
                 t.gender, t.activity_level, t.suggested_difficulty, t.date,
                 u.email AS user_email, u.name AS user_name,
                 'bmi' AS record_type
          FROM bmi_entries t LEFT JOIN users u ON t.user_id = u.id ${searchWhereFallback} ORDER BY t.date DESC`,
      },
      workout: {
        primary: `
          SELECT t.id, t.user_id, t.exercise_type, t.difficulty,
                 t.target_reps, t.completed_reps, t.time_limit, t.time_taken, t.grade, t.date,
                 COALESCE(t.user_email, u.email) AS user_email,
                 COALESCE(t.user_name,  u.name)  AS user_name,
                 'workout' AS record_type
          FROM workout_sessions t LEFT JOIN users u ON t.user_id = u.id ${searchWhere} ORDER BY t.date DESC`,
        fallback: `
          SELECT t.id, t.user_id, t.exercise_type, t.difficulty,
                 t.target_reps, t.completed_reps, t.time_limit, t.time_taken, t.grade, t.date,
                 u.email AS user_email, u.name AS user_name,
                 'workout' AS record_type
          FROM workout_sessions t LEFT JOIN users u ON t.user_id = u.id ${searchWhereFallback} ORDER BY t.date DESC`,
      },
      game: {
        primary: `
          SELECT t.id, t.user_id, t.difficulty, t.stage, t.score, t.target_score,
                 t.completed, t.time_played, t.date,
                 COALESCE(t.user_email, u.email) AS user_email,
                 COALESCE(t.user_name,  u.name)  AS user_name,
                 'game' AS record_type
          FROM game_sessions t LEFT JOIN users u ON t.user_id = u.id ${searchWhere} ORDER BY t.date DESC`,
        fallback: `
          SELECT t.id, t.user_id, t.difficulty, t.stage, t.score, t.target_score,
                 t.completed, t.time_played, t.date,
                 u.email AS user_email, u.name AS user_name,
                 'game' AS record_type
          FROM game_sessions t LEFT JOIN users u ON t.user_id = u.id ${searchWhereFallback} ORDER BY t.date DESC`,
      },
      boxing: {
        primary: `
          SELECT t.id, t.user_id, t.difficulty, t.round, t.total_rounds, t.score,
                 t.punches_landed, t.punches_missed, t.dodges_successful, t.dodges_missed,
                 t.blocks_successful, t.blocks_missed, t.completed, t.time_played, t.date,
                 COALESCE(t.user_email, u.email) AS user_email,
                 COALESCE(t.user_name,  u.name)  AS user_name,
                 'boxing' AS record_type
          FROM boxing_sessions t LEFT JOIN users u ON t.user_id = u.id ${searchWhere} ORDER BY t.date DESC`,
        fallback: `
          SELECT t.id, t.user_id, t.difficulty, t.round, t.total_rounds, t.score,
                 t.punches_landed, t.punches_missed, t.dodges_successful, t.dodges_missed,
                 t.blocks_successful, t.blocks_missed, t.completed, t.time_played, t.date,
                 u.email AS user_email, u.name AS user_name,
                 'boxing' AS record_type
          FROM boxing_sessions t LEFT JOIN users u ON t.user_id = u.id ${searchWhereFallback} ORDER BY t.date DESC`,
      },
    };

    const tables = table === "all" ? ["bmi", "workout", "game", "boxing"] : [table];
    const results: unknown[] = [];
    for (const t of tables) {
      if (queries[t]) {
        try {
          // Try COALESCE version first (shows stored names even for users not in `users` table)
          const res = await pool.query(queries[t].primary, params);
          results.push(...res.rows);
        } catch {
          try {
            // Fall back to JOIN-only if the stored columns don't exist yet
            console.warn(`[adminSearch] primary query failed for "${t}", trying fallback`);
            const res = await pool.query(queries[t].fallback, params);
            results.push(...res.rows);
          } catch (err2) {
            console.error(`[adminSearch] both queries failed for "${t}":`, err2);
          }
        }
      }
    }
    return results;
  }
}

export const storage = new DatabaseStorage();
