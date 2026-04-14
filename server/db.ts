
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
    // Add intensity column if missing
    await client.query(`
      ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS intensity integer NOT NULL DEFAULT 2;
    `);
    // Add userId columns to all tables
    await client.query(`
      ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS user_id varchar;
      ALTER TABLE game_sessions    ADD COLUMN IF NOT EXISTS user_id varchar;
      ALTER TABLE boxing_sessions  ADD COLUMN IF NOT EXISTS user_id varchar;
      ALTER TABLE entries          ADD COLUMN IF NOT EXISTS user_id varchar;
    `);
  } catch (err) {
    console.error("[db] Schema migration warning:", err);
  } finally {
    client.release();
  }
}
