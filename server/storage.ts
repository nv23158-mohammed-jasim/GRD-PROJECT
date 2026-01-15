
import { db } from "./db";
import {
  entries,
  type CreateEntryRequest,
  type EntryResponse
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getEntries(): Promise<EntryResponse[]>;
  createEntry(entry: CreateEntryRequest): Promise<EntryResponse>;
  deleteEntry(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
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
}

export const storage = new DatabaseStorage();
