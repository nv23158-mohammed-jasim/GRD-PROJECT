import { db } from "./db";
import {
  entries,
  workoutSessions,
  gameSessions,
  specialSessions,
  type CreateEntryRequest,
  type EntryResponse,
  type CreateWorkoutSessionRequest,
  type WorkoutSessionResponse,
  type CreateGameSessionRequest,
  type GameSessionResponse,
  type CreateSpecialSessionRequest,
  type SpecialSessionResponse
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
  
  // Game session methods
  getGameSessions(): Promise<GameSessionResponse[]>;
  createGameSession(session: CreateGameSessionRequest): Promise<GameSessionResponse>;
  deleteGameSession(id: number): Promise<void>;
  
  // Special session methods
  getSpecialSessions(): Promise<SpecialSessionResponse[]>;
  createSpecialSession(session: CreateSpecialSessionRequest): Promise<SpecialSessionResponse>;
  deleteSpecialSession(id: number): Promise<void>;
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

  // Game session methods
  async getGameSessions(): Promise<GameSessionResponse[]> {
    return await db.select().from(gameSessions).orderBy(desc(gameSessions.date));
  }

  async createGameSession(session: CreateGameSessionRequest): Promise<GameSessionResponse> {
    const [created] = await db.insert(gameSessions).values(session).returning();
    return created;
  }

  async deleteGameSession(id: number): Promise<void> {
    await db.delete(gameSessions).where(eq(gameSessions.id, id));
  }

  // Special session methods
  async getSpecialSessions(): Promise<SpecialSessionResponse[]> {
    return await db.select().from(specialSessions).orderBy(desc(specialSessions.date));
  }

  async createSpecialSession(session: CreateSpecialSessionRequest): Promise<SpecialSessionResponse> {
    const [created] = await db.insert(specialSessions).values(session).returning();
    return created;
  }

  async deleteSpecialSession(id: number): Promise<void> {
    await db.delete(specialSessions).where(eq(specialSessions.id, id));
  }
}

export const storage = new DatabaseStorage();
