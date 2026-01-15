
import { z } from 'zod';
import { insertEntrySchema, entries } from './schema';

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
    // Optional: Get single entry or update if needed later
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
