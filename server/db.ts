
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

// Ensure all required columns exist (safe to run on every startup)
export async function ensureSchema() {
  const client = await pool.connect();
  try {
    // Add intensity column to workout_sessions if missing (added after initial deploy)
    await client.query(`
      ALTER TABLE workout_sessions
        ADD COLUMN IF NOT EXISTS intensity integer NOT NULL DEFAULT 2;
    `);
  } catch (err) {
    console.error("[db] Schema migration warning:", err);
  } finally {
    client.release();
  }
}
