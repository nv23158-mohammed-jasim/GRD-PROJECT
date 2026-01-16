import { z } from 'zod';
import { insertEntrySchema, entries, insertWorkoutSessionSchema, workoutSessions, insertGameSessionSchema, gameSessions } from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  entries: {
    list: {
      method: 'GET' as const,
      path: '/api/entries',
      responses: {
        200: z.array(z.custom<typeof entries.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/entries',
      input: insertEntrySchema,
      responses: {
        201: z.custom<typeof entries.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/entries/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  workoutSessions: {
    list: {
      method: 'GET' as const,
      path: '/api/workout-sessions',
      responses: {
        200: z.array(z.custom<typeof workoutSessions.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/workout-sessions',
      input: insertWorkoutSessionSchema,
      responses: {
        201: z.custom<typeof workoutSessions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/workout-sessions/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  gameSessions: {
    list: {
      method: 'GET' as const,
      path: '/api/game-sessions',
      responses: {
        200: z.array(z.custom<typeof gameSessions.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/game-sessions',
      input: insertGameSessionSchema,
      responses: {
        201: z.custom<typeof gameSessions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/game-sessions/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

// ============================================
// REQUIRED: buildUrl helper
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// ============================================
// TYPE HELPERS
// ============================================
export type EntryInput = z.infer<typeof api.entries.create.input>;
export type EntryResponse = z.infer<typeof api.entries.create.responses[201]>;
export type EntriesListResponse = z.infer<typeof api.entries.list.responses[200]>;

export type WorkoutSessionInput = z.infer<typeof api.workoutSessions.create.input>;
export type WorkoutSessionResponse = z.infer<typeof api.workoutSessions.create.responses[201]>;
export type WorkoutSessionsListResponse = z.infer<typeof api.workoutSessions.list.responses[200]>;

export type GameSessionInput = z.infer<typeof api.gameSessions.create.input>;
export type GameSessionResponse = z.infer<typeof api.gameSessions.create.responses[201]>;
export type GameSessionsListResponse = z.infer<typeof api.gameSessions.list.responses[200]>;
