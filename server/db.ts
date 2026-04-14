
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
    // Entries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS entries (
        id serial PRIMARY KEY,
        user_id varchar,
        steps integer NOT NULL,
        calories integer NOT NULL,
        weight decimal(5,2) NOT NULL,
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
    // Add intensity column if missing (for older deployments)
    await client.query(`
      ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS intensity integer NOT NULL DEFAULT 2;
    `);
  } catch (err) {
    console.error("[db] Schema migration warning:", err);
  } finally {
    client.release();
  }
}
