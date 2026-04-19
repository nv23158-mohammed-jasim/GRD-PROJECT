
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Ensure all required tables and columns exist (safe to run on every startup)
export async function ensureSchema() {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id varchar PRIMARY KEY,
        email varchar(255) NOT NULL,
        name varchar(255) NOT NULL,
        picture varchar(500),
        created_at timestamp DEFAULT now() NOT NULL
      );
    `);
    // Sessions table for express-session
    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    // Drop old unused entries table if it still exists
    await client.query(`DROP TABLE IF EXISTS entries;`);
    // BMI entries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bmi_entries (
        id serial PRIMARY KEY,
        user_id varchar NOT NULL,
        age integer NOT NULL,
        height_cm decimal(5,1) NOT NULL,
        weight_kg decimal(5,1) NOT NULL,
        bmi decimal(4,1) NOT NULL,
        category varchar(20) NOT NULL,
        gender varchar(10) NOT NULL,
        activity_level varchar(20) NOT NULL,
        suggested_difficulty varchar(10) NOT NULL,
        date timestamp DEFAULT now() NOT NULL
      );
    `);
    // Workout sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workout_sessions (
        id serial PRIMARY KEY,
        user_id varchar,
        exercise_type varchar(50) NOT NULL,
        difficulty varchar(20) NOT NULL,
        intensity integer NOT NULL DEFAULT 2,
        target_reps integer NOT NULL,
        completed_reps integer NOT NULL,
        time_limit integer NOT NULL,
        time_taken integer NOT NULL,
        grade varchar(10) NOT NULL,
        date timestamp DEFAULT now() NOT NULL
      );
    `);
    // Game sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id serial PRIMARY KEY,
        user_id varchar,
        difficulty varchar(20) NOT NULL,
        stage integer NOT NULL,
        score integer NOT NULL,
        target_score integer NOT NULL,
        completed integer NOT NULL,
        time_played integer NOT NULL,
        date timestamp DEFAULT now() NOT NULL
      );
    `);
    // Boxing sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS boxing_sessions (
        id serial PRIMARY KEY,
        user_id varchar,
        difficulty varchar(20) NOT NULL,
        round integer NOT NULL,
        total_rounds integer NOT NULL,
        score integer NOT NULL,
        punches_landed integer NOT NULL,
        punches_missed integer NOT NULL,
        dodges_successful integer NOT NULL,
        dodges_missed integer NOT NULL,
        blocks_successful integer NOT NULL,
        blocks_missed integer NOT NULL,
        completed integer NOT NULL,
        time_played integer NOT NULL,
        date timestamp DEFAULT now() NOT NULL
      );
    `);
    // Admin audit log table — no FK so entries outlive deleted users
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id serial PRIMARY KEY,
        action varchar(50) NOT NULL DEFAULT 'delete_user',
        admin_id varchar(255) NOT NULL,
        admin_email varchar(255) NOT NULL,
        target_user_id varchar(255) NOT NULL,
        target_user_email varchar(255) NOT NULL,
        target_user_name varchar(255) NOT NULL,
        records_removed integer NOT NULL DEFAULT 0,
        timestamp timestamp NOT NULL DEFAULT now()
      );
    `);
    // Add missing columns for older deployments — each as a SEPARATE query
    const addCols = [
      // user_id may be missing on tables created before auth was added
      `ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS user_id varchar`,
      `ALTER TABLE game_sessions    ADD COLUMN IF NOT EXISTS user_id varchar`,
      `ALTER TABLE boxing_sessions  ADD COLUMN IF NOT EXISTS user_id varchar`,
      // intensity added later to workout_sessions
      `ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS intensity integer NOT NULL DEFAULT 2`,
      // user_email / user_name for admin panel backfill
      `ALTER TABLE bmi_entries      ADD COLUMN IF NOT EXISTS user_email varchar(255)`,
      `ALTER TABLE bmi_entries      ADD COLUMN IF NOT EXISTS user_name  varchar(255)`,
      `ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS user_email varchar(255)`,
      `ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS user_name  varchar(255)`,
      `ALTER TABLE game_sessions    ADD COLUMN IF NOT EXISTS user_email varchar(255)`,
      `ALTER TABLE game_sessions    ADD COLUMN IF NOT EXISTS user_name  varchar(255)`,
      `ALTER TABLE boxing_sessions  ADD COLUMN IF NOT EXISTS user_email varchar(255)`,
      `ALTER TABLE boxing_sessions  ADD COLUMN IF NOT EXISTS user_name  varchar(255)`,
    ];
    for (const q of addCols) await client.query(q).catch(err => console.error("[ensureSchema] col add failed:", q, err));

    // Backfill — correlated subquery avoids JOIN mismatch issues
    const backfillTables = ["bmi_entries", "workout_sessions", "game_sessions", "boxing_sessions"];
    for (const t of backfillTables) {
      await client.query(`
        UPDATE ${t}
        SET
          user_email = (SELECT email FROM users WHERE CAST(id AS TEXT) = CAST(${t}.user_id AS TEXT) LIMIT 1),
          user_name  = (SELECT name  FROM users WHERE CAST(id AS TEXT) = CAST(${t}.user_id AS TEXT) LIMIT 1)
        WHERE user_email IS NULL OR user_name IS NULL
      `).catch(err => console.error(`[ensureSchema] backfill failed for ${t}:`, err));
    }
  } catch (err) {
    console.error("[db] Schema migration warning:", err);
  } finally {
    client.release();
  }
}
