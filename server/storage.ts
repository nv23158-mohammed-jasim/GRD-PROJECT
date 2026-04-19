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
  adminDeleteUser(userId: string): Promise<{ deleted: boolean; recordsRemoved: number }>;
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

  async adminClaimOrphans(adminId: string): Promise<{ claimed: number; detail: Record<string, unknown>; backfill: unknown }> {
    const { pool } = await import("./db");
    let total = 0;
    const detail: Record<string, unknown> = {};
    const tables = ["bmi_entries", "workout_sessions", "game_sessions", "boxing_sessions"];
    for (const t of tables) {
      try {
        await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_id varchar`).catch(() => {});
        const before = Number(
          (await pool.query(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id IS NULL`)).rows[0].n
        );
        const res = await pool.query(
          `UPDATE ${t} SET user_id = $1 WHERE user_id IS NULL`,
          [adminId]
        );
        const claimed = res.rowCount || 0;
        total += claimed;
        detail[t] = { orphansBefore: before, claimed };
      } catch (err) {
        detail[t] = { error: String(err) };
      }
    }
    const backfill = await this.adminBackfill();
    return { claimed: total, detail, backfill };
  }

  async adminBackfill(): Promise<{ updated: number; detail: Record<string, unknown> }> {
    const { pool } = await import("./db");
    let total = 0;
    const detail: Record<string, unknown> = {};
    const tables = ["bmi_entries", "workout_sessions", "game_sessions", "boxing_sessions"];
    for (const t of tables) {
      try {
        // Ensure all needed columns exist first
        await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_id    varchar`).catch(() => {});
        await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_email varchar(255)`).catch(() => {});
        await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS user_name  varchar(255)`).catch(() => {});

        const nullBefore = Number(
          (await pool.query(`SELECT COUNT(*) AS n FROM ${t} WHERE user_email IS NULL OR user_name IS NULL`)).rows[0].n
        );

        // JOIN UPDATE — simplest and most reliable form in PostgreSQL
        const res = await pool.query(`
          UPDATE ${t} AS tbl
          SET user_email = u.email,
              user_name  = u.name
          FROM users u
          WHERE tbl.user_id = u.id
            AND (tbl.user_email IS NULL OR tbl.user_name IS NULL)
        `);
        const updated = res.rowCount || 0;
        total += updated;

        const stillNull = Number(
          (await pool.query(`SELECT COUNT(*) AS n FROM ${t} WHERE user_email IS NULL OR user_name IS NULL`)).rows[0].n
        );
        detail[t] = { nullBefore, updated, stillNull };
      } catch (err) {
        console.error(`[adminBackfill] failed for "${t}":`, err);
        detail[t] = { error: String(err) };
      }
    }
    return { updated: total, detail };
  }

  async adminSearch(search: string, table: string): Promise<unknown[]> {
    const { pool } = await import("./db");

    const like = `%${search}%`;
    const params = search ? [like] : [];

    // Three-tier query strategy per table:
    // 1. Primary  — COALESCE(stored user_email, joined u.email) + JOIN on user_id
    // 2. Fallback — JOIN only (no stored columns)
    // 3. Nuclear  — no JOIN, no optional columns; always returns all rows
    const sw  = search ? `WHERE (COALESCE(t.user_email, u.email, '') ILIKE $1 OR COALESCE(t.user_name, u.name, '') ILIKE $1)` : ``;
    const swF = search ? `WHERE (u.email ILIKE $1 OR u.name ILIKE $1)` : ``;

    type TQ = { primary: string; fallback: string; nuclear: string };
    const queries: Record<string, TQ> = {
      bmi: {
        primary: `SELECT t.id,t.user_id,t.age,t.height_cm,t.weight_kg,t.bmi,t.category,t.gender,t.activity_level,t.suggested_difficulty,t.date,
                   COALESCE(t.user_email,u.email) AS user_email,COALESCE(t.user_name,u.name) AS user_name,'bmi' AS record_type
                  FROM bmi_entries t LEFT JOIN users u ON t.user_id=u.id ${sw} ORDER BY t.date DESC`,
        fallback: `SELECT t.id,t.user_id,t.age,t.height_cm,t.weight_kg,t.bmi,t.category,t.gender,t.activity_level,t.suggested_difficulty,t.date,
                   u.email AS user_email,u.name AS user_name,'bmi' AS record_type
                  FROM bmi_entries t LEFT JOIN users u ON t.user_id=u.id ${swF} ORDER BY t.date DESC`,
        nuclear:  `SELECT id,NULL::varchar AS user_id,age,height_cm,weight_kg,bmi,category,gender,activity_level,suggested_difficulty,date,
                   NULL::varchar AS user_email,NULL::varchar AS user_name,'bmi' AS record_type
                  FROM bmi_entries ORDER BY date DESC`,
      },
      workout: {
        primary: `SELECT t.id,t.user_id,t.exercise_type,t.difficulty,t.target_reps,t.completed_reps,t.time_limit,t.time_taken,t.grade,t.date,
                   COALESCE(t.user_email,u.email) AS user_email,COALESCE(t.user_name,u.name) AS user_name,'workout' AS record_type
                  FROM workout_sessions t LEFT JOIN users u ON t.user_id=u.id ${sw} ORDER BY t.date DESC`,
        fallback: `SELECT t.id,t.user_id,t.exercise_type,t.difficulty,t.target_reps,t.completed_reps,t.time_limit,t.time_taken,t.grade,t.date,
                   u.email AS user_email,u.name AS user_name,'workout' AS record_type
                  FROM workout_sessions t LEFT JOIN users u ON t.user_id=u.id ${swF} ORDER BY t.date DESC`,
        nuclear:  `SELECT id,NULL::varchar AS user_id,exercise_type,difficulty,target_reps,completed_reps,time_limit,time_taken,grade,date,
                   NULL::varchar AS user_email,NULL::varchar AS user_name,'workout' AS record_type
                  FROM workout_sessions ORDER BY date DESC`,
      },
      game: {
        primary: `SELECT t.id,t.user_id,t.difficulty,t.stage,t.score,t.target_score,t.completed,t.time_played,t.date,
                   COALESCE(t.user_email,u.email) AS user_email,COALESCE(t.user_name,u.name) AS user_name,'game' AS record_type
                  FROM game_sessions t LEFT JOIN users u ON t.user_id=u.id ${sw} ORDER BY t.date DESC`,
        fallback: `SELECT t.id,t.user_id,t.difficulty,t.stage,t.score,t.target_score,t.completed,t.time_played,t.date,
                   u.email AS user_email,u.name AS user_name,'game' AS record_type
                  FROM game_sessions t LEFT JOIN users u ON t.user_id=u.id ${swF} ORDER BY t.date DESC`,
        nuclear:  `SELECT id,NULL::varchar AS user_id,difficulty,stage,score,target_score,completed,time_played,date,
                   NULL::varchar AS user_email,NULL::varchar AS user_name,'game' AS record_type
                  FROM game_sessions ORDER BY date DESC`,
      },
      boxing: {
        primary: `SELECT t.id,t.user_id,t.difficulty,t.round,t.total_rounds,t.score,t.punches_landed,t.punches_missed,t.dodges_successful,t.dodges_missed,t.blocks_successful,t.blocks_missed,t.completed,t.time_played,t.date,
                   COALESCE(t.user_email,u.email) AS user_email,COALESCE(t.user_name,u.name) AS user_name,'boxing' AS record_type
                  FROM boxing_sessions t LEFT JOIN users u ON t.user_id=u.id ${sw} ORDER BY t.date DESC`,
        fallback: `SELECT t.id,t.user_id,t.difficulty,t.round,t.total_rounds,t.score,t.punches_landed,t.punches_missed,t.dodges_successful,t.dodges_missed,t.blocks_successful,t.blocks_missed,t.completed,t.time_played,t.date,
                   u.email AS user_email,u.name AS user_name,'boxing' AS record_type
                  FROM boxing_sessions t LEFT JOIN users u ON t.user_id=u.id ${swF} ORDER BY t.date DESC`,
        nuclear:  `SELECT id,NULL::varchar AS user_id,difficulty,round,total_rounds,score,punches_landed,punches_missed,dodges_successful,dodges_missed,blocks_successful,blocks_missed,completed,time_played,date,
                   NULL::varchar AS user_email,NULL::varchar AS user_name,'boxing' AS record_type
                  FROM boxing_sessions ORDER BY date DESC`,
      },
    };

    const tablesToQuery = table === "all" ? ["bmi", "workout", "game", "boxing"] : [table];
    const results: unknown[] = [];
    for (const t of tablesToQuery) {
      const q = queries[t];
      if (!q) continue;
      let rows: unknown[] = [];
      try {
        rows = (await pool.query(q.primary, params)).rows;
      } catch {
        try {
          console.warn(`[adminSearch] primary failed for "${t}", trying fallback`);
          rows = (await pool.query(q.fallback, params)).rows;
        } catch {
          try {
            console.warn(`[adminSearch] fallback failed for "${t}", using nuclear`);
            rows = (await pool.query(q.nuclear)).rows;  // nuclear ignores search filter
          } catch (err3) {
            console.error(`[adminSearch] all queries failed for "${t}":`, err3);
          }
        }
      }
      results.push(...rows);
    }
    return results;
  }

  async adminDeleteUser(userId: string): Promise<{ deleted: boolean; recordsRemoved: number }> {
    const { pool } = await import("./db");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let recordsRemoved = 0;
      for (const tbl of ["bmi_entries", "workout_sessions", "game_sessions", "boxing_sessions"]) {
        const r = await client.query(`DELETE FROM ${tbl} WHERE user_id = $1`, [userId]);
        recordsRemoved += r.rowCount ?? 0;
      }
      const r = await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await client.query("COMMIT");
      return { deleted: (r.rowCount ?? 0) > 0, recordsRemoved };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

export const storage = new DatabaseStorage();
