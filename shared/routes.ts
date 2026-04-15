import { z } from 'zod';
import { insertBmiEntrySchema, bmiEntries, insertWorkoutSessionSchema, workoutSessions, insertGameSessionSchema, gameSessions, insertBoxingSessionSchema, boxingSessions } from './schema';

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
  bmiEntries: {
    list: {
      method: 'GET' as const,
      path: '/api/bmi-entries',
      responses: {
        200: z.array(z.custom<typeof bmiEntries.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/bmi-entries',
      input: insertBmiEntrySchema,
      responses: {
        201: z.custom<typeof bmiEntries.$inferSelect>(),
        400: errorSchemas.validation,
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
  boxingSessions: {
    list: {
      method: 'GET' as const,
      path: '/api/boxing-sessions',
      responses: {
        200: z.array(z.custom<typeof boxingSessions.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/boxing-sessions',
      input: insertBoxingSessionSchema,
      responses: {
        201: z.custom<typeof boxingSessions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/boxing-sessions/:id',
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
export type BmiEntryInput = z.infer<typeof api.bmiEntries.create.input>;
export type BmiEntryResponse = z.infer<typeof api.bmiEntries.create.responses[201]>;
export type BmiEntriesListResponse = z.infer<typeof api.bmiEntries.list.responses[200]>;

export type WorkoutSessionInput = z.infer<typeof api.workoutSessions.create.input>;
export type WorkoutSessionResponse = z.infer<typeof api.workoutSessions.create.responses[201]>;
export type WorkoutSessionsListResponse = z.infer<typeof api.workoutSessions.list.responses[200]>;

export type GameSessionInput = z.infer<typeof api.gameSessions.create.input>;
export type GameSessionResponse = z.infer<typeof api.gameSessions.create.responses[201]>;
export type GameSessionsListResponse = z.infer<typeof api.gameSessions.list.responses[200]>;

export type BoxingSessionInput = z.infer<typeof api.boxingSessions.create.input>;
export type BoxingSessionResponse = z.infer<typeof api.boxingSessions.create.responses[201]>;
export type BoxingSessionsListResponse = z.infer<typeof api.boxingSessions.list.responses[200]>;
