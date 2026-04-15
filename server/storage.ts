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

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | null>;

  // BMI entry methods
  getBmiEntries(userId: string): Promise<BmiEntryResponse[]>;
  createBmiEntry(entry: CreateBmiEntryRequest, userId: string): Promise<BmiEntryResponse>;

  // Workout session methods
  getWorkoutSessions(userId: string): Promise<WorkoutSessionResponse[]>;
  createWorkoutSession(session: CreateWorkoutSessionRequest, userId: string): Promise<WorkoutSessionResponse>;
  deleteWorkoutSession(id: number, userId: string): Promise<void>;

  // Game session methods
  getGameSessions(userId: string): Promise<GameSessionResponse[]>;
  createGameSession(session: CreateGameSessionRequest, userId: string): Promise<GameSessionResponse>;
  deleteGameSession(id: number, userId: string): Promise<void>;

  // Boxing session methods
  getBoxingSessions(userId: string): Promise<BoxingSessionResponse[]>;
  createBoxingSession(session: CreateBoxingSessionRequest, userId: string): Promise<BoxingSessionResponse>;
  deleteBoxingSession(id: number, userId: string): Promise<void>;
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

  async createBmiEntry(entry: CreateBmiEntryRequest, userId: string): Promise<BmiEntryResponse> {
    const [created] = await db.insert(bmiEntries).values({ ...entry, userId }).returning();
    return created;
  }

  // Workout session methods
  async getWorkoutSessions(userId: string): Promise<WorkoutSessionResponse[]> {
    return await db.select().from(workoutSessions)
      .where(eq(workoutSessions.userId, userId))
      .orderBy(desc(workoutSessions.date));
  }

  async createWorkoutSession(session: CreateWorkoutSessionRequest, userId: string): Promise<WorkoutSessionResponse> {
    const [created] = await db.insert(workoutSessions).values({ ...session, userId }).returning();
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

  async createGameSession(session: CreateGameSessionRequest, userId: string): Promise<GameSessionResponse> {
    const [created] = await db.insert(gameSessions).values({ ...session, userId }).returning();
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

  async createBoxingSession(session: CreateBoxingSessionRequest, userId: string): Promise<BoxingSessionResponse> {
    const [created] = await db.insert(boxingSessions).values({ ...session, userId }).returning();
    return created;
  }

  async deleteBoxingSession(id: number, userId: string): Promise<void> {
    await db.delete(boxingSessions).where(and(eq(boxingSessions.id, id), eq(boxingSessions.userId, userId)));
  }
}

export const storage = new DatabaseStorage();
