import { db } from "./db";
import {
  entries,
  workoutSessions,
  type CreateEntryRequest,
  type EntryResponse,
  type CreateWorkoutSessionRequest,
  type WorkoutSessionResponse
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Entry methods
  getEntries(): Promise<EntryResponse[]>;
  createEntry(entry: CreateEntryRequest): Promise<EntryResponse>;
  deleteEntry(id: number): Promise<void>;
  
  // Workout session methods
  getWorkoutSessions(): Promise<WorkoutSessionResponse[]>;
  createWorkoutSession(session: CreateWorkoutSessionRequest): Promise<WorkoutSessionResponse>;
  deleteWorkoutSession(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Entry methods
  async getEntries(): Promise<EntryResponse[]> {
    return await db.select().from(entries).orderBy(desc(entries.date));
  }

  async createEntry(entry: CreateEntryRequest): Promise<EntryResponse> {
    const [created] = await db.insert(entries).values(entry).returning();
    return created;
  }

  async deleteEntry(id: number): Promise<void> {
    await db.delete(entries).where(eq(entries.id, id));
  }

  // Workout session methods
  async getWorkoutSessions(): Promise<WorkoutSessionResponse[]> {
    return await db.select().from(workoutSessions).orderBy(desc(workoutSessions.date));
  }

  async createWorkoutSession(session: CreateWorkoutSessionRequest): Promise<WorkoutSessionResponse> {
    const [created] = await db.insert(workoutSessions).values(session).returning();
    return created;
  }

  async deleteWorkoutSession(id: number): Promise<void> {
    await db.delete(workoutSessions).where(eq(workoutSessions.id, id));
  }
}

export const storage = new DatabaseStorage();
